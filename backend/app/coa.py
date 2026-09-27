"""COA operational APIs built on the existing NEXORA datasets and engines."""
import os
import shutil
import tempfile
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.optimizer import run_optimization
from app.rl_agent import agent as rl_agent, TRAFFIC_LEVELS, BACKLOG_LEVELS
from app.db import get_request, select_option, get_conn

router = APIRouter(prefix="/api/coa", tags=["COA"])
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

TASK_FILES = {
    "TMS": "TMS_MAINTENANCE.csv",
    "SMMS": "SMMS_MAINTENANCE.csv",
    "TDMS": "TDMS_MAINTENANCE.csv",
}


def _tasks() -> pd.DataFrame:
    frames = []
    for source, filename in TASK_FILES.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            df = pd.read_csv(path)
            df["source"] = source
            frames.append(df)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True, sort=False).fillna("")


def _assets() -> pd.DataFrame:
    return pd.read_csv(os.path.join(DATA_DIR, "ASSETS.csv")).fillna("")


def _blocks() -> pd.DataFrame:
    return pd.read_csv(os.path.join(DATA_DIR, "COA_BLOCK_AVAILABILITY.csv")).fillna("")


def _backlog_level() -> str:
    tasks = _tasks()
    pending = int(tasks["status"].isin(["Pending", "Scheduled"]).sum()) if not tasks.empty else 0
    if pending >= 80:
        return "High"
    if pending >= 40:
        return "Med"
    return "Low"


def _copy_optimizer_data(dst: str) -> None:
    for name in (*TASK_FILES.values(), "COA_BLOCK_AVAILABILITY.csv"):
        shutil.copy2(os.path.join(DATA_DIR, name), os.path.join(dst, name))


def _status_availability(status: str, target: float) -> float:
    """Derive an operational availability estimate from the existing status.
    The source register stores an availability target, not a live percentage.
    """
    multipliers = {"Normal": 1.0, "Degraded": 0.65, "Critical": 0.35}
    return round(max(0.0, min(100.0, float(target) * multipliers.get(str(status), 0.5))), 1)


def _level(value: float, labels=("Low", "Medium", "High", "Very High", "Critical")) -> str:
    idx = max(0, min(4, int(round(value)) - 1))
    return labels[idx]


def _deadline_pressure(due_date: str, reference: str) -> tuple[int, int]:
    try:
        days = (pd.to_datetime(due_date).date() - pd.to_datetime(reference).date()).days
    except Exception:
        days = 30
    if days <= 0:
        pressure = 5
    elif days <= 2:
        pressure = 4
    elif days <= 5:
        pressure = 3
    elif days <= 10:
        pressure = 2
    else:
        pressure = 1
    return pressure, days


def _priority_row(task: pd.Series, asset: Optional[pd.Series], blocks: pd.DataFrame, reference: str) -> Dict[str, Any]:
    criticality = int(task.get("criticality", 0) or 0)
    urgency = int(task.get("urgency", 0) or 0)
    safety = int(task.get("safety_risk", 0) or 0)
    asset_criticality = int(asset.get("asset_criticality", criticality) or criticality) if asset is not None else criticality
    failure_risk = float(asset.get("failure_risk", 0) or 0) if asset is not None else 0.0
    status = str(asset.get("current_status", "Unknown")) if asset is not None else "Unknown"
    target = float(asset.get("availability_target_pct", 0) or 0) if asset is not None else 0.0
    availability = _status_availability(status, target) if asset is not None else None
    availability_pressure = max(0.0, min(5.0, (100.0 - availability) / 20.0)) if availability is not None else 0.0
    condition_pressure = max(0.0, min(5.0, failure_risk * 5.0 + ({"Critical": 1.0, "Degraded": 0.5}.get(status, 0.0))))

    corridor_blocks = blocks[blocks["corridor_id"].astype(str) == str(task.get("corridor_id", ""))]
    conflict_count = int(corridor_blocks["train_conflict_count"].max()) if not corridor_blocks.empty else 0
    delay_impact = max(1, min(5, urgency + (1 if conflict_count >= 6 else 0) + (1 if conflict_count >= 9 else 0)))
    deadline, days_to_due = _deadline_pressure(str(task.get("due_date", "")), reference)
    operational = max(1, min(5, round((criticality + asset_criticality) / 2)))

    weights = {
        "severity": 18, "urgency": 16, "safety_impact": 20, "equipment_criticality": 14,
        "operational_impact": 10, "delay_impact": 8, "deadline_pressure": 6,
        "equipment_availability": 4, "condition": 4,
    }
    values = {
        "severity": criticality, "urgency": urgency, "safety_impact": safety,
        "equipment_criticality": asset_criticality, "operational_impact": operational,
        "delay_impact": delay_impact, "deadline_pressure": deadline,
        "equipment_availability": availability_pressure, "condition": condition_pressure,
    }
    breakdown = {key: round(weights[key] * values[key] / 5.0, 1) for key in weights}
    total = round(sum(breakdown.values()))
    level = "CRITICAL" if total >= 80 else "HIGH" if total >= 65 else "MEDIUM" if total >= 45 else "LOW"

    reasons = []
    if safety >= 4: reasons.append("Safety impact is high based on the task safety-risk score.")
    if urgency >= 4: reasons.append("Urgency is high in the maintenance record.")
    if asset_criticality >= 4: reasons.append("The equipment is operationally critical.")
    if availability is not None and availability < 60: reasons.append("Equipment availability is critically low from its current register status and target.")
    elif availability is not None and availability < 80: reasons.append("Equipment availability is reduced.")
    if failure_risk >= 0.6: reasons.append("Recorded equipment failure risk is elevated.")
    if days_to_due <= 0: reasons.append("The maintenance deadline is due or overdue.")
    elif days_to_due <= 5: reasons.append("The maintenance deadline is approaching.")
    if conflict_count >= 6: reasons.append("The corridor has material train-conflict pressure in available blocks.")
    if not reasons: reasons.append("The score is driven by the task's recorded maintenance risk and deadline inputs.")

    return {
        "task_id": str(task.get("task_id", "")), "source": str(task.get("source", "")),
        "asset_id": str(task.get("asset_id", "")), "corridor_id": str(task.get("corridor_id", "")),
        "defect_type": str(task.get("defect_type", "")), "maintenance_type": str(task.get("maintenance_type", "")),
        "status": str(task.get("status", "")), "due_date": str(task.get("due_date", "")),
        "days_to_due": days_to_due, "overdue_days": int(task.get("overdue_days", 0) or 0),
        "crew_required": int(task.get("crew_required", 0) or 0),
        "estimated_duration_min": int(task.get("estimated_duration_min", 0) or 0),
        "factors": {
            "severity": criticality, "severity_label": _level(criticality),
            "urgency": urgency, "urgency_label": _level(urgency),
            "safety_impact": safety, "safety_label": _level(safety),
            "equipment_criticality": asset_criticality, "equipment_criticality_label": _level(asset_criticality),
            "operational_impact": operational, "operational_impact_label": _level(operational),
            "delay_impact": delay_impact, "delay_impact_label": _level(delay_impact),
            "deadline_pressure": deadline, "deadline_pressure_label": _level(deadline),
            "equipment_availability_pct": availability,
            "equipment_availability_pressure": round(availability_pressure, 2),
            "condition": round(condition_pressure, 2), "condition_label": _level(condition_pressure),
            "failure_risk": failure_risk, "equipment_status": status,
            "corridor_conflict_count": conflict_count,
        },
        "breakdown": breakdown,
        "priority_score": total, "priority_level": level, "reasons": reasons,
    }


@router.get("/overview")
def coa_overview():
    assets, blocks, tasks = _assets(), _blocks(), _tasks()
    return {
        "assets": assets.to_dict("records"), "blocks": blocks.to_dict("records"), "tasks": tasks.to_dict("records"),
        "kpis": {
            "assets": len(assets), "available_blocks": int((blocks["status"] == "Available").sum()),
            "booked_blocks": int((blocks["status"] == "Booked").sum()),
            "pending_tasks": int(tasks["status"].isin(["Pending", "Scheduled"]).sum()),
            "critical_tasks": int((tasks["criticality"] >= 4).sum()), "backlog_level": _backlog_level(),
        },
    }


@router.get("/equipment")
def coa_equipment(status: Optional[str] = None, search: Optional[str] = None):
    assets, tasks, blocks = _assets(), _tasks(), _blocks()
    result = []
    for _, a in assets.iterrows():
        aid = str(a["asset_id"])
        history = tasks[tasks["asset_id"].astype(str) == aid]
        open_tasks = history[history["status"].isin(["Pending", "Scheduled", "In Progress"])]
        scheduled = history[history["status"] == "Scheduled"]
        avail = _status_availability(str(a["current_status"]), float(a["availability_target_pct"]))
        maintenance_status = "Under Maintenance" if str(a["current_status"]) == "Critical" else ("Due / Overdue" if str(a["next_due_date"]) <= date.today().isoformat() else "Planned")
        if len(open_tasks) == 0: maintenance_status = "Clear" if maintenance_status == "Planned" else maintenance_status
        assignments = [str(x) for x in scheduled["task_id"].head(3).tolist()]
        corridor_blocks = blocks[blocks["corridor_id"].astype(str) == str(a["corridor_id"])]
        current_block = corridor_blocks[corridor_blocks["status"] == "Booked"].iloc[0]["block_id"] if not corridor_blocks[corridor_blocks["status"] == "Booked"].empty else ""
        workload_util = round(min(100.0, len(open_tasks) / max(1, len(history)) * 100.0), 1) if len(history) else 0.0
        row = {
            "equipment_id": aid, "equipment_type": str(a["asset_type"]), "department": str(a["department"]),
            "availability_pct": avail, "availability_basis": "Derived from asset register target + current status",
            "availability_state": "Available" if avail >= 80 else "Reduced" if avail >= 50 else "Unavailable",
            "current_status": str(a["current_status"]), "condition": round((1-float(a["failure_risk"])) * 100, 1),
            "maintenance_status": maintenance_status, "current_assignment": assignments,
            "block": current_block or None, "corridor_id": str(a["corridor_id"]), "location_km": float(a["location_km"]),
            "last_maintenance": str(a["last_maintenance_date"]), "next_maintenance": str(a["next_due_date"]),
            "criticality": int(a["asset_criticality"]), "failure_risk": float(a["failure_risk"]),
            "workload_utilization_pct": workload_util, "open_task_count": int(len(open_tasks)),
        }
        if status and status != "ALL":
            wanted = status.lower()
            if wanted == "available" and row["availability_state"] != "Available": continue
            if wanted == "in use" and not row["current_assignment"]: continue
            if wanted == "under maintenance" and row["maintenance_status"] != "Under Maintenance": continue
            if wanted == "unavailable" and row["availability_state"] != "Unavailable": continue
            if wanted == "critical" and row["criticality"] < 4: continue
        if search and search.lower() not in f"{aid} {a['asset_type']} {a['corridor_id']}".lower(): continue
        result.append(row)
    return result


@router.get("/priority")
def coa_priority(reference_date: Optional[str] = None, limit: int = Query(250, ge=1, le=1000)):
    ref = reference_date or date.today().isoformat()
    assets = _assets().set_index("asset_id")
    tasks, blocks = _tasks(), _blocks()
    rows = []
    for _, task in tasks.iterrows():
        if str(task.get("status", "")) not in {"Pending", "Scheduled", "In Progress"}:
            continue
        asset = assets.loc[str(task["asset_id"])] if str(task["asset_id"]) in assets.index else None
        rows.append(_priority_row(task, asset, blocks, ref))
    rows.sort(key=lambda x: (x["priority_score"], x["overdue_days"]), reverse=True)
    for i, row in enumerate(rows, 1): row["rank"] = i
    distribution = {k: sum(1 for r in rows if r["priority_level"] == k) for k in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]}
    return {"reference_date": ref, "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z", "tasks": rows[:limit], "distribution": distribution, "total": len(rows)}


@router.get("/reports/plans")
def coa_plan_report(view: str = Query("daily"), selected_date: Optional[str] = None, week_start: Optional[str] = None, month: Optional[str] = None):
    """Generate daily/weekly/monthly operational plans from the real task/block pool."""
    optimization = run_optimization(DATA_DIR, max_tasks=150, max_blocks=150, time_limit_sec=10)
    scheduled = pd.DataFrame(optimization.get("scheduled", []))
    tasks = _tasks()
    blocks = _blocks()
    if scheduled.empty:
        scheduled = pd.DataFrame(columns=["task_id", "date", "block_id"])
    if not scheduled.empty:
        scheduled = scheduled.merge(tasks[["task_id", "asset_id", "crew_required", "status", "maintenance_type"]], on="task_id", how="left")
        scheduled = scheduled.merge(blocks[["block_id", "status", "allowed_departments"]].rename(columns={"status":"block_status"}), on="block_id", how="left")
        scheduled["equipment"] = scheduled["asset_id"]
        scheduled["priority_level"] = scheduled["priority_score"].apply(lambda s: "CRITICAL" if s >= 80 else "HIGH" if s >= 65 else "MEDIUM" if s >= 45 else "LOW")
        scheduled["conflict"] = scheduled["train_conflict_count"].fillna(0).astype(int) > 6
    if view == "daily":
        target = selected_date or date.today().isoformat()
        if not scheduled.empty: scheduled = scheduled[scheduled["date"] == target]
        period = target
    elif view == "weekly":
        start = pd.to_datetime(week_start or date.today().isoformat()).date()
        start = start - timedelta(days=start.weekday())
        end = start + timedelta(days=6)
        if not scheduled.empty:
            scheduled = scheduled[(pd.to_datetime(scheduled["date"]).dt.date >= start) & (pd.to_datetime(scheduled["date"]).dt.date <= end)]
        period = {"start": start.isoformat(), "end": end.isoformat()}
    elif view == "monthly":
        target = month or date.today().strftime("%Y-%m")
        if not scheduled.empty: scheduled = scheduled[pd.to_datetime(scheduled["date"]).dt.strftime("%Y-%m") == target]
        period = target
    else:
        raise HTTPException(400, "view must be daily, weekly, or monthly")

    rows = scheduled.fillna("").to_dict("records") if not scheduled.empty else []
    all_blocks = blocks
    if view == "monthly":
        month_blocks = all_blocks[pd.to_datetime(all_blocks["date"]).dt.strftime("%Y-%m") == str(period)]
    elif view == "weekly":
        month_blocks = all_blocks[(pd.to_datetime(all_blocks["date"]).dt.date >= pd.to_datetime(period["start"]).date()) & (pd.to_datetime(all_blocks["date"]).dt.date <= pd.to_datetime(period["end"]).date())]
    else:
        month_blocks = all_blocks[all_blocks["date"] == str(period)]
    task_ids = set(scheduled["task_id"].tolist()) if not scheduled.empty else set()
    pending_in_period = int(len(task_ids))
    return {
        "view": view, "period": period, "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "rows": rows, "kpis": {
            "planned_tasks": len(rows), "high_priority": int(sum(r.get("priority_level") in {"HIGH", "CRITICAL"} for r in rows)),
            "completed": int(sum(r.get("status") == "Completed" for r in rows)), "pending": int(sum(r.get("status") != "Completed" for r in rows)),
            "conflicts": int(sum(bool(r.get("conflict")) for r in rows)), "available_blocks": int((month_blocks["status"] == "Available").sum()),
            "booked_blocks": int((month_blocks["status"] == "Booked").sum()), "maintenance_workload_min": int(sum(r.get("estimated_duration_min", 0) for r in rows)),
            "blocks_in_period": len(month_blocks), "equipment_involved": len(set(r.get("equipment") for r in rows if r.get("equipment"))),
        },
        "block_utilization": month_blocks.groupby("corridor_id").size().reset_index(name="blocks").to_dict("records") if not month_blocks.empty else [],
        "source_kpis": optimization.get("kpis", {}),
        "unscheduled_count": int(optimization.get("kpis", {}).get("unscheduled_count", 0)),
    }


@router.post("/what-if")
def coa_what_if(payload: Dict[str, Any]):
    scenario, value = payload.get("scenario", "block_unavailable"), payload.get("value")
    with tempfile.TemporaryDirectory(prefix="nexora_coa_whatif_") as tmp:
        _copy_optimizer_data(tmp)
        blocks_path = os.path.join(tmp, "COA_BLOCK_AVAILABILITY.csv")
        if scenario == "block_unavailable":
            if not value: raise HTTPException(400, "Select a block.")
            blocks = pd.read_csv(blocks_path)
            if value not in blocks["block_id"].values: raise HTTPException(404, "Block not found.")
            blocks.loc[blocks["block_id"] == value, "status"] = "Locked"; blocks.to_csv(blocks_path, index=False)
        elif scenario == "equipment_unavailable":
            if not value: raise HTTPException(400, "Select an equipment/asset.")
            for fname in TASK_FILES.values():
                p = os.path.join(tmp, fname); df = pd.read_csv(p); mask = df["asset_id"].astype(str) == str(value)
                if mask.any(): df.loc[mask, "estimated_duration_min"] = 999999
                df.to_csv(p, index=False)
        elif scenario == "duration_increase":
            try: pct = max(0, min(200, float(value)))
            except Exception: raise HTTPException(400, "Duration increase must be numeric.")
            for fname in TASK_FILES.values():
                p = os.path.join(tmp, fname); df = pd.read_csv(p); df["estimated_duration_min"] = (df["estimated_duration_min"] * (1+pct/100)).round().astype(int); df.to_csv(p,index=False)
        elif scenario == "equipment_availability_reduced":
            if not value: raise HTTPException(400, "Select an equipment/asset.")
            try: pct = max(1, min(99, float(payload.get("reduction_pct", 50))))
            except Exception: raise HTTPException(400, "Availability reduction must be numeric.")
            for fname in TASK_FILES.values():
                p = os.path.join(tmp, fname); df = pd.read_csv(p); mask = df["asset_id"].astype(str) == str(value)
                if mask.any(): df.loc[mask, "estimated_duration_min"] = (df.loc[mask, "estimated_duration_min"] * (1 + pct/100)).round().astype(int)
                df.to_csv(p,index=False)
        elif scenario == "resource_unavailable":
            resource = str(value or "").strip()
            source_by_resource = {"Engineering":"TMS", "Signal":"SMMS", "Traction":"TDMS"}
            source = source_by_resource.get(resource, resource.upper())
            if source not in TASK_FILES: raise HTTPException(400, "Select Engineering, Signal, or Traction resources.")
            p = os.path.join(tmp, TASK_FILES[source]); df = pd.read_csv(p); df["estimated_duration_min"] = 999999; df.to_csv(p,index=False)
        elif scenario == "deadline_change":
            try: shift = int(float(value))
            except Exception: raise HTTPException(400, "Deadline change must be an integer number of days.")
            reference = date.today()
            for fname in TASK_FILES.values():
                p = os.path.join(tmp, fname); df = pd.read_csv(p); due = pd.to_datetime(df["due_date"], errors="coerce") + pd.to_timedelta(shift, unit="D"); df["due_date"] = due.dt.strftime("%Y-%m-%d"); df["overdue_days"] = (pd.Timestamp(reference) - due).dt.days.clip(lower=0).fillna(0).astype(int); df.to_csv(p,index=False)
        elif scenario == "block_capacity":
            try: pct = max(-80, min(100, float(value)))
            except Exception: raise HTTPException(400, "Capacity change must be numeric.")
            blocks = pd.read_csv(blocks_path); blocks["duration_min"] = (blocks["duration_min"]*(1+pct/100)).round().clip(lower=1).astype(int); blocks.to_csv(blocks_path,index=False)
        elif scenario == "high_priority_request":
            p=os.path.join(tmp,TASK_FILES["TMS"]); df=pd.read_csv(p)
            if df.empty: raise HTTPException(400,"No maintenance tasks available.")
            base=df.iloc[0].copy(); base["task_id"]="COA-WHATIF-001"; base["criticality"]=5; base["urgency"]=5; base["safety_risk"]=5; base["overdue_days"]=max(int(base.get("overdue_days",0)),10); base["status"]="Pending"; pd.concat([df,pd.DataFrame([base])],ignore_index=True).to_csv(p,index=False)
        else: raise HTTPException(400,"Unsupported scenario.")
        baseline, scenario_result = run_optimization(DATA_DIR, max_tasks=150, max_blocks=150), run_optimization(tmp, max_tasks=150, max_blocks=150)
    bb={x["block_id"] for x in baseline.get("scheduled",[])}; sb={x["block_id"] for x in scenario_result.get("scheduled",[])}
    bt={x["task_id"] for x in baseline.get("scheduled",[])}; st={x["task_id"] for x in scenario_result.get("scheduled",[])}
    return {"scenario":scenario,"value":value,"baseline":baseline,"what_if":scenario_result,"impact":{"affected_blocks":sorted(bb.symmetric_difference(sb)),"newly_scheduled_tasks":sorted(st-bt),"affected_tasks":sorted(bt.symmetric_difference(st)),"unscheduled_tasks_delta":scenario_result["kpis"]["unscheduled_count"]-baseline["kpis"]["unscheduled_count"],"scheduled_count_delta":scenario_result["kpis"]["scheduled_count"]-baseline["kpis"]["scheduled_count"],"priority_pct_delta":round(scenario_result["kpis"]["total_priority_pct"]-baseline["kpis"]["total_priority_pct"],1)}}


@router.get("/reports")
def coa_reports(report_type: str = "maintenance"):
    smms = pd.read_csv(os.path.join(DATA_DIR, "SMMS_MAINTENANCE.csv")); assets = _assets(); problems_path=os.path.join(DATA_DIR,"SMMS_PROBLEM_REPORTS.csv"); problems=pd.read_csv(problems_path) if os.path.exists(problems_path) else pd.DataFrame(); network=pd.read_csv(os.path.join(DATA_DIR,"RAILWAY_NETWORK.csv"))
    if report_type=="maintenance": rows=smms
    elif report_type=="asset_health": rows=assets
    elif report_type=="problem": rows=problems
    elif report_type=="corridor_health":
        rows=assets.groupby("corridor_id").agg(asset_count=("asset_id","count"),avg_failure_risk=("failure_risk","mean"),critical_assets=("current_status",lambda s:int((s=="Critical").sum()))).reset_index().merge(network[["corridor_id","station_from","station_to"]],on="corridor_id",how="left"); rows["avg_failure_risk"]=rows["avg_failure_risk"].round(3)
    elif report_type=="daily_failure": rows=smms[smms["overdue_days"]>0].copy(); rows=rows if not rows.empty else smms.head(25)
    else: raise HTTPException(400,"Unsupported report type.")
    return rows.fillna("").to_dict("records")


@router.post("/plan-feedback")
def coa_plan_feedback(payload: Dict[str, Any]):
    request_id=int(payload.get("request_id",0)); option=int(payload.get("option",0)); decision=str(payload.get("decision","")).lower()
    if decision not in {"approve","disapprove"}: raise HTTPException(400,"decision must be approve or disapprove")
    req=get_request(request_id)
    if not req: raise HTTPException(404,"Maintenance request not found.")
    candidate=next((c for c in req.get("candidates",[]) if int(c["option"])==option),None)
    if not candidate: raise HTTPException(404,"Plan option not found.")
    traffic=candidate.get("traffic_level","Med"); traffic=traffic if traffic in TRAFFIC_LEVELS else "Med"; backlog=_backlog_level(); rec=rl_agent.recommend(traffic,backlog); action=rec["recommended_action"]; reward=10.0 if decision=="approve" else -10.0; old_q=rl_agent.q[(traffic,backlog)][action]; rl_agent.q[(traffic,backlog)][action]=round(old_q+rl_agent.alpha*reward,4); rl_agent.reward_history.append(reward)
    updated=None
    if decision=="approve":
        block_id=candidate.get("block_id",""); path=os.path.join(DATA_DIR,"COA_BLOCK_AVAILABILITY.csv"); blocks=pd.read_csv(path); match=blocks["block_id"].astype(str)==str(block_id)
        if not match.any(): raise HTTPException(404,"Selected block not found.")
        if str(blocks.loc[match,"status"].iloc[0])!="Available": raise HTTPException(400,"Selected block is no longer available.")
        blocks.loc[match,"status"]="Booked"; blocks.to_csv(path,index=False); updated=select_option(request_id,option,block_id)
    else:
        conn=get_conn()
        try: conn.execute("UPDATE maintenance_requests SET status = 'Disapproved', updated_at = datetime('now') WHERE id = ?",(request_id,)); conn.commit()
        finally: conn.close()
        updated=get_request(request_id)
    return {"ok":True,"decision":decision,"reward":reward,"state":{"traffic_level":traffic,"backlog_level":backlog},"action":action,"q_value_before":round(old_q,4),"q_value_after":rl_agent.q[(traffic,backlog)][action],"request":updated or req}
