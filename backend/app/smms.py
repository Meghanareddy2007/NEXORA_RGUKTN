"""
SMMS (Signalling Maintenance Management System) module.

Everything here is derived from the REAL existing datasets — no fabricated
numbers, names or confidence scores:
  - ASSETS.csv filtered to department == "Signal" -> the signalling asset
    register (Signals, Point machines, Interlocking, Cable plant).
  - SMMS_MAINTENANCE.csv -> the maintenance queue. Rows whose
    maintenance_type is "Corrective" or "Emergency" (i.e. triggered by an
    actual defect rather than routine/predictive upkeep) AND are not yet
    Completed are surfaced as "active signalling failures".
  - RAILWAY_NETWORK.csv (+ the same station coordinate table the existing
    map uses) -> positions signalling assets on the map by interpolating
    along their corridor's station-to-station line at `location_km`.
  - COA_BLOCK_AVAILABILITY.csv -> cross-checked against maintenance due
    dates/corridors to flag real block-vs-maintenance scheduling conflicts.

  - SMMS_PROBLEM_REPORTS.csv -> problem reports raised by signalling
    maintenance staff from the "Report Problem" page (append-only; a
    dataset of its own, so the maintenance datasets above are never touched).

All mutating endpoints are permission-gated via app.rbac.require_permission
and write through to the CSV (same pattern the existing
`/api/blocks/{id}/approve` endpoint uses) plus an audit-log entry.
"""
import csv
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from app import audit
from app.csv_data_loader import STATION_METADATA
from app.rbac import require_permission, role_has_permission

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

router = APIRouter(prefix="/api/smms", tags=["smms"])

SEVERITY_ORDER = ["Low", "Medium", "High", "Critical"]


def _assets_path() -> str:
    return os.path.join(DATA_DIR, "ASSETS.csv")


def _maint_path() -> str:
    return os.path.join(DATA_DIR, "SMMS_MAINTENANCE.csv")


def _network_df() -> pd.DataFrame:
    return pd.read_csv(os.path.join(DATA_DIR, "RAILWAY_NETWORK.csv"))


def _corridor_labels() -> Dict[str, str]:
    net = _network_df()
    return {r["corridor_id"]: f"{r['station_from']} \u2192 {r['station_to']}" for _, r in net.iterrows()}


def _signalling_assets() -> pd.DataFrame:
    df = pd.read_csv(_assets_path())
    return df[df["department"] == "Signal"].copy()


def _maintenance() -> pd.DataFrame:
    if not os.path.exists(_maint_path()):
        return pd.DataFrame()
    return pd.read_csv(_maint_path())


def _severity_from_row(row) -> str:
    """Severity is derived from the dataset's own criticality/safety_risk
    scores (both 1-5 scales already present in SMMS_MAINTENANCE.csv) —
    never invented."""
    score = int(row.get("criticality", 0)) + int(row.get("safety_risk", 0))
    if row.get("maintenance_type") == "Emergency" or score >= 8:
        return "Critical"
    if score >= 6:
        return "High"
    if score >= 4:
        return "Medium"
    return "Low"


def _is_failure_row(row) -> bool:
    return row.get("maintenance_type") in ("Corrective", "Emergency") and row.get("status") != "Completed"


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@router.get("/dashboard")
def smms_dashboard(user: dict = Depends(require_permission("signalling.view"))):
    assets = _signalling_assets()
    maint = _maintenance()

    if assets.empty:
        asset_kpis = {
            "total_assets": 0, "healthy": 0, "attention_required": 0,
            "critical": 0, "under_maintenance": 0, "out_of_service": 0,
        }
    else:
        status_counts = assets["current_status"].value_counts().to_dict()
        asset_kpis = {
            "total_assets": int(len(assets)),
            "healthy": int(status_counts.get("Normal", 0)),
            "attention_required": int(status_counts.get("Degraded", 0)),
            "critical": int(status_counts.get("Critical", 0)),
            # These two states aren't modeled as a distinct asset status in
            # the current dataset (only Normal/Degraded/Critical exist) —
            # reported as 0 with a note rather than fabricated.
            "under_maintenance": 0,
            "out_of_service": 0,
        }

    if maint.empty:
        maint_kpis = {
            "active_failures": 0, "pending": 0, "overdue": 0,
            "due_soon": 0, "scheduled": 0, "open_requests": 0, "completed": 0,
        }
    else:
        active_failures = maint[maint.apply(_is_failure_row, axis=1)]
        maint_kpis = {
            "active_failures": int(len(active_failures)),
            "pending": int((maint["status"] == "Pending").sum()),
            "overdue": int((maint["overdue_days"] > 0).sum()),
            "due_soon": int(((maint["overdue_days"] == 0) & (maint["status"] != "Completed")).sum()),
            "scheduled": int((maint["status"] == "Scheduled").sum()),
            "open_requests": int((maint["status"] != "Completed").sum()),
            "completed": int((maint["status"] == "Completed").sum()),
        }

    return {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "asset_health": asset_kpis,
        "maintenance": maint_kpis,
        "asset_type_breakdown": (
            assets["asset_type"].value_counts().to_dict() if not assets.empty else {}
        ),
    }


# ---------------------------------------------------------------------------
# Asset register
# ---------------------------------------------------------------------------
@router.get("/assets")
def list_signalling_assets(
    q: Optional[str] = None,
    status: Optional[str] = None,
    asset_type: Optional[str] = None,
    corridor_id: Optional[str] = None,
    sort_by: str = Query("asset_id"),
    user: dict = Depends(require_permission("signalling.assets.view")),
):
    assets = _signalling_assets()
    if assets.empty:
        return []
    labels = _corridor_labels()
    maint = _maintenance()

    if q:
        ql = q.lower()
        assets = assets[assets["asset_id"].str.lower().str.contains(ql) | assets["corridor_id"].str.lower().str.contains(ql)]
    if status:
        assets = assets[assets["current_status"] == status]
    if asset_type:
        assets = assets[assets["asset_type"] == asset_type]
    if corridor_id:
        assets = assets[assets["corridor_id"] == corridor_id]
    if sort_by in assets.columns:
        assets = assets.sort_values(sort_by)

    out = []
    for _, r in assets.iterrows():
        history = maint[maint["asset_id"] == r["asset_id"]] if not maint.empty else pd.DataFrame()
        failures = history[history.apply(_is_failure_row, axis=1)] if not history.empty else pd.DataFrame()
        out.append({
            "asset_id": r["asset_id"],
            "asset_type": r["asset_type"],
            "department": r["department"],
            "corridor_id": r["corridor_id"],
            "corridor_label": labels.get(r["corridor_id"], r["corridor_id"]),
            "location_km": float(r["location_km"]),
            "asset_criticality": int(r["asset_criticality"]),
            "availability_target_pct": float(r["availability_target_pct"]),
            "current_status": r["current_status"],
            "last_maintenance_date": r["last_maintenance_date"],
            "next_due_date": r["next_due_date"],
            "failure_risk": float(r["failure_risk"]),
            "maintenance_history_count": int(len(history)),
            "failure_history_count": int(len(failures)),
        })
    return out


@router.get("/assets/{asset_id}")
def get_signalling_asset(asset_id: str, user: dict = Depends(require_permission("signalling.assets.view"))):
    assets = _signalling_assets()
    row = assets[assets["asset_id"] == asset_id]
    if row.empty:
        raise HTTPException(404, f"Signalling asset '{asset_id}' not found")
    r = row.iloc[0]
    labels = _corridor_labels()
    maint = _maintenance()
    history = maint[maint["asset_id"] == asset_id] if not maint.empty else pd.DataFrame()
    return {
        "asset_id": r["asset_id"],
        "asset_type": r["asset_type"],
        "corridor_id": r["corridor_id"],
        "corridor_label": labels.get(r["corridor_id"], r["corridor_id"]),
        "location_km": float(r["location_km"]),
        "asset_criticality": int(r["asset_criticality"]),
        "availability_target_pct": float(r["availability_target_pct"]),
        "current_status": r["current_status"],
        "last_maintenance_date": r["last_maintenance_date"],
        "next_due_date": r["next_due_date"],
        "failure_risk": float(r["failure_risk"]),
        "maintenance_history": history.to_dict("records") if not history.empty else [],
    }


# ---------------------------------------------------------------------------
# Failures
# ---------------------------------------------------------------------------
@router.get("/failures")
def list_failures(
    severity: Optional[str] = None,
    corridor_id: Optional[str] = None,
    user: dict = Depends(require_permission("signalling.failures.view")),
):
    maint = _maintenance()
    if maint.empty:
        return []
    labels = _corridor_labels()
    rows = maint[maint.apply(_is_failure_row, axis=1)].copy()
    if corridor_id:
        rows = rows[rows["corridor_id"] == corridor_id]

    out = []
    for _, r in rows.iterrows():
        sev = _severity_from_row(r)
        if severity and sev != severity:
            continue
        out.append({
            "failure_id": r["task_id"],
            "asset_id": r["asset_id"],
            "asset_type": r["asset_type"],
            "corridor_id": r["corridor_id"],
            "affected_section": labels.get(r["corridor_id"], r["corridor_id"]),
            "defect_type": r["defect_type"],
            "maintenance_type": r["maintenance_type"],
            "severity": sev,
            "due_date": r["due_date"],
            "overdue_days": int(r["overdue_days"]),
            "estimated_duration_min": int(r["estimated_duration_min"]),
            "crew_required": int(r["crew_required"]),
            "status": r["status"],
        })
    out.sort(key=lambda f: (SEVERITY_ORDER.index(f["severity"]) if f["severity"] in SEVERITY_ORDER else 0), reverse=True)
    return out


@router.post("/failures/{failure_id}/status")
def update_failure_status(
    failure_id: str,
    payload: Dict[str, Any],
    user: dict = Depends(require_permission("signalling.failures.update")),
):
    new_status = payload.get("status")
    if new_status not in ("Pending", "Scheduled", "In Progress", "Completed"):
        raise HTTPException(400, "status must be one of Pending, Scheduled, In Progress, Completed")
    path = _maint_path()
    df = pd.read_csv(path)
    if failure_id not in df["task_id"].values:
        raise HTTPException(404, f"Failure/task '{failure_id}' not found")
    df.loc[df["task_id"] == failure_id, "status"] = new_status
    if new_status != "Completed":
        pass  # overdue_days left as-is; a real system would recompute against "today"
    df.to_csv(path, index=False)
    audit.log_action(user, "SIGNALLING_FAILURE_UPDATED", "signalling.failure", failure_id, "SUCCESS", f"status -> {new_status}")
    return {"failure_id": failure_id, "status": new_status}


# ---------------------------------------------------------------------------
# Maintenance queue
# ---------------------------------------------------------------------------
@router.get("/maintenance")
def maintenance_queue(
    status: Optional[str] = None,
    corridor_id: Optional[str] = None,
    user: dict = Depends(require_permission("signalling.maintenance.view")),
):
    maint = _maintenance()
    if maint.empty:
        return {"pending": [], "scheduled": [], "in_progress": [], "completed": [], "overdue": []}
    labels = _corridor_labels()
    df = maint.copy()
    if corridor_id:
        df = df[df["corridor_id"] == corridor_id]
    if status:
        df = df[df["status"] == status]

    def to_record(r) -> Dict[str, Any]:
        return {
            "maintenance_id": r["task_id"],
            "asset_id": r["asset_id"],
            "asset_type": r["asset_type"],
            "corridor_id": r["corridor_id"],
            "location": labels.get(r["corridor_id"], r["corridor_id"]),
            "maintenance_type": r["maintenance_type"],
            "defect_type": r["defect_type"],
            "priority": _severity_from_row(r),
            "due_date": r["due_date"],
            "overdue_days": int(r["overdue_days"]),
            "estimated_duration_min": int(r["estimated_duration_min"]),
            "crew_required": int(r["crew_required"]),
            "status": r["status"],
        }

    records = [to_record(r) for _, r in df.iterrows()]
    return {
        "pending": [x for x in records if x["status"] == "Pending"],
        "scheduled": [x for x in records if x["status"] == "Scheduled"],
        "in_progress": [x for x in records if x["status"] == "In Progress"],
        "completed": [x for x in records if x["status"] == "Completed"],
        "overdue": [x for x in records if x["overdue_days"] > 0 and x["status"] != "Completed"],
    }


@router.post("/maintenance/{task_id}/status")
def update_maintenance_status(
    task_id: str,
    payload: Dict[str, Any],
    user: dict = Depends(require_permission("signalling.maintenance.edit")),
):
    new_status = payload.get("status")
    if new_status not in ("Pending", "Scheduled", "In Progress", "Completed"):
        raise HTTPException(400, "status must be one of Pending, Scheduled, In Progress, Completed")
    path = _maint_path()
    df = pd.read_csv(path)
    if task_id not in df["task_id"].values:
        raise HTTPException(404, f"Maintenance task '{task_id}' not found")
    df.loc[df["task_id"] == task_id, "status"] = new_status
    df.to_csv(path, index=False)
    audit.log_action(user, "SIGNALLING_MAINTENANCE_UPDATED", "signalling.maintenance", task_id, "SUCCESS", f"status -> {new_status}")
    return {"maintenance_id": task_id, "status": new_status}


@router.post("/maintenance/{task_id}/complete")
def complete_maintenance(task_id: str, user: dict = Depends(require_permission("signalling.maintenance.complete"))):
    path = _maint_path()
    df = pd.read_csv(path)
    if task_id not in df["task_id"].values:
        raise HTTPException(404, f"Maintenance task '{task_id}' not found")
    df.loc[df["task_id"] == task_id, "status"] = "Completed"
    df.loc[df["task_id"] == task_id, "overdue_days"] = 0
    df.to_csv(path, index=False)
    audit.log_action(user, "SIGNALLING_MAINTENANCE_COMPLETED", "signalling.maintenance", task_id, "SUCCESS")
    return {"maintenance_id": task_id, "status": "Completed"}


@router.post("/maintenance/{task_id}/assign")
def assign_maintenance(
    task_id: str,
    payload: Dict[str, Any],
    user: dict = Depends(require_permission("signalling.maintenance.edit")),
):
    crew = payload.get("crew_required")
    path = _maint_path()
    df = pd.read_csv(path)
    if task_id not in df["task_id"].values:
        raise HTTPException(404, f"Maintenance task '{task_id}' not found")
    if crew is not None:
        df.loc[df["task_id"] == task_id, "crew_required"] = int(crew)
    if df.loc[df["task_id"] == task_id, "status"].iloc[0] == "Pending":
        df.loc[df["task_id"] == task_id, "status"] = "Scheduled"
    df.to_csv(path, index=False)
    audit.log_action(user, "SIGNALLING_MAINTENANCE_ASSIGNED", "signalling.maintenance", task_id, "SUCCESS", str(payload))
    return {"maintenance_id": task_id, "status": "assigned"}


# ---------------------------------------------------------------------------
# Signalling asset map (real geo interpolation, no fabricated coordinates)
# ---------------------------------------------------------------------------
def _interpolate_position(corridor_id: str, location_km: float, network: pd.DataFrame) -> Optional[Dict[str, float]]:
    row = network[network["corridor_id"] == corridor_id]
    if row.empty:
        return None
    r = row.iloc[0]
    a = STATION_METADATA.get(r["station_from"])
    b = STATION_METADATA.get(r["station_to"])
    if not a or not b:
        return None
    distance = float(r["distance_km"]) or 1.0
    frac = max(0.0, min(1.0, float(location_km) / distance)) if distance else 0.0
    lat = a["lat"] + (b["lat"] - a["lat"]) * frac
    lng = a["lng"] + (b["lng"] - a["lng"]) * frac
    # Also interpolate the same schematic x/y grid the existing network
    # diagram (NetworkMap.tsx) already uses, so the frontend can draw
    # signalling assets on that same schematic layout without a separate
    # geo-mapping library.
    x = a["x"] + (b["x"] - a["x"]) * frac
    y = a["y"] + (b["y"] - a["y"]) * frac
    return {
        "latitude": round(lat, 5), "longitude": round(lng, 5),
        "x": round(x, 1), "y": round(y, 1),
        "station_from": r["station_from"], "station_to": r["station_to"],
    }


@router.get("/asset-map")
def signalling_asset_map(user: dict = Depends(require_permission("signalling.assets.view"))):
    assets = _signalling_assets()
    if assets.empty:
        return []
    network = _network_df()
    labels = _corridor_labels()
    out = []
    for _, r in assets.iterrows():
        pos = _interpolate_position(r["corridor_id"], r["location_km"], network)
        if not pos:
            continue
        out.append({
            "asset_id": r["asset_id"],
            "asset_type": r["asset_type"],
            "corridor_id": r["corridor_id"],
            "corridor_label": labels.get(r["corridor_id"], r["corridor_id"]),
            "current_status": r["current_status"],
            "failure_risk": float(r["failure_risk"]),
            **pos,
        })
    return out


# ---------------------------------------------------------------------------
# Signalling map model — one payload that drives the SMMS Signalling Map
# (sections, stations, assets, maintenance and failure information).
#
# Everything is derived from the existing datasets; nothing is invented:
#   * Assets come from two places. The signalling asset register
#     (ASSETS.csv, department == "Signal") and the SMMS maintenance dataset,
#     whose rows carry their own asset_type (Signal / Point / Interlock /
#     Cable), corridor and km. A maintenance row is merged into a register
#     asset only when asset_id, corridor and type all agree; otherwise it is
#     its own asset on the map (the datasets disagree about most shared
#     asset IDs, and that disagreement is surfaced in `notes`, not hidden).
#   * Track circuits, axle counters and signalling power assets do not exist
#     in any dataset, so they are reported with a count of 0 in `coverage`.
#   * `location_km` is only turned into a position along a section when it
#     lies within that section's length. Otherwise the asset is flagged
#     `position.exact = False` (a "section-level" asset) instead of being
#     pinned to an invented spot.
# ---------------------------------------------------------------------------
MAP_STATUS_LABELS = {
    "healthy": "Healthy",
    "attention": "Attention",
    "failure": "Failure / Critical",
    "maintenance": "Under Maintenance",
    "inactive": "Inactive",
}
# Raw asset_type (as stored in the datasets) -> map category.
MAP_CATEGORY_BY_TYPE = {
    "Signal": "Signals",
    "Point": "Point Machines",
    "Interlock": "Interlocking",
    "Cable": "Cable Plant",
}
# Filter categories offered by the map, in display order, with the raw asset
# types that feed each one. An empty list means no dataset holds that kind
# of asset.
MAP_CATEGORIES: List[Tuple[str, List[str]]] = [
    ("Signals", ["Signal"]),
    ("Point Machines", ["Point"]),
    ("Track Circuits", []),
    ("Axle Counters", []),
    ("Interlocking", ["Interlock"]),
    ("Cable Plant", ["Cable"]),
    ("Signalling Power", []),
]
# 1-5 criticality scale used by both datasets; 5 is the top of the scale.
CRITICAL_ASSET_RATING = 5
INACTIVE_REGISTER_STATUSES = {"inactive", "out of service", "offline", "decommissioned"}


def _map_maintenance_record(r) -> Dict[str, Any]:
    is_failure = bool(_is_failure_row(r))
    return {
        "task_id": str(r["task_id"]),
        "maintenance_type": str(r["maintenance_type"]),
        "defect_type": str(r["defect_type"]),
        "status": str(r["status"]),
        "priority": _severity_from_row(r),
        "due_date": str(r["due_date"]),
        "overdue_days": int(r["overdue_days"]),
        "estimated_duration_min": int(r["estimated_duration_min"]),
        "crew_required": int(r["crew_required"]),
        "criticality": int(r["criticality"]),
        "safety_risk": int(r["safety_risk"]),
        "is_failure": is_failure,
        "severity": _severity_from_row(r) if is_failure else None,
    }


def _derive_map_status(register_status: Optional[str], records: List[Dict[str, Any]]) -> Tuple[str, str]:
    """Map status + a plain-language reason. Precedence (first match wins):
    inactive register status > work In Progress (blue) > register Critical or
    an open Critical/High failure (red) > register Degraded or any open
    maintenance (amber) > register Normal (green) > no live status (gray)."""
    open_rows = [x for x in records if x["status"] != "Completed"]
    in_progress = [x for x in open_rows if x["status"] == "In Progress"]
    open_failures = [x for x in open_rows if x["is_failure"]]
    severe = [x for x in open_failures if x["severity"] in ("Critical", "High")]

    if register_status and register_status.strip().lower() in INACTIVE_REGISTER_STATUSES:
        return "inactive", f"Register status is {register_status}"
    if in_progress:
        ids = ", ".join(x["task_id"] for x in in_progress)
        return "maintenance", f"Maintenance In Progress ({ids})"
    if register_status == "Critical":
        return "failure", "Register status is Critical"
    if severe:
        worst = severe[0] if len(severe) == 1 else max(severe, key=lambda x: SEVERITY_ORDER.index(x["severity"]))
        return "failure", f"Open {worst['maintenance_type']} failure {worst['task_id']} ({worst['severity']} severity)"
    if register_status == "Degraded":
        return "attention", "Register status is Degraded"
    if open_rows:
        return "attention", f"{len(open_rows)} open maintenance record(s), none in progress"
    if register_status == "Normal":
        return "healthy", "Register status is Normal and no maintenance is open"
    return "inactive", "No live health status on record and all maintenance is completed"


def _section_position(section: Dict[str, Any], location_km: float) -> Dict[str, Any]:
    """Position along a section by chainage. `exact` is False (and the point
    is the section midpoint, used only as an anchor) when the recorded km is
    outside 0..section length."""
    a, b = section["_a"], section["_b"]
    length = float(section["distance_km"]) or 0.0
    exact = length > 0 and 0.0 <= float(location_km) <= length
    frac = (float(location_km) / length) if exact else 0.5
    return {
        "latitude": round(a["lat"] + (b["lat"] - a["lat"]) * frac, 5),
        "longitude": round(a["lng"] + (b["lng"] - a["lng"]) * frac, 5),
        "x": round(a["x"] + (b["x"] - a["x"]) * frac, 1),
        "y": round(a["y"] + (b["y"] - a["y"]) * frac, 1),
        "exact": bool(exact),
    }


def build_signalling_map() -> Dict[str, Any]:
    network = _network_df()
    labels = _corridor_labels()
    register = _signalling_assets()
    maint = _maintenance()

    # ---- sections & stations -------------------------------------------
    sections: Dict[str, Dict[str, Any]] = {}
    station_ids: List[str] = []
    for _, r in network.iterrows():
        a, b = STATION_METADATA.get(r["station_from"]), STATION_METADATA.get(r["station_to"])
        if not a or not b:
            continue  # cannot be placed without real station coordinates
        sections[r["corridor_id"]] = {
            "corridor_id": r["corridor_id"],
            "label": labels.get(r["corridor_id"], r["corridor_id"]),
            "station_from": r["station_from"],
            "station_to": r["station_to"],
            "distance_km": float(r["distance_km"]),
            "track_count": int(r["track_count"]),
            "electrified": str(r["electrified"]),
            "section_type": str(r["section_type"]),
            "traffic_density": str(r["traffic_density"]),
            "_a": a, "_b": b,
        }
        for s in (r["station_from"], r["station_to"]):
            if s not in station_ids:
                station_ids.append(s)

    stations = []
    for sid in station_ids:
        m = STATION_METADATA[sid]
        stations.append({
            "id": sid, "code": m["code"], "name": m["name"], "division": m["div"],
            "platforms": int(m["platforms"]), "is_junction": bool(m["junction"]),
            "latitude": m["lat"], "longitude": m["lng"], "x": m["x"], "y": m["y"],
        })

    # ---- maintenance rows as records -----------------------------------
    rows: List[Dict[str, Any]] = []
    if not maint.empty:
        for _, r in maint.sort_values("task_id").iterrows():
            rec = _map_maintenance_record(r)
            rec["_asset_id"] = str(r["asset_id"])
            rec["_corridor_id"] = str(r["corridor_id"])
            rec["_asset_type"] = str(r["asset_type"])
            rec["_km"] = float(r["location_km"])
            rows.append(rec)

    def public(rec: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in rec.items() if not k.startswith("_")}

    reg_by_id = {str(r["asset_id"]): r for _, r in register.iterrows()}
    used_rows: set = set()
    entities: List[Dict[str, Any]] = []
    unplaced = 0

    def make_entity(**kw) -> Optional[Dict[str, Any]]:
        nonlocal unplaced
        section = sections.get(kw["corridor_id"])
        if section is None:
            unplaced += 1
            return None
        records = kw["records"]
        status, basis = _derive_map_status(kw.get("register_status"), records)
        open_failures = [x for x in records if x["status"] != "Completed" and x["is_failure"]]
        failure_severity = (
            max((x["severity"] for x in open_failures), key=SEVERITY_ORDER.index) if open_failures else None
        )
        rating = kw.get("criticality_rating")
        pos = _section_position(section, kw["location_km"])
        notes = list(kw.get("notes", []))
        if not pos["exact"]:
            notes.append(
                f"Recorded chainage {kw['location_km']:g} km is outside the {section['distance_km']:g} km "
                f"length of this section, so its exact position on the line cannot be derived. "
                f"Shown as a section-level asset."
            )
        return {
            "map_id": kw["map_id"],
            "asset_id": kw["asset_id"],
            "asset_type": kw["asset_type"],
            "category": MAP_CATEGORY_BY_TYPE.get(kw["asset_type"], kw["asset_type"]),
            "source": kw["source"],
            "corridor_id": section["corridor_id"],
            "section_label": section["label"],
            "section_length_km": section["distance_km"],
            "station_from": section["station_from"],
            "station_to": section["station_to"],
            "location_km": float(kw["location_km"]),
            "position": pos,
            "status": status,
            "status_label": MAP_STATUS_LABELS[status],
            "status_basis": basis,
            "register_status": kw.get("register_status"),
            "criticality_rating": rating,
            "criticality_source": kw["source"],
            "availability_target_pct": kw.get("availability_target_pct"),
            "failure_risk": kw.get("failure_risk"),
            "last_maintenance_date": kw.get("last_maintenance_date"),
            "next_due_date": kw.get("next_due_date"),
            "is_critical_asset": bool(
                (rating is not None and rating >= CRITICAL_ASSET_RATING) or kw.get("register_status") == "Critical"
            ),
            "is_failure": bool(open_failures) or kw.get("register_status") == "Critical",
            "has_open_maintenance": any(x["status"] != "Completed" for x in records),
            "failure_severity": failure_severity,
            "maintenance": [public(x) for x in records],
            "notes": notes,
        }

    # ---- register assets (merge only rows that agree on id+corridor+type) --
    for aid, r in reg_by_id.items():
        matched = [
            x for x in rows
            if x["_asset_id"] == aid and x["_corridor_id"] == r["corridor_id"] and x["_asset_type"] == r["asset_type"]
        ]
        for x in matched:
            used_rows.add(x["task_id"])
        elsewhere = [
            x for x in rows
            if x["_asset_id"] == aid and x["task_id"] not in {m["task_id"] for m in matched}
        ]
        notes = []
        if elsewhere:
            listed = "; ".join(
                f"{x['task_id']} ({x['_asset_type']}, {x['_corridor_id']} km {x['_km']:g}, {x['status']})"
                for x in elsewhere
            )
            notes.append(
                f"{len(elsewhere)} maintenance record(s) use this asset ID for a different section or asset type "
                f"and are shown as separate assets on the map: {listed}."
            )
        ent = make_entity(
            map_id=f"REG:{aid}", asset_id=aid, asset_type=str(r["asset_type"]), source="register",
            corridor_id=str(r["corridor_id"]), location_km=float(r["location_km"]),
            register_status=str(r["current_status"]), criticality_rating=int(r["asset_criticality"]),
            availability_target_pct=float(r["availability_target_pct"]), failure_risk=float(r["failure_risk"]),
            last_maintenance_date=str(r["last_maintenance_date"]), next_due_date=str(r["next_due_date"]),
            records=matched, notes=notes,
        )
        if ent:
            entities.append(ent)

    # ---- maintenance-listed assets (one per asset id + corridor + km + type) --
    groups: Dict[Tuple[str, str, float, str], List[Dict[str, Any]]] = {}
    for x in rows:
        if x["task_id"] in used_rows:
            continue
        groups.setdefault((x["_asset_id"], x["_corridor_id"], x["_km"], x["_asset_type"]), []).append(x)
    for (aid, cor, km, atype), recs in groups.items():
        notes = []
        reg = reg_by_id.get(aid)
        if reg is not None:
            notes.append(
                f"Asset ID {aid} is also in the signalling register as a {reg['asset_type']} on {reg['corridor_id']} "
                f"at km {float(reg['location_km']):g}. This maintenance record places it on {cor} at km {km:g} "
                f"as a {atype}; the datasets disagree, so both are shown."
            )
        ent = make_entity(
            map_id=f"MNT:{aid}:{cor}:{km:g}:{atype}", asset_id=aid, asset_type=atype, source="maintenance",
            corridor_id=cor, location_km=km, register_status=None,
            criticality_rating=max(x["criticality"] for x in recs), records=recs, notes=notes,
        )
        if ent:
            entities.append(ent)

    # ---- coverage (what the datasets do / do not contain) ---------------
    type_counts: Dict[str, int] = {}
    for e in entities:
        type_counts[e["asset_type"]] = type_counts.get(e["asset_type"], 0) + 1
    axle_fault_records = sum(1 for x in rows if x["defect_type"] == "Axle Counter Fault")
    missing_notes = {
        "Track Circuits": "No track circuit assets exist in the asset register or maintenance dataset.",
        "Axle Counters": (
            "No axle counter assets exist in the asset register or maintenance dataset. "
            f"{axle_fault_records} maintenance record(s) report an 'Axle Counter Fault' defect against other asset types."
        ),
        "Signalling Power": "No signalling power supply assets exist in the asset register or maintenance dataset.",
    }
    categories = []
    for name, types in MAP_CATEGORIES:
        count = sum(type_counts.get(t, 0) for t in types)
        categories.append({
            "category": name, "asset_types": types, "count": count, "available": count > 0,
            "note": None if count > 0 else missing_notes.get(name, f"No {name.lower()} assets exist in the datasets."),
        })
    known_types = {t for _, ts in MAP_CATEGORIES for t in ts}
    for t, n in sorted(type_counts.items()):
        if t not in known_types:  # never drop real data just because it is not a listed category
            categories.append({"category": t, "asset_types": [t], "count": n, "available": True, "note": None})

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sections": [{k: v for k, v in s.items() if not k.startswith("_")} for s in sections.values()],
        "stations": stations,
        "assets": entities,
        "coverage": {
            "categories": categories,
            "register_assets": int(len(register)),
            "maintenance_records": len(rows),
            "assets_on_map": len(entities),
            "assets_without_exact_position": sum(1 for e in entities if not e["position"]["exact"]),
            "assets_not_placed": unplaced,
            "critical_asset_rule": f"Criticality rating {CRITICAL_ASSET_RATING}/5, or register status Critical",
        },
    }


@router.get("/signalling-map")
def signalling_map(user: dict = Depends(require_permission("signalling.assets.view"))):
    """Sections, stations, assets (with maintenance + failure information) and
    dataset coverage for the SMMS Signalling Map. Read-only."""
    return build_signalling_map()


# ---------------------------------------------------------------------------
# Maintenance vs. block conflict detection
# ---------------------------------------------------------------------------
@router.get("/conflicts")
def maintenance_block_conflicts(user: dict = Depends(require_permission("signalling.maintenance.view"))):
    """Flags signalling maintenance tasks whose due_date falls on the same
    corridor+date as a planned COA block — a genuine cross-dataset check,
    not a simulated result."""
    maint = _maintenance()
    blocks_path = os.path.join(DATA_DIR, "COA_BLOCK_AVAILABILITY.csv")
    if maint.empty or not os.path.exists(blocks_path):
        return []
    blocks = pd.read_csv(blocks_path)
    labels = _corridor_labels()
    open_tasks = maint[maint["status"] != "Completed"]
    merged = open_tasks.merge(
        blocks, left_on=["corridor_id", "due_date"], right_on=["corridor_id", "date"], how="inner", suffixes=("_task", "_block")
    )
    out = []
    for _, r in merged.iterrows():
        out.append({
            "maintenance_id": r["task_id"],
            "asset_id": r["asset_id"],
            "corridor_id": r["corridor_id"],
            "corridor_label": labels.get(r["corridor_id"], r["corridor_id"]),
            "conflict_date": r["due_date"],
            "block_id": r["block_id"],
            "block_window": f"{r['start_time']}\u2013{r['end_time']}",
            "block_status": r["status_block"] if "status_block" in r else r.get("status"),
        })
    return out


# ---------------------------------------------------------------------------
# AI Copilot — rule-based, grounded entirely in the live datasets above.
# Not a generative model: every answer is computed from real rows, and
# unsupported questions say so instead of guessing.
# ---------------------------------------------------------------------------
@router.post("/copilot")
def smms_copilot(payload: Dict[str, Any], user: dict = Depends(require_permission("ai.copilot"))):
    question = (payload.get("question") or "").strip().lower()
    if not question:
        raise HTTPException(400, "question is required")

    maint = _maintenance()

    answer: str
    data: Any = None

    if "critical" in question and ("failur" in question or "asset" in question):
        rows = maint[maint.apply(_is_failure_row, axis=1)] if not maint.empty else pd.DataFrame()
        critical = [r for _, r in rows.iterrows() if _severity_from_row(r) == "Critical"]
        data = [{"failure_id": r["task_id"], "asset_id": r["asset_id"], "corridor_id": r["corridor_id"]} for r in critical]
        answer = (
            f"There are {len(critical)} critical signalling failure(s) currently open."
            if critical else "No critical signalling failures are currently open."
        )
    elif "maintenance" in question and "today" in question:
        due = maint[(maint["overdue_days"] >= 0) & (maint["status"] != "Completed")] if not maint.empty else pd.DataFrame()
        data = due[["task_id", "asset_id", "corridor_id", "due_date", "status"]].to_dict("records") if not due.empty else []
        answer = f"{len(data)} signalling maintenance task(s) are due or overdue right now."
    elif "overdue" in question:
        overdue = maint[maint["overdue_days"] > 0] if not maint.empty else pd.DataFrame()
        data = overdue[["task_id", "asset_id", "corridor_id", "overdue_days"]].to_dict("records") if not overdue.empty else []
        answer = f"{len(data)} signalling maintenance task(s) are overdue." if len(data) else "No overdue signalling maintenance tasks."
    elif "repeat" in question and "failur" in question:
        rows = maint[maint.apply(_is_failure_row, axis=1)] if not maint.empty else pd.DataFrame()
        counts = rows["asset_id"].value_counts()
        repeated = counts[counts > 1]
        data = [{"asset_id": a, "failure_count": int(c)} for a, c in repeated.items()]
        answer = f"{len(data)} asset(s) have more than one open failure record." if len(data) else "No assets currently show repeated failures."
    elif "section" in question and "affect" in question:
        rows = maint[maint.apply(_is_failure_row, axis=1)] if not maint.empty else pd.DataFrame()
        labels = _corridor_labels()
        sections = sorted({labels.get(c, c) for c in rows["corridor_id"].unique()}) if not rows.empty else []
        data = sections
        answer = f"{len(sections)} railway section(s) currently have an open signalling failure." if sections else "No railway sections currently affected."
    elif "conflict" in question:
        conflicts = maintenance_block_conflicts(user=user)
        data = conflicts
        answer = f"{len(conflicts)} maintenance task(s) currently conflict with a planned block on the same date/corridor." if conflicts else "No maintenance-vs-block conflicts detected."
    else:
        answer = (
            "I can answer questions about critical signalling failures, maintenance due today, "
            "overdue maintenance, repeated asset failures, affected railway sections, and "
            "maintenance/block conflicts — based on the live SMMS data. I don't have data to "
            "answer that specific question yet."
        )

    audit.log_action(user, "AI_COPILOT_QUERY", "smms.copilot", None, "SUCCESS", question[:200])
    return {"question": payload.get("question"), "answer": answer, "data": data}


# ---------------------------------------------------------------------------
# Extra command-center intelligence — Critical Asset Watchlist, Corridor
# Signal Health Leaderboard, Repeated Failure Detector, Maintenance Due
# Timeline. All derived directly from the same real datasets above; every
# score/ranking here has a documented formula in the code, nothing is an
# opaque "AI" number.
# ---------------------------------------------------------------------------
@router.get("/watchlist")
def critical_asset_watchlist(limit: int = 10, user: dict = Depends(require_permission("signalling.assets.view"))):
    """Ranks signalling assets by their own `failure_risk` field (already
    present in ASSETS.csv) — the assets most likely to fail next, so SMMS
    staff know what to check before it becomes an incident."""
    assets = _signalling_assets()
    if assets.empty:
        return []
    labels = _corridor_labels()
    top = assets.sort_values("failure_risk", ascending=False).head(limit)
    return [
        {
            "asset_id": r["asset_id"],
            "asset_type": r["asset_type"],
            "corridor_label": labels.get(r["corridor_id"], r["corridor_id"]),
            "current_status": r["current_status"],
            "failure_risk": float(r["failure_risk"]),
            "next_due_date": r["next_due_date"],
        }
        for _, r in top.iterrows()
    ]


@router.get("/corridor-health")
def corridor_health_leaderboard(user: dict = Depends(require_permission("signalling.view"))):
    """
    A composite, fully-documented Corridor Signal Health Score (0-100) per
    corridor, so SMMS staff can see which SECTION of the network needs
    attention rather than only which individual asset:

        score = 100
                - 50 x (average failure_risk of that corridor's signalling assets)
                - 10 x (number of Critical-status assets on that corridor)
                -  3 x (number of currently open signalling failures on that corridor)
                clamped to [0, 100]

    Every input is a real column already in ASSETS.csv / SMMS_MAINTENANCE.csv.
    """
    assets = _signalling_assets()
    if assets.empty:
        return []
    labels = _corridor_labels()
    maint = _maintenance()
    open_failures = maint[maint.apply(_is_failure_row, axis=1)] if not maint.empty else pd.DataFrame()

    rows = []
    for corridor_id, grp in assets.groupby("corridor_id"):
        avg_risk = float(grp["failure_risk"].mean())
        critical_count = int((grp["current_status"] == "Critical").sum())
        failures_here = int((open_failures["corridor_id"] == corridor_id).sum()) if not open_failures.empty else 0
        score = max(0.0, min(100.0, 100 - 50 * avg_risk - 10 * critical_count - 3 * failures_here))
        rows.append({
            "corridor_id": corridor_id,
            "corridor_label": labels.get(corridor_id, corridor_id),
            "asset_count": int(len(grp)),
            "avg_failure_risk": round(avg_risk, 3),
            "critical_assets": critical_count,
            "open_failures": failures_here,
            "health_score": round(score, 1),
        })
    rows.sort(key=lambda r: r["health_score"])  # worst-health corridor first
    return rows


@router.get("/repeated-failures")
def repeated_failure_detector(user: dict = Depends(require_permission("signalling.failures.view"))):
    """Assets with more than one currently-open failure record — a real
    signal that an asset may need root-cause investigation rather than
    another one-off repair."""
    maint = _maintenance()
    if maint.empty:
        return []
    labels = _corridor_labels()
    open_failures = maint[maint.apply(_is_failure_row, axis=1)]
    if open_failures.empty:
        return []
    counts = open_failures.groupby("asset_id")
    out = []
    for asset_id, grp in counts:
        if len(grp) <= 1:
            continue
        first = grp.iloc[0]
        out.append({
            "asset_id": asset_id,
            "asset_type": first["asset_type"],
            "corridor_label": labels.get(first["corridor_id"], first["corridor_id"]),
            "open_failure_count": int(len(grp)),
            "failure_ids": grp["task_id"].tolist(),
            "defect_types": sorted(grp["defect_type"].unique().tolist()),
        })
    out.sort(key=lambda r: r["open_failure_count"], reverse=True)
    return out


@router.get("/timeline")
def maintenance_due_timeline(user: dict = Depends(require_permission("signalling.maintenance.view"))):
    """Every non-completed signalling maintenance task, in chronological
    due-date order — a real timeline of what's coming up, not a mocked one."""
    maint = _maintenance()
    if maint.empty:
        return []
    labels = _corridor_labels()
    open_tasks = maint[maint["status"] != "Completed"].copy()
    open_tasks["_due_sort"] = pd.to_datetime(open_tasks["due_date"], errors="coerce")
    open_tasks = open_tasks.sort_values("_due_sort")
    return [
        {
            "maintenance_id": r["task_id"],
            "asset_id": r["asset_id"],
            "corridor_label": labels.get(r["corridor_id"], r["corridor_id"]),
            "due_date": r["due_date"],
            "overdue_days": int(r["overdue_days"]),
            "priority": _severity_from_row(r),
            "status": r["status"],
        }
        for _, r in open_tasks.iterrows()
    ]


# ---------------------------------------------------------------------------
# Report Problem — signalling problem reports raised by SMMS staff.
#
# Stored in its own append-only dataset, backend/data/SMMS_PROBLEM_REPORTS.csv,
# so SMMS_MAINTENANCE.csv / ASSETS.csv are never modified by this feature.
# Every rule below is enforced HERE, on the server: the frontend's dropdowns
# and hidden menu item are only a convenience.
# ---------------------------------------------------------------------------
PROBLEM_TYPES = [
    "Signal Failure",
    "Point Machine Failure",
    "Track Circuit Failure",
    "Axle Counter Failure",
    "Interlocking Issue",
    "Level Crossing Signalling Issue",
    "Cable / Communication Failure",
    "Signalling Power Supply Issue",
    "Other Signalling Problem",
]
PROBLEM_SEVERITIES = list(SEVERITY_ORDER)  # Low, Medium, High, Critical
IMMEDIATE_ACTIONS = [
    "No immediate action taken",
    "Asset isolated",
    "Manual signalling initiated",
    "Maintenance team informed",
    "Traffic control informed",
]
PROBLEM_REPORT_INITIAL_STATUS = "Open"
PROBLEM_DESCRIPTION_MIN_LEN = 10
PROBLEM_DESCRIPTION_MAX_LEN = 1000

PROBLEM_REPORT_FIELDS = [
    "report_id", "reported_at", "reported_by", "asset_id", "problem_type",
    "severity", "description", "immediate_action", "status",
]

# Reads/appends of the CSV happen under this lock so two simultaneous
# submissions can never be handed the same report ID or interleave a row.
_problem_reports_lock = threading.Lock()

# Characters that make Excel/Sheets treat a cell as a formula. Free text that
# starts with one of them is stored with a leading apostrophe (OWASP "CSV
# injection" guidance) and un-escaped again when read back through the API.
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _problem_reports_path() -> str:
    return os.path.join(DATA_DIR, "SMMS_PROBLEM_REPORTS.csv")


def _csv_safe(value: str) -> str:
    return "'" + value if value.startswith(_CSV_FORMULA_PREFIXES) else value


def _csv_unsafe(value: str) -> str:
    if value.startswith("'") and value[1:].startswith(_CSV_FORMULA_PREFIXES):
        return value[1:]
    return value


def _read_problem_reports() -> List[Dict[str, str]]:
    """Caller must hold _problem_reports_lock."""
    path = _problem_reports_path()
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as fh:
        return [
            {k: _csv_unsafe(v or "") for k, v in row.items() if k in PROBLEM_REPORT_FIELDS}
            for row in csv.DictReader(fh)
        ]


def _append_problem_report(row: Dict[str, str]) -> None:
    """Caller must hold _problem_reports_lock. Append-only: existing rows are
    never rewritten."""
    path = _problem_reports_path()
    needs_header = not os.path.exists(path) or os.path.getsize(path) == 0
    needs_newline = False
    if not needs_header:
        with open(path, "rb") as fh:
            fh.seek(-1, os.SEEK_END)
            needs_newline = fh.read(1) not in (b"\n", b"\r")
    with open(path, "a", newline="", encoding="utf-8") as fh:
        if needs_newline:
            fh.write("\r\n")  # the file was hand-edited without a trailing newline
        writer = csv.DictWriter(fh, fieldnames=PROBLEM_REPORT_FIELDS)
        if needs_header:
            writer.writeheader()
        writer.writerow({k: _csv_safe(str(row.get(k, ""))) for k in PROBLEM_REPORT_FIELDS})


def _next_problem_report_id(existing: List[Dict[str, str]], now: datetime) -> str:
    """SPR-YYYYMMDD-NNNN — a per-day sequence, unique because it is derived
    from the stored rows while the lock is held."""
    prefix = f"SPR-{now:%Y%m%d}-"
    used = [
        int(r["report_id"][len(prefix):])
        for r in existing
        if r.get("report_id", "").startswith(prefix) and r["report_id"][len(prefix):].isdigit()
    ]
    return f"{prefix}{(max(used) + 1 if used else 1):04d}"


def _validate_problem_report(payload: Dict[str, Any]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """Returns (clean_values, field_errors). Nothing the client sends is trusted:
    every choice is checked against the server-side lists / signalling register."""
    clean: Dict[str, str] = {}
    errors: Dict[str, str] = {}

    def text(key: str) -> str:
        value = payload.get(key)
        return value.strip() if isinstance(value, str) else ""

    # Asset must exist in the SIGNALLING register (ASSETS.csv, department == "Signal").
    asset_id = text("asset_id")
    signalling_ids = set(_signalling_assets()["asset_id"])
    if not asset_id:
        errors["asset_id"] = "Select the affected signalling asset."
    elif asset_id not in signalling_ids:
        errors["asset_id"] = "Select a signalling asset from the register."
    else:
        clean["asset_id"] = asset_id

    for key, allowed, label in (
        ("problem_type", PROBLEM_TYPES, "a problem type"),
        ("severity", PROBLEM_SEVERITIES, "a severity"),
        ("immediate_action", IMMEDIATE_ACTIONS, "the immediate action taken"),
    ):
        value = text(key)
        if not value:
            errors[key] = f"Select {label}."
        elif value not in allowed:
            errors[key] = f"'{value}' is not a valid option."
        else:
            clean[key] = value

    raw_description = payload.get("description")
    if raw_description is not None and not isinstance(raw_description, str):
        errors["description"] = "Description must be text."
    else:
        description = _CONTROL_CHARS.sub("", (raw_description or "").replace("\r\n", "\n").replace("\r", "\n")).strip()
        if len(description) < PROBLEM_DESCRIPTION_MIN_LEN:
            errors["description"] = (
                f"Describe the problem in at least {PROBLEM_DESCRIPTION_MIN_LEN} characters "
                "(symptoms, what was observed, where)."
            )
        elif len(description) > PROBLEM_DESCRIPTION_MAX_LEN:
            errors["description"] = f"Description must be {PROBLEM_DESCRIPTION_MAX_LEN} characters or fewer."
        else:
            clean["description"] = description

    return clean, errors


@router.get("/problem-reports/options")
def problem_report_options(user: dict = Depends(require_permission("signalling.problem_reports.create"))):
    """The dropdown choices and limits for the Report Problem form — served
    from the same constants the POST endpoint validates against, so the form
    and the server can never disagree."""
    return {
        "problem_types": PROBLEM_TYPES,
        "severities": PROBLEM_SEVERITIES,
        "immediate_actions": IMMEDIATE_ACTIONS,
        "description_min_length": PROBLEM_DESCRIPTION_MIN_LEN,
        "description_max_length": PROBLEM_DESCRIPTION_MAX_LEN,
    }


@router.post("/problem-reports", status_code=201)
def create_problem_report(
    payload: Dict[str, Any],
    user: dict = Depends(require_permission("signalling.problem_reports.create")),
):
    clean, errors = _validate_problem_report(payload)
    if errors:
        raise HTTPException(400, {"message": "Please correct the highlighted fields.", "errors": errors})

    now = datetime.now(timezone.utc)
    try:
        with _problem_reports_lock:
            report_id = _next_problem_report_id(_read_problem_reports(), now)
            record = {
                "report_id": report_id,
                "reported_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),  # UTC, same format as the audit trail
                # Always the authenticated user from the signed token — never a client-supplied name.
                "reported_by": user["username"],
                "asset_id": clean["asset_id"],
                "problem_type": clean["problem_type"],
                "severity": clean["severity"],
                "description": clean["description"],
                "immediate_action": clean["immediate_action"],
                "status": PROBLEM_REPORT_INITIAL_STATUS,
            }
            _append_problem_report(record)
    except OSError:
        audit.log_action(
            user, "SIGNALLING_PROBLEM_REPORTED", "signalling.problem_report", None, "FAILED",
            f"storage error; asset={clean['asset_id']}; severity={clean['severity']}",
        )
        raise HTTPException(500, "The problem report could not be stored. Please try again.")

    audit.log_action(
        user, "SIGNALLING_PROBLEM_REPORTED", "signalling.problem_report", report_id, "SUCCESS",
        f"asset={record['asset_id']}; problem_type={record['problem_type']}; "
        f"severity={record['severity']}; immediate_action={record['immediate_action']}",
    )
    return record


@router.get("/problem-reports")
def list_problem_reports(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    asset_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(require_permission("signalling.problem_reports.view")),
):
    """Submitted problem reports, newest first."""
    with _problem_reports_lock:
        rows = _read_problem_reports()
    if status:
        rows = [r for r in rows if r["status"] == status]
    if severity:
        rows = [r for r in rows if r["severity"] == severity]
    if asset_id:
        rows = [r for r in rows if r["asset_id"] == asset_id]
    rows.sort(key=lambda r: (r["reported_at"], r["report_id"]), reverse=True)
    return rows[:limit]


# ---------------------------------------------------------------------------
# Digital Twin — one operational view of a single signalling asset.
#
#   GET /api/smms/digital-twin/{twin_id}
#
# This is NOT a second asset system. The twin is assembled on demand from the
# data the Signalling Map, Asset Register, Failures, Maintenance and Report
# Problem features already read:
#   * the asset entity itself comes from build_signalling_map() — the same
#     merge/status/criticality logic the map uses, so the twin and the map can
#     never disagree about what an asset is or what state it is in;
#   * problem reports come from SMMS_PROBLEM_REPORTS.csv via the existing
#     reader (and only for assets that are in the signalling register, because
#     that is the only place a report can be raised against).
#
# `twin_id` is the map's own `map_id` ("REG:SIG_004" for a register asset,
# "MNT:SIG_153:COR_20:106.2:Point" for an asset listed only in maintenance
# records). A bare asset id is accepted as shorthand for its register entry.
# Asset ids are NOT unique across the datasets, which is why the map_id — not
# the asset id — identifies a twin.
#
# Nothing is invented. Anything the datasets do not hold is returned as null
# (with a reason in `unavailable`), never as a placeholder value.
# ---------------------------------------------------------------------------
TWIN_FAILURE_TYPES = ("Corrective", "Emergency")
# Failure-risk cut-offs. 0.6 is the value the Asset Register already uses to
# flag a high-risk asset; 0.3 splits the remainder into Medium / Low.
TWIN_RISK_HIGH = 0.6
TWIN_RISK_MEDIUM = 0.3
_TWIN_ALERT_LEVEL_BY_SEVERITY = {"Critical": "critical", "High": "critical", "Medium": "warning", "Low": "info"}
_TWIN_ALERT_ORDER = {"critical": 0, "warning": 1, "info": 2}


def _twin_clean(value: Any) -> Optional[str]:
    """CSV-sourced text -> str, or None when the dataset holds no value."""
    if value is None:
        return None
    text = str(value).strip()
    return None if text.lower() in ("", "nan", "none", "nat") else text


def _twin_record(rec: Dict[str, Any]) -> Dict[str, Any]:
    """One maintenance record as the twin shows it. `severity` is set for
    failure-type records (Corrective / Emergency) whatever their status, using
    the same criticality + safety-risk rule the Failures page uses."""
    is_failure_type = rec["maintenance_type"] in TWIN_FAILURE_TYPES
    return {
        "task_id": rec["task_id"],
        "maintenance_type": rec["maintenance_type"],
        "defect_type": rec["defect_type"],
        "status": rec["status"],
        "priority": rec["priority"],
        "severity": _severity_from_row(rec) if is_failure_type else None,
        "due_date": rec["due_date"],
        "overdue_days": rec["overdue_days"],
        "estimated_duration_min": rec["estimated_duration_min"],
        "crew_required": rec["crew_required"],
        "criticality": rec["criticality"],
        "safety_risk": rec["safety_risk"],
        "is_failure_type": is_failure_type,
        "is_open": rec["status"] != "Completed",
    }


def _twin_worst(levels: List[str]) -> Optional[str]:
    known = [x for x in levels if x in SEVERITY_ORDER]
    return max(known, key=SEVERITY_ORDER.index) if known else None


def _twin_risk(failure_risk: Optional[float], open_records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Risk level = the worse of (a) the register's failure_risk banded by the
    cut-offs above and (b) the highest priority among open maintenance
    records (their own criticality + safety-risk scores). Either input may be
    missing; with neither there is no level."""
    candidates: List[str] = []
    basis: List[str] = []
    if failure_risk is not None:
        band = "High" if failure_risk >= TWIN_RISK_HIGH else "Medium" if failure_risk >= TWIN_RISK_MEDIUM else "Low"
        candidates.append(band)
        basis.append(
            f"Failure risk {round(failure_risk * 100)}% = {band} "
            f"(High from {round(TWIN_RISK_HIGH * 100)}%, Medium from {round(TWIN_RISK_MEDIUM * 100)}%)"
        )
    worst_open = _twin_worst([r["priority"] for r in open_records])
    if worst_open:
        candidates.append(worst_open)
        basis.append(f"Highest open maintenance priority is {worst_open} (from criticality and safety-risk scores)")
    level = _twin_worst(candidates)
    return {
        "level": level,
        "failure_risk": failure_risk,
        "basis": "; ".join(basis) if basis else (
            "No failure-risk value is on record for this asset and it has no open maintenance to assess."
        ),
    }


def _twin_health(entity: Dict[str, Any]) -> Dict[str, Any]:
    fr = entity.get("failure_risk")
    return {
        "percent": round((1.0 - float(fr)) * 100) if fr is not None else None,
        "status": entity["status"],
        "status_label": entity["status_label"],
        "basis": (
            "Health index = 100% minus the failure risk held in the asset register."
            if fr is not None
            else "No failure-risk value is on record for this asset (it is listed only in maintenance records), "
                 "so a health percentage cannot be calculated."
        ),
    }


def _twin_problem_reports(entity: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    if not role_has_permission(user.get("role"), "signalling.problem_reports.view"):
        return {"available": False, "reason": "Your role cannot view submitted problem reports.", "note": None, "items": []}
    if entity["source"] != "register":
        # Reports are validated against the signalling register, so none can
        # belong to an asset that only appears in maintenance records (even if
        # a register asset happens to share its id).
        return {
            "available": True, "reason": None, "items": [],
            "note": "Problem reports can only be raised against assets in the signalling register; "
                    "this asset is listed only in maintenance records.",
        }
    try:
        with _problem_reports_lock:
            rows = _read_problem_reports()
    except (OSError, csv.Error):
        return {"available": False, "reason": "Problem reports could not be read right now.", "note": None, "items": []}
    items = [r for r in rows if r.get("asset_id") == entity["asset_id"]]
    items.sort(key=lambda r: (r.get("reported_at", ""), r.get("report_id", "")), reverse=True)
    return {"available": True, "reason": None, "note": None, "items": items}


def _twin_alerts(
    entity: Dict[str, Any],
    records: List[Dict[str, Any]],
    reports: Dict[str, Any],
) -> List[Dict[str, Any]]:
    alerts: List[Dict[str, Any]] = []
    open_records = [r for r in records if r["is_open"]]

    for r in open_records:
        if r["is_failure_type"]:
            overdue = f" · {r['overdue_days']} day(s) overdue" if r["overdue_days"] > 0 else ""
            alerts.append({
                "level": _TWIN_ALERT_LEVEL_BY_SEVERITY.get(r["severity"], "info"),
                "title": f"Open {r['maintenance_type'].lower()} failure — {r['defect_type']}",
                "detail": f"{r['task_id']} · {r['severity']} severity · {r['status']} · due {r['due_date']}{overdue}",
                "source": "Failures", "ref": r["task_id"],
            })
        elif r["overdue_days"] > 0:
            alerts.append({
                "level": "warning",
                "title": f"Maintenance overdue by {r['overdue_days']} day(s)",
                "detail": f"{r['task_id']} · {r['maintenance_type']} · {r['defect_type']} · {r['status']} · due {r['due_date']}",
                "source": "Maintenance", "ref": r["task_id"],
            })
    in_progress = [r for r in open_records if r["status"] == "In Progress"]
    if in_progress:
        alerts.append({
            "level": "info",
            "title": "Maintenance in progress",
            "detail": ", ".join(r["task_id"] for r in in_progress),
            "source": "Maintenance", "ref": in_progress[0]["task_id"],
        })

    reg = entity.get("register_status")
    if reg == "Critical":
        alerts.append({
            "level": "critical", "title": "Asset register status is Critical",
            "detail": "The signalling asset register lists this asset as Critical.", "source": "Asset register", "ref": None,
        })
    elif reg == "Degraded":
        alerts.append({
            "level": "warning", "title": "Asset register status is Degraded",
            "detail": "The signalling asset register lists this asset as Degraded.", "source": "Asset register", "ref": None,
        })

    for p in reports["items"]:
        if p.get("status") == PROBLEM_REPORT_INITIAL_STATUS:
            alerts.append({
                "level": _TWIN_ALERT_LEVEL_BY_SEVERITY.get(p.get("severity", ""), "info"),
                "title": f"Open problem report — {p.get('problem_type', 'Problem')}",
                "detail": f"{p.get('report_id')} · {p.get('severity')} severity · reported {str(p.get('reported_at', ''))[:10]}",
                "source": "Problem reports", "ref": p.get("report_id"),
            })

    if not entity["position"]["exact"]:
        alerts.append({
            "level": "info", "title": "Position along the section is not exact",
            "detail": "The recorded chainage lies outside the section length, so the asset is treated as section-level.",
            "source": "Location", "ref": None,
        })
    alerts.sort(key=lambda a: _TWIN_ALERT_ORDER[a["level"]])
    return alerts


def _twin_timeline(
    entity: Dict[str, Any],
    records: List[Dict[str, Any]],
    reports: Dict[str, Any],
    last_maintenance: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Lifecycle events that the datasets actually hold, newest first. Each
    event says what its date means (`date_kind`) because the datasets record
    different things: a register 'last maintenance' date is when work was
    performed, a task's date is when it was DUE, a report's date is when it
    was raised."""
    events: List[Dict[str, Any]] = []

    if last_maintenance:
        events.append({
            "id": "register-last-maintenance", "date": last_maintenance["date"], "date_kind": "performed",
            "kind": "maintenance", "state": "done", "title": "Last maintenance performed",
            "detail": "Recorded in the signalling asset register.", "severity": None, "status": None, "ref": None,
        })
    if entity.get("next_due_date"):
        events.append({
            "id": "register-next-maintenance", "date": _twin_clean(entity["next_due_date"]), "date_kind": "due",
            "kind": "maintenance", "state": "planned", "title": "Next maintenance due",
            "detail": "Scheduled in the signalling asset register.", "severity": None, "status": None, "ref": None,
        })

    for r in records:
        overdue = f" · {r['overdue_days']} day(s) overdue" if r["is_open"] and r["overdue_days"] > 0 else ""
        if r["is_failure_type"]:
            events.append({
                "id": r["task_id"], "date": r["due_date"], "date_kind": "due", "kind": "failure",
                "state": "open" if r["is_open"] else "done",
                "title": f"Failure: {r['defect_type']}",
                "detail": f"{r['task_id']} · {r['maintenance_type']} · {r['severity']} severity · {r['status']}{overdue}",
                "severity": r["severity"], "status": r["status"], "ref": r["task_id"],
            })
        else:
            events.append({
                "id": r["task_id"], "date": r["due_date"], "date_kind": "due", "kind": "maintenance",
                "state": "open" if r["is_open"] else "done",
                "title": f"{r['maintenance_type']} maintenance: {r['defect_type']}",
                "detail": f"{r['task_id']} · {r['status']}{overdue}",
                "severity": None, "status": r["status"], "ref": r["task_id"],
            })

    for p in reports["items"]:
        reported_at = _twin_clean(p.get("reported_at"))
        events.append({
            "id": p.get("report_id"), "date": reported_at[:10] if reported_at else None,
            "date_kind": "reported", "kind": "problem", "state": p.get("status", ""),
            "title": f"Problem reported: {p.get('problem_type', 'Problem')}",
            "detail": f"{p.get('report_id')} · {p.get('severity')} severity · {p.get('status')} · by {p.get('reported_by')}",
            "severity": p.get("severity"), "status": p.get("status"), "ref": p.get("report_id"),
        })

    # Newest first; undated events last.
    events.sort(key=lambda e: (e["date"] is not None, e["date"] or "", str(e["id"])), reverse=True)
    return events


def build_digital_twin(twin_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    model = build_signalling_map()
    assets = model["assets"]
    entity = next((a for a in assets if a["map_id"] == twin_id), None)
    if entity is None and ":" not in twin_id:
        entity = next((a for a in assets if a["map_id"] == f"REG:{twin_id}"), None)
    if entity is None:
        raise HTTPException(404, f"No signalling asset found for digital twin '{twin_id}'.")

    section = next((s for s in model["sections"] if s["corridor_id"] == entity["corridor_id"]), None)
    stations = {s["id"]: s for s in model["stations"]}

    records = sorted(
        (_twin_record(r) for r in entity["maintenance"]),
        key=lambda r: (r["due_date"], r["task_id"]), reverse=True,
    )
    open_records = [r for r in records if r["is_open"]]
    failure_records = [r for r in records if r["is_failure_type"]]
    reports = _twin_problem_reports(entity, user)

    # ---- maintenance dates ------------------------------------------------
    last_date = _twin_clean(entity.get("last_maintenance_date"))
    last_maintenance = {"date": last_date, "source": "Signalling asset register"} if last_date else None
    next_date = _twin_clean(entity.get("next_due_date"))
    next_maintenance: Optional[Dict[str, Any]] = None
    if next_date:
        next_maintenance = {"date": next_date, "source": "Signalling asset register", "task_id": None, "overdue_days": None}
    elif open_records:
        first = min(open_records, key=lambda r: (r["due_date"], r["task_id"]))
        next_maintenance = {
            "date": first["due_date"], "source": f"Open maintenance task {first['task_id']}",
            "task_id": first["task_id"], "overdue_days": first["overdue_days"],
        }

    # ---- what the datasets do not hold -----------------------------------
    unavailable: List[Dict[str, str]] = [
        {"key": "installation_date", "label": "Installation / registration date",
         "reason": "Neither the asset register nor the maintenance data records when an asset was installed or registered."},
        {"key": "inspections", "label": "Inspection records",
         "reason": "No inspection records exist in the datasets."},
        {"key": "status_history", "label": "Status change history",
         "reason": "Only the current status is stored; earlier status changes are not recorded."},
    ]
    if any(not r["is_open"] for r in records):
        unavailable.append({
            "key": "completion_dates", "label": "Maintenance completion dates",
            "reason": "Completed tasks carry only the date they were due, not the date the work was finished.",
        })
    if entity["source"] != "register":
        unavailable.append({
            "key": "register_details", "label": "Asset register details",
            "reason": "This asset is listed only in maintenance records, so its register status, failure risk, "
                      "availability target and last-maintenance date are not on file.",
        })

    from_st, to_st = stations.get(entity["station_from"]), stations.get(entity["station_to"])

    def station(s: Optional[Dict[str, Any]], fallback: str) -> Dict[str, Any]:
        return {"id": fallback, "code": s["code"], "name": s["name"], "division": s["division"]} if s else {
            "id": fallback, "code": None, "name": None, "division": None,
        }

    report_reason: Optional[str] = None
    if entity["source"] != "register":
        report_reason = "Problem reports can only be raised against assets in the signalling register."
    elif not role_has_permission(user.get("role"), "signalling.problem_reports.create"):
        report_reason = "Your role cannot submit problem reports."

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "twin_id": entity["map_id"],
        "identity": {
            "asset_id": entity["asset_id"],
            "asset_type": entity["asset_type"],
            "category": entity["category"],
            "source": entity["source"],
            "maintenance_record_ids": [r["task_id"] for r in records] if entity["source"] == "maintenance" else [],
        },
        "location": {
            "corridor_id": entity["corridor_id"],
            "section_label": entity["section_label"],
            "section_length_km": entity["section_length_km"],
            "location_km": entity["location_km"],
            "position_exact": entity["position"]["exact"],
            "latitude": entity["position"]["latitude"] if entity["position"]["exact"] else None,
            "longitude": entity["position"]["longitude"] if entity["position"]["exact"] else None,
            "station_from": station(from_st, entity["station_from"]),
            "station_to": station(to_st, entity["station_to"]),
            "track_count": section["track_count"] if section else None,
            "section_type": section["section_type"] if section else None,
            "electrified": section["electrified"] if section else None,
            "traffic_density": section["traffic_density"] if section else None,
        },
        "condition": {
            "status": entity["status"],
            "status_label": entity["status_label"],
            "status_basis": entity["status_basis"],
            "register_status": entity["register_status"],
            "health": _twin_health(entity),
            "risk": _twin_risk(entity.get("failure_risk"), open_records),
            "criticality_rating": entity["criticality_rating"],
            "criticality_source": entity["criticality_source"],
            "availability_target_pct": entity["availability_target_pct"],
            "is_critical_asset": entity["is_critical_asset"],
        },
        "summary": {
            "open_failures": sum(1 for r in failure_records if r["is_open"]),
            "open_maintenance": len(open_records),
            "overdue_maintenance": sum(1 for r in open_records if r["overdue_days"] > 0),
            "open_problem_reports": (
                sum(1 for p in reports["items"] if p.get("status") == PROBLEM_REPORT_INITIAL_STATUS)
                if reports["available"] else None
            ),
        },
        "alerts": _twin_alerts(entity, records, reports),
        "maintenance": {
            "last": last_maintenance,
            "next": next_maintenance,
            "open": open_records,
            "history": records,
            "counts": {
                "total": len(records),
                "open": len(open_records),
                "completed": len(records) - len(open_records),
                "overdue": sum(1 for r in open_records if r["overdue_days"] > 0),
            },
        },
        "failures": {
            "open": [r for r in failure_records if r["is_open"]],
            "history": failure_records,
            "counts": {
                "total": len(failure_records),
                "open": sum(1 for r in failure_records if r["is_open"]),
                "completed": sum(1 for r in failure_records if not r["is_open"]),
            },
        },
        "problem_reports": reports,
        "timeline": _twin_timeline(entity, records, reports, last_maintenance),
        "unavailable": unavailable,
        "notes": entity["notes"],
        "actions": {"report_problem": {"available": report_reason is None, "reason": report_reason}},
    }


@router.get("/digital-twin/{twin_id}")
def get_digital_twin(twin_id: str, user: dict = Depends(require_permission("signalling.digital_twin.view"))):
    """Operational Digital Twin of one signalling asset: identity, location,
    condition (status / health / risk), maintenance and failure history,
    problem reports, alerts and a lifecycle timeline. Read-only."""
    return build_digital_twin(twin_id, user)
