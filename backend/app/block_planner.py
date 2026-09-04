"""
Block Planning module - powers the "Generate Plan" screen.

Two responsibilities:
  1. generate_candidates(): given a maintenance request (asset -> corridor,
     required duration, priority, preferred date/time window), score every
     matching Available block in COA_BLOCK_AVAILABILITY.csv and return a
     short list of ranked candidate time windows (mirrors the "AI Generated
     Plan - Candidate Time Windows" table).
  2. generate_plan_visualization(): given one chosen block, build a simple
     timeline payload (hour axis + maintenance bar + nearby trains with a
     Running/Delayed/Blocked status) for the "Plan Visualization" panel.

Kept dependency-free (pandas only, same as the rest of the backend) and
deterministic - no randomness, so the same inputs always produce the same
plan.
"""
import os
from typing import Any, Dict, List, Optional

import pandas as pd

DELAY_PER_CONFLICT_MIN = {"Low": 4, "Med": 8, "High": 12}
TRAFFIC_SCORE_PENALTY = {"Low": 0, "Med": 5, "High": 12}


def _corridor_labels(data_dir: str) -> Dict[str, str]:
    network = pd.read_csv(os.path.join(data_dir, "RAILWAY_NETWORK.csv"))
    return {
        r["corridor_id"]: f"{r['station_from']} \u2192 {r['station_to']}"
        for _, r in network.iterrows()
    }


def list_assets(data_dir: str) -> List[Dict[str, Any]]:
    """Asset dropdown source for the maintenance request form."""
    assets = pd.read_csv(os.path.join(data_dir, "ASSETS.csv"))
    labels = _corridor_labels(data_dir)
    out = []
    for _, r in assets.iterrows():
        corridor_label = labels.get(r["corridor_id"], r["corridor_id"])
        out.append(
            {
                "asset_id": r["asset_id"],
                "asset_type": r["asset_type"],
                "department": r["department"],
                "corridor_id": r["corridor_id"],
                "corridor_label": corridor_label,
                "current_status": r["current_status"],
                "label": f"{r['asset_id']} \u00b7 {r['asset_type']} ({corridor_label})",
            }
        )
    return out


def list_maintenance_types(data_dir: str) -> List[str]:
    frames = []
    for fname in ["TMS_MAINTENANCE.csv", "SMMS_MAINTENANCE.csv", "TDMS_MAINTENANCE.csv"]:
        path = os.path.join(data_dir, fname)
        if os.path.exists(path):
            frames.append(pd.read_csv(path)[["maintenance_type"]])
    if not frames:
        return ["Preventive", "Corrective", "Predictive"]
    combined = pd.concat(frames, ignore_index=True)
    return sorted(combined["maintenance_type"].dropna().unique().tolist())


def _parse_time_window(time_window: Optional[str]):
    """'06:00-12:00' -> ('06:00','12:00'). Returns None for 'Anytime' / unparsable input."""
    if not time_window or "anytime" in time_window.lower():
        return None
    parts = time_window.replace(" ", "").split("-")
    if len(parts) != 2:
        return None
    try:
        return parts[0][:5], parts[1][:5]
    except Exception:
        return None


def generate_candidates(
    data_dir: str,
    corridor_id: str,
    required_duration_min: int,
    preferred_date: Optional[str] = None,
    time_window: Optional[str] = None,
    priority: str = "MEDIUM",
    max_options: int = 3,
) -> List[Dict[str, Any]]:
    blocks = pd.read_csv(os.path.join(data_dir, "COA_BLOCK_AVAILABILITY.csv"))
    labels = _corridor_labels(data_dir)

    pool = blocks[(blocks["corridor_id"] == corridor_id) & (blocks["status"] == "Available")]
    fitting = pool[pool["duration_min"] >= required_duration_min]
    pool = fitting if len(fitting) else pool  # fall back rather than return nothing

    if preferred_date:
        on_date = pool[pool["date"] == preferred_date]
        pool = on_date if len(on_date) else pool

    win = _parse_time_window(time_window)
    if win:
        w_start, w_end = win
        windowed = pool[(pool["start_time"] >= w_start) & (pool["start_time"] <= w_end)]
        pool = windowed if len(windowed) else pool

    if pool.empty:
        return []

    corridor_label = labels.get(corridor_id, corridor_id)
    scored = []
    for _, r in pool.iterrows():
        trains_affected = int(r["train_conflict_count"])
        traffic = r["traffic_level"]
        duration_min = int(r["duration_min"])
        est_delay_min = trains_affected * DELAY_PER_CONFLICT_MIN.get(traffic, 8)
        duration_gap = abs(duration_min - required_duration_min)
        raw_score = 100 - trains_affected * 10 - TRAFFIC_SCORE_PENALTY.get(traffic, 5) - min(duration_gap / 10, 10)
        score = max(0, min(100, round(raw_score)))
        scored.append(
            {
                "block_id": r["block_id"],
                "corridor_id": corridor_id,
                "corridor_label": corridor_label,
                "date": r["date"],
                "start_time": r["start_time"],
                "end_time": r["end_time"],
                "duration_min": duration_min,
                "traffic_level": traffic,
                "trains_affected": trains_affected,
                "expected_delay_min": int(est_delay_min),
                "score": score,
            }
        )

    # De-dupe identical time windows, then keep the top N by score, then
    # present them ordered by start time (matches how a planner would read
    # a day's candidate windows top-to-bottom).
    seen, deduped = set(), []
    for c in sorted(scored, key=lambda x: -x["score"]):
        key = (c["date"], c["start_time"], c["end_time"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)
    top = deduped[:max_options]
    top.sort(key=lambda x: (x["date"], x["start_time"]))

    if not top:
        return []

    best_score = max(c["score"] for c in top)
    min_trains = min(c["trains_affected"] for c in top)
    min_delay = min(c["expected_delay_min"] for c in top)

    for i, c in enumerate(top, start=1):
        c["option"] = i
        if c["score"] == best_score:
            c["recommendation"] = "Best Option"
            reasons = ["Satisfies maintenance duration and resource availability"]
            if c["trains_affected"] == min_trains:
                reasons.insert(0, "Least number of trains affected among candidate windows")
            if c["expected_delay_min"] == min_delay:
                reasons.append("Minimal delay to train operations")
            if c["score"] >= 85:
                reasons.append("Higher asset-availability improvement")
            c["reasons"] = reasons
        elif c["score"] >= 55:
            c["recommendation"] = "Consider"
            c["reasons"] = []
        else:
            c["recommendation"] = "Not Recommended"
            c["reasons"] = []

    return top


def _to_pct(hhmm: str, base_minutes: int, total_minutes: int) -> float:
    h, m = map(int, hhmm.split(":")[:2])
    pct = ((h * 60 + m) - base_minutes) / total_minutes * 100
    return max(0.0, min(100.0, pct))


def _hour_label(h: int) -> str:
    h = h % 24
    period = "AM" if h < 12 else "PM"
    hour12 = h % 12 or 12
    return f"{hour12} {period}"


def generate_plan_visualization(data_dir: str, block: Dict[str, Any], max_trains: int = 4) -> Dict[str, Any]:
    corridor_id, date = block["corridor_id"], block["date"]
    start_time, end_time = block["start_time"], block["end_time"]

    trains = pd.read_csv(os.path.join(data_dir, "TRAINS.csv"))
    same = trains[(trains["corridor_id"] == corridor_id) & (trains["scheduled_date"] == date)]
    if same.empty:
        same = trains[trains["corridor_id"] == corridor_id]
    same = same.head(max_trains)

    sh = int(start_time.split(":")[0])
    eh = int(end_time.split(":")[0])
    range_start_h = max(0, sh - 1)
    range_end_h = min(23, max(eh + 2, range_start_h + 4))
    hours = list(range(range_start_h, range_end_h + 1))
    base_minutes = hours[0] * 60
    total_minutes = (hours[-1] - hours[0] + 1) * 60

    block_start_pct = _to_pct(start_time, base_minutes, total_minutes)
    block_end_pct = _to_pct(end_time, base_minutes, total_minutes)

    trains_out = []
    for _, t in same.iterrows():
        ref_time = t["departure_time"] if isinstance(t["departure_time"], str) else t["arrival_time"]
        pct = _to_pct(ref_time, base_minutes, total_minutes)
        if block_start_pct <= pct <= block_end_pct:
            status = "Blocked"
        elif abs(pct - block_start_pct) <= 6 or abs(pct - block_end_pct) <= 6:
            status = "Delayed"
        else:
            status = "Running"
        trains_out.append(
            {
                "train_id": t["train_id"],
                "train_number": str(t["train_number"]),
                "train_type": t["train_type"],
                "time": ref_time,
                "position_pct": round(pct, 1),
                "status": status,
            }
        )

    return {
        "corridor_id": corridor_id,
        "date": date,
        "hours": [_hour_label(h) for h in hours],
        "block": {
            "asset_label": block.get("asset_label", block.get("block_id")),
            "start_time": start_time,
            "end_time": end_time,
            "start_pct": round(block_start_pct, 1),
            "end_pct": round(block_end_pct, 1),
        },
        "trains": trains_out,
    }
