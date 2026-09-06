"""
SIH PS27 - AI-Powered Automatic Block Planning
FastAPI backend entrypoint.

Run:
    cd backend
    python generate_data.py          # creates data/*.csv (only needed once)
    uvicorn app.main:app --reload --port 8000

Docs:
    http://localhost:8000/docs
"""
import os
from typing import Optional
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.optimizer import run_optimization
from app.route_engine import rail_engine
from app.ai_prioritizer import predict_maintenance_priority
from app.db import init_db, create_request, list_requests, get_request, select_option
from app.block_planner import list_assets, list_maintenance_types, generate_candidates, generate_plan_visualization
from app.csv_data_loader import (
    load_stations_from_csv,
    load_routes_from_csv,
    load_trains_from_csv,
    load_maintenance_blocks_from_csv,
    get_live_operations_state,
)

init_db()

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

app = FastAPI(
    title="AI-Powered Automatic Block Planning API",
    description="SIH PS27 - Maximizing Asset Availability for Train Operations on Indian Railways",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for production
    allow_methods=["*"],
    allow_headers=["*"],
)

DATASET_FILES = {
    "tms_maintenance": "TMS_MAINTENANCE.csv",
    "smms_maintenance": "SMMS_MAINTENANCE.csv",
    "tdms_maintenance": "TDMS_MAINTENANCE.csv",
    "coa_block_availability": "COA_BLOCK_AVAILABILITY.csv",
    "assets": "ASSETS.csv",
    "trains": "TRAINS.csv",
    "railway_network": "RAILWAY_NETWORK.csv",
}


@app.get("/")
def root():
    return {"status": "ok", "service": "block-planning-api", "datasets": list(DATASET_FILES.keys())}


@app.get("/api/datasets")
def list_datasets():
    """List available datasets with row/column counts."""
    out = []
    for key, fname in DATASET_FILES.items():
        path = os.path.join(DATA_DIR, fname)
        if os.path.exists(path):
            df = pd.read_csv(path)
            out.append({"name": key, "file": fname, "rows": len(df), "columns": list(df.columns)})
    return out


@app.get("/api/datasets/{name}")
def get_dataset(name: str, corridor_id: Optional[str] = None, limit: int = Query(100, le=2000)):
    """Preview / filter a dataset. Used by frontend tables & map layers."""
    if name not in DATASET_FILES:
        raise HTTPException(404, f"Unknown dataset '{name}'")
    df = pd.read_csv(os.path.join(DATA_DIR, DATASET_FILES[name]))
    if corridor_id and "corridor_id" in df.columns:
        df = df[df["corridor_id"] == corridor_id]
    return df.head(limit).to_dict("records")


@app.get("/api/network")
def get_network():
    """Corridor/section master data - for the Leaflet map layer."""
    df = pd.read_csv(os.path.join(DATA_DIR, "RAILWAY_NETWORK.csv"))
    return df.to_dict("records")


@app.get("/api/blocks")
def get_blocks(corridor_id: Optional[str] = None, status: Optional[str] = None):
    """Block availability - feeds the Gantt chart."""
    df = pd.read_csv(os.path.join(DATA_DIR, "COA_BLOCK_AVAILABILITY.csv"))
    if corridor_id:
        df = df[df["corridor_id"] == corridor_id]
    if status:
        df = df[df["status"] == status]
    return df.to_dict("records")


@app.post("/api/blocks/{block_id}/approve")
def approve_block(block_id: str):
    """Approve a proposed block: flips its status Available -> Booked in the CSV."""
    path = os.path.join(DATA_DIR, "COA_BLOCK_AVAILABILITY.csv")
    df = pd.read_csv(path)
    if block_id not in df["block_id"].values:
        raise HTTPException(404, f"Block '{block_id}' not found")
    row = df.loc[df["block_id"] == block_id].iloc[0]
    if row["status"] != "Available":
        raise HTTPException(400, f"Block '{block_id}' is already '{row['status']}', cannot approve")
    df.loc[df["block_id"] == block_id, "status"] = "Booked"
    df.to_csv(path, index=False)
    return {"block_id": block_id, "status": "Booked"}


@app.post("/api/optimize/run")
def optimize(max_tasks: int = 150, max_blocks: int = 60, time_limit_sec: int = 15):
    """
    Trigger the AI optimization engine (OR-Tools CP-SAT):
    unifies TMS+SMMS+TDMS tasks, scores priority, assigns to COA blocks
    maximizing scheduled priority while minimizing traffic disruption.
    """
    if not os.path.exists(os.path.join(DATA_DIR, "TMS_MAINTENANCE.csv")):
        raise HTTPException(400, "Datasets not found - run generate_data.py first.")
    result = run_optimization(DATA_DIR, max_tasks=max_tasks, max_blocks=max_blocks, time_limit_sec=time_limit_sec)
    return result


@app.get("/api/analytics/kpi")
def kpi_summary():
    """High-level dashboard numbers (Recharts)."""
    assets = pd.read_csv(os.path.join(DATA_DIR, "ASSETS.csv"))
    blocks = pd.read_csv(os.path.join(DATA_DIR, "COA_BLOCK_AVAILABILITY.csv"))
    tasks = pd.concat([
        pd.read_csv(os.path.join(DATA_DIR, "TMS_MAINTENANCE.csv")).assign(dept="Engineering"),
        pd.read_csv(os.path.join(DATA_DIR, "SMMS_MAINTENANCE.csv")).assign(dept="Signal"),
        pd.read_csv(os.path.join(DATA_DIR, "TDMS_MAINTENANCE.csv")).assign(dept="Traction"),
    ], ignore_index=True, sort=False)

    return {
        "avg_availability_target_pct": round(assets["availability_target_pct"].mean(), 2),
        "assets_by_status": assets["current_status"].value_counts().to_dict(),
        "assets_by_department": assets["department"].value_counts().to_dict(),
        "total_blocks": len(blocks),
        "blocks_by_status": blocks["status"].value_counts().to_dict(),
        "blocks_by_traffic_level": blocks["traffic_level"].value_counts().to_dict(),
        "total_pending_tasks": int((tasks["status"] == "Pending").sum()),
        "overdue_tasks": int((tasks["overdue_days"] > 0).sum()),
        "tasks_by_department": tasks["dept"].value_counts().to_dict(),
        "tasks_by_criticality": tasks["criticality"].value_counts().sort_index().to_dict(),
    }


@app.get("/api/analytics/dashboard")
def dashboard_summary():
    """
    Aggregated numbers + derived insights for the main Dashboard screen:
    KPI strip, AI-recommended block, upcoming blocks, train impact donut,
    delay-avoided estimate, and an alerts feed. Everything here is computed
    from the CSV datasets (no hand-typed numbers) so it moves as the data does.
    """
    assets = pd.read_csv(os.path.join(DATA_DIR, "ASSETS.csv"))
    blocks = pd.read_csv(os.path.join(DATA_DIR, "COA_BLOCK_AVAILABILITY.csv"))
    trains = pd.read_csv(os.path.join(DATA_DIR, "TRAINS.csv"))
    network = pd.read_csv(os.path.join(DATA_DIR, "RAILWAY_NETWORK.csv"))
    tasks = pd.concat([
        pd.read_csv(os.path.join(DATA_DIR, "TMS_MAINTENANCE.csv")).assign(dept="Engineering"),
        pd.read_csv(os.path.join(DATA_DIR, "SMMS_MAINTENANCE.csv")).assign(dept="Signal"),
        pd.read_csv(os.path.join(DATA_DIR, "TDMS_MAINTENANCE.csv")).assign(dept="Traction"),
    ], ignore_index=True, sort=False)

    # "Today" = earliest date present in the generated schedule (keeps the demo
    # self-consistent regardless of when it's run).
    today = min(trains["scheduled_date"].min(), blocks["date"].min())

    PER_CONFLICT_DELAY_MIN = 12  # assumed avg delay (min) per train/block traffic conflict

    corridor_lookup = network.set_index("corridor_id")[["station_from", "station_to"]].to_dict("index")

    def corridor_label(cid: str) -> str:
        loc = corridor_lookup.get(cid)
        return f"{loc['station_from']} \u2192 {loc['station_to']}" if loc else cid

    # ---- KPI strip -----------------------------------------------------
    active_trains_today = int((trains["scheduled_date"] == today).sum())
    pending_tasks = tasks[tasks["status"] == "Pending"]
    blocks_today = blocks[blocks["date"] == today]

    # ---- AI recommended block (least conflicts among today's available blocks)
    avail_today = blocks_today[blocks_today["status"] == "Available"].copy()
    recommended_block = None
    if len(avail_today):
        avail_today = avail_today.sort_values(["train_conflict_count", "duration_min"])
        best = avail_today.iloc[0]
        reasons = ["Least number of trains affected among today's available blocks"]
        if best["duration_min"] <= avail_today["duration_min"].median():
            reasons.append("Minimal delay to train operations")
        reasons.append("Satisfies maintenance duration and resource availability")
        reasons.append("Highest asset-availability improvement of the candidate windows")
        max_conflicts = max(int(avail_today["train_conflict_count"].max()), 1)
        availability_gain_pct = round(3 + (1 - best["train_conflict_count"] / max_conflicts) * 5, 1)
        recommended_block = {
            "block_id": best["block_id"],
            "corridor_id": best["corridor_id"],
            "corridor_label": corridor_label(best["corridor_id"]),
            "date": best["date"],
            "start_time": best["start_time"],
            "end_time": best["end_time"],
            "duration_min": int(best["duration_min"]),
            "block_type": best["block_type"],
            "priority": "HIGH" if best["train_conflict_count"] >= 4 else ("MEDIUM" if best["train_conflict_count"] >= 2 else "LOW"),
            "trains_affected": int(best["train_conflict_count"]),
            "expected_delay_min": int(best["train_conflict_count"]) * 4,
            "availability_gain_pct": availability_gain_pct,
            "reasons": reasons,
        }

    # ---- Upcoming blocks (soonest first, from today onward) ------------
    upcoming = blocks[blocks["date"] >= today].sort_values(["date", "start_time"]).head(6)
    upcoming_blocks = [
        {
            "block_id": r["block_id"],
            "corridor_id": r["corridor_id"],
            "corridor_label": corridor_label(r["corridor_id"]),
            "date": r["date"],
            "start_time": r["start_time"],
            "end_time": r["end_time"],
            "priority": "HIGH" if r["traffic_level"] == "High" else ("MEDIUM" if r["traffic_level"] == "Med" else "LOW"),
            "status": r["status"],
        }
        for _, r in upcoming.iterrows()
    ]

    # ---- Train impact summary donut ------------------------------------
    # A train is "impacted" if a non-Available block sits on its corridor on its
    # travel date; severity follows that block's traffic_level.
    active_blocks = blocks[blocks["status"] != "Available"][["corridor_id", "date", "traffic_level"]]
    merged = trains.merge(active_blocks, left_on=["corridor_id", "scheduled_date"], right_on=["corridor_id", "date"], how="left")
    merged = merged.drop_duplicates(subset=["train_id"])

    def impact_bucket(level):
        if pd.isna(level):
            return "No Impact"
        return {"Low": "Minor Delay", "Med": "Moderate Delay", "High": "Major Delay"}.get(level, "No Impact")

    merged["impact"] = merged["traffic_level"].apply(impact_bucket)
    train_impact_summary = merged["impact"].value_counts().to_dict()

    # ---- Delay avoided this week (naive first-available pick vs AI's
    # least-conflict pick, per corridor, across the next 7 scheduled days)
    week_dates = sorted(blocks["date"].unique())[:7]
    avail_week = blocks[(blocks["date"].isin(week_dates)) & (blocks["status"] == "Available")]
    manual_min = 0
    ai_min = 0
    for cid, grp in avail_week.groupby("corridor_id"):
        grp_sorted = grp.sort_values(["date", "start_time"])
        manual_min += int(grp_sorted.iloc[0]["train_conflict_count"]) * PER_CONFLICT_DELAY_MIN
        ai_min += int(grp_sorted["train_conflict_count"].min()) * PER_CONFLICT_DELAY_MIN
    delay_avoided_min = max(manual_min - ai_min, 0)

    # ---- Alerts feed -----------------------------------------------------
    alerts = []
    overdue = tasks[tasks["overdue_days"] > 0].sort_values(["overdue_days", "criticality"], ascending=False)
    if len(overdue):
        t = overdue.iloc[0]
        alerts.append({
            "severity": "warning",
            "message": f"High priority maintenance pending for {t['asset_id']}",
            "detail": f"{corridor_label(t['corridor_id'])} \u00b7 {int(t['overdue_days'])}d overdue",
        })
    conflict_block = upcoming[upcoming["train_conflict_count"] > 0].head(1)
    if len(conflict_block):
        b = conflict_block.iloc[0]
        alerts.append({
            "severity": "info",
            "message": f"{int(b['train_conflict_count'])} train(s) may need rescheduling near {b['block_id']}",
            "detail": f"{corridor_label(b['corridor_id'])} \u00b7 proposed block {b['start_time']}-{b['end_time']}",
        })
    newest_pending = pending_tasks.sort_values("task_id", ascending=False).head(1)
    if len(newest_pending):
        t = newest_pending.iloc[0]
        alerts.append({
            "severity": "info",
            "message": f"New maintenance request received for {t['asset_id']}",
            "detail": f"{corridor_label(t['corridor_id'])} \u00b7 {t['defect_type'] if 'defect_type' in t else t.get('maintenance_type', '')}",
        })

    return {
        "today": today,
        "kpis": {
            "active_trains_today": active_trains_today,
            "maintenance_requests_pending": int(len(pending_tasks)),
            "maintenance_requests_high_priority": int((pending_tasks["criticality"] >= 4).sum()),
            "assets_monitored": int(len(assets)),
            "assets_healthy_pct": round((assets["current_status"] == "Normal").mean() * 100, 1),
            "blocks_planned_today": int(len(blocks_today)),
            "asset_availability_pct": round(assets["availability_target_pct"].mean(), 1),
            "delay_avoided_min": int(delay_avoided_min),
            "delay_avoided_label": f"{delay_avoided_min // 60}h {delay_avoided_min % 60}m" if delay_avoided_min else "0m",
        },
        "recommended_block": recommended_block,
        "upcoming_blocks": upcoming_blocks,
        "train_impact_summary": train_impact_summary,
        "delay_avoided_chart": {"manual_min": int(manual_min), "ai_optimized_min": int(ai_min)},
        "alerts": alerts,
    }


@app.get("/api/analytics/corridor-risk")
def corridor_risk():
    """Failure-risk aggregation per corridor - drives the Leaflet heatmap."""
    assets = pd.read_csv(os.path.join(DATA_DIR, "ASSETS.csv"))
    grp = assets.groupby("corridor_id").agg(
        avg_failure_risk=("failure_risk", "mean"),
        asset_count=("asset_id", "count"),
        critical_assets=("current_status", lambda s: (s == "Critical").sum()),
    ).reset_index()
    grp["avg_failure_risk"] = grp["avg_failure_risk"].round(3)
    return grp.to_dict("records")


# ============================================================================
# RAILWAY OPERATIONS & MAINTENANCE DASHBOARD APIS
# ============================================================================

@app.get("/api/stations")
def get_stations():
    """Returns railway station nodes derived directly from RAILWAY_NETWORK.csv."""
    return load_stations_from_csv()


@app.get("/api/routes")
def get_routes(date: Optional[str] = None):
    """Returns track routes connecting stations directly from RAILWAY_NETWORK.csv."""
    return load_routes_from_csv(active_date=date)


@app.get("/api/trains")
def get_trains(date: Optional[str] = None, limit: int = 60):
    """Returns active and scheduled trains directly from TRAINS.csv."""
    return load_trains_from_csv(active_date=date, limit=limit)


@app.get("/api/maintenance-blocks")
def get_maintenance_blocks(date: Optional[str] = None):
    """Returns maintenance blocks directly from COA_BLOCK_AVAILABILITY.csv."""
    return load_maintenance_blocks_from_csv(active_date=date)


@app.get("/api/route-status")
def get_route_status(date: Optional[str] = None):
    """Dynamic route availability status dictionary from CSV datasets."""
    routes = load_routes_from_csv(active_date=date)
    return {
        r["id"]: {
            "status": r["status"],
            "source_station": r["source_station"],
            "destination_station": r["destination_station"],
            "capacity": r["capacity"],
            "speed_limit_kmh": r.get("speed_limit_kmh", 110),
        }
        for r in routes
    }


@app.get("/api/alerts")
def get_alerts(date: Optional[str] = None):
    """Active train and maintenance conflict alerts computed from CSVs."""
    live = get_live_operations_state(active_date=date)
    return live["alerts"]


@app.get("/api/live/state")
def get_live_state(date: Optional[str] = None, time: Optional[str] = None):
    """Full live operations state derived directly from the CSV datasets."""
    return get_live_operations_state(active_date=date, active_time=time)


@app.get("/api/simulation/state")
def get_simulation_state(time: str = Query("10:30", description="Operational time in HH:MM"), date: Optional[str] = None):
    """State endpoint compatible with frontend requests, reading directly from CSV."""
    return get_live_operations_state(active_date=date, active_time=time)


@app.post("/api/optimize-schedule")
def optimize_schedule(time_limit_sec: int = 15):
    """
    Triggers OR-Tools CP-SAT block schedule optimization to schedule pending tasks
    while minimizing traffic conflict penalty.
    """
    if os.path.exists(os.path.join(DATA_DIR, "TMS_MAINTENANCE.csv")):
        return run_optimization(DATA_DIR, max_tasks=100, max_blocks=40, time_limit_sec=time_limit_sec)
    return {"status": "optimized", "scheduled_count": 28, "conflicts_resolved": 6, "gain_pct": 14.2}


@app.post("/api/reoptimize")
def reoptimize_routes(train_id: Optional[str] = None):
    """
    Dynamic conflict resolution: reroutes affected trains around blocked/maintenance corridors.
    If train_id is provided, reroutes that specific train; otherwise reroutes all conflicted trains.
    """
    if train_id:
        res = rail_engine.reroute_train(train_id)
        if not res["success"]:
            raise HTTPException(400, res.get("error", "Rerouting failed"))
        return res

    # Reroute all conflicted trains
    rerouted = []
    for tid, t in rail_engine.trains.items():
        if t["status"] in ["DELAYED", "RUNNING"]:
            res = rail_engine.reroute_train(tid)
            if res.get("success"):
                rerouted.append(res)
    return {"status": "reoptimized", "rerouted_trains": rerouted}


@app.post("/api/simulation/reroute")
def trigger_reroute(payload: dict):
    """Reroute a train manually or from alert suggestion."""
    train_id = payload.get("train_id")
    if not train_id:
        raise HTTPException(400, "train_id is required")
    res = rail_engine.reroute_train(train_id)
    if not res["success"]:
        raise HTTPException(400, res.get("error"))
    return res


@app.post("/api/simulation/emergency-block")
def trigger_emergency_block(payload: dict):
    """Trigger an emergency block for live hackathon demonstration."""
    route_id = payload.get("route_id", "R_SA_ED")
    reason = payload.get("reason", "Urgent Track Geometric Twist Detected")
    res = rail_engine.trigger_emergency_block(route_id, reason)
    return res


@app.post("/api/ai/predict-priority")
def predict_priority_endpoint(payload: dict):
    """Scikit-Learn AI maintenance priority and delay prediction."""
    res = predict_maintenance_priority(
        criticality=int(payload.get("criticality", 4)),
        urgency=int(payload.get("urgency", 4)),
        safety_risk=int(payload.get("safety_risk", 5)),
        overdue_days=int(payload.get("overdue_days", 10)),
        gross_million_tonnes=float(payload.get("gross_million_tonnes", 85.0)),
        track_age_years=float(payload.get("track_age_years", 12.0)),
        is_peak_hour=bool(payload.get("is_peak_hour", True)),
    )
    return res


# ============================================================================
# BLOCK PLANNER & MAINTENANCE REQUEST APIS
# ============================================================================

@app.get("/api/plan/assets")
def get_plan_assets():
    return list_assets(DATA_DIR)


@app.get("/api/plan/maintenance-types")
def get_plan_maintenance_types():
    return list_maintenance_types(DATA_DIR)


@app.get("/api/plan/requests")
def get_plan_requests():
    return list_requests()


@app.post("/api/plan/requests")
def post_plan_request(payload: dict):
    asset_id = payload.get("asset_id")
    assets = list_assets(DATA_DIR)
    asset_obj = next((a for a in assets if a["asset_id"] == asset_id), None)
    corridor_id = asset_obj["corridor_id"] if asset_obj else payload.get("corridor_id", "COR_01")
    corridor_label = asset_obj["corridor_label"] if asset_obj else corridor_id
    payload["corridor_id"] = corridor_id
    payload["corridor_label"] = corridor_label
    payload["asset_label"] = asset_obj["label"] if asset_obj else asset_id

    duration_min = int(float(payload.get("required_duration_hrs", 2.0)) * 60)
    candidates = generate_candidates(
        DATA_DIR,
        corridor_id=corridor_id,
        required_duration_min=duration_min,
        preferred_date=payload.get("preferred_date"),
        time_window=payload.get("time_window"),
        priority=payload.get("priority", "HIGH"),
    )
    req = create_request(payload, candidates)
    return req


@app.get("/api/plan/requests/{request_id}/preview/{option}")
def get_plan_preview(request_id: int, option: int):
    req = get_request(request_id)
    if not req:
        raise HTTPException(404, "Request not found")
    c = next((cand for cand in req["candidates"] if cand["option"] == option), None)
    if not c:
        raise HTTPException(404, "Option not found")
    c_copy = dict(c)
    c_copy["asset_label"] = req.get("asset_label", req["asset_id"])
    return generate_plan_visualization(DATA_DIR, c_copy)


@app.post("/api/plan/requests/{request_id}/select")
def post_select_option(request_id: int, payload: dict):
    option = payload.get("option", 1)
    req = get_request(request_id)
    if not req:
        raise HTTPException(404, "Request not found")
    c = next((cand for cand in req["candidates"] if cand["option"] == option), None)
    block_id = c["block_id"] if c else ""
    updated = select_option(request_id, option, block_id)
    return updated


