"""
Core AI optimization engine for automatic block planning.

Pipeline (matches the "HOW THE DATA IS USED" flow in the dataset plan):
  1. Load maintenance tasks (TMS + SMMS + TDMS) -> unify into one task pool
  2. Priority scoring (criticality, urgency, safety_risk, overdue_days)
  3. Task grouping (same corridor, compatible department, mergeable duration)
  4. Match tasks against COA_BLOCK_AVAILABILITY windows (constraints)
  5. OR-Tools CP-SAT optimizer: assign tasks -> blocks
       maximize total priority score scheduled
       minimize traffic disruption (penalize High-traffic blocks / conflicts)
     subject to:
       - each task assigned to at most one block
       - sum(duration of tasks assigned to a block) <= block duration
       - task's department must be in block's allowed_departments
       - task's corridor must match block's corridor
       - block status must be "Available"
  6. Output: optimized schedule + unscheduled backlog + KPIs
"""
from dataclasses import dataclass
from typing import List, Dict, Any
import pandas as pd
from ortools.sat.python import cp_model

DEPT_MAP = {"TMS": "Engineering", "SMMS": "Signal", "TDMS": "Traction"}
TRAFFIC_PENALTY = {"Low": 0, "Med": 3, "High": 8}


def load_task_pool(data_dir: str) -> pd.DataFrame:
    frames = []
    for prefix, fname in [("TMS", "TMS_MAINTENANCE.csv"), ("SMMS", "SMMS_MAINTENANCE.csv"), ("TDMS", "TDMS_MAINTENANCE.csv")]:
        df = pd.read_csv(f"{data_dir}/{fname}")
        df["source"] = prefix
        df["department"] = DEPT_MAP[prefix]
        frames.append(df)
    tasks = pd.concat(frames, ignore_index=True, sort=False)
    tasks = tasks[tasks["status"].isin(["Pending", "Scheduled"])].reset_index(drop=True)
    return tasks


def load_blocks(data_dir: str) -> pd.DataFrame:
    blocks = pd.read_csv(f"{data_dir}/COA_BLOCK_AVAILABILITY.csv")
    blocks = blocks[blocks["status"] == "Available"].reset_index(drop=True)
    return blocks


def priority_score(row) -> float:
    """Higher = more urgent to schedule. Weighted blend, overdue days capped."""
    overdue_component = min(row["overdue_days"], 30) / 30.0 * 10  # 0-10
    return (
        row["criticality"] * 2.5
        + row["urgency"] * 2.0
        + row["safety_risk"] * 3.0
        + overdue_component
    )


def run_optimization(data_dir: str, max_tasks: int = 150, max_blocks: int = 60, time_limit_sec: int = 15) -> Dict[str, Any]:
    tasks = load_task_pool(data_dir)
    blocks = load_blocks(data_dir)

    tasks["priority_score"] = tasks.apply(priority_score, axis=1)
    # Trim for solver tractability in a demo context (still representative)
    tasks = tasks.sort_values("priority_score", ascending=False).head(max_tasks).reset_index(drop=True)
    blocks = blocks.head(max_blocks).reset_index(drop=True)

    model = cp_model.CpModel()
    n_tasks, n_blocks = len(tasks), len(blocks)

    # x[t, b] = 1 if task t assigned to block b
    x = {}
    feasible_pairs = []
    for t in range(n_tasks):
        trow = tasks.iloc[t]
        for b in range(n_blocks):
            brow = blocks.iloc[b]
            same_corridor = trow["corridor_id"] == brow["corridor_id"]
            dept_allowed = trow["department"] in str(brow["allowed_departments"]).split("|")
            fits_duration = trow["estimated_duration_min"] <= brow["duration_min"]
            if same_corridor and dept_allowed and fits_duration:
                x[t, b] = model.NewBoolVar(f"x_{t}_{b}")
                feasible_pairs.append((t, b))

    if not feasible_pairs:
        return {"scheduled": [], "unscheduled": tasks.to_dict("records"),
                "kpis": {"total_tasks": n_tasks, "scheduled_count": 0, "scheduled_pct": 0.0,
                         "total_priority_scheduled": 0.0, "note": "No feasible task-block pairs found."}}

    # Each task assigned to at most 1 block
    for t in range(n_tasks):
        pairs_t = [x[t, b] for b in range(n_blocks) if (t, b) in x]
        if pairs_t:
            model.Add(sum(pairs_t) <= 1)

    # Block capacity: sum of durations assigned to a block <= block duration
    for b in range(n_blocks):
        brow = blocks.iloc[b]
        pairs_b = [(t, x[t, b]) for t in range(n_tasks) if (t, b) in x]
        if pairs_b:
            model.Add(sum(tasks.iloc[t]["estimated_duration_min"] * var for t, var in pairs_b) <= int(brow["duration_min"]))

    # Objective: maximize scheduled priority score, penalize high-traffic / conflict-heavy blocks used
    objective_terms = []
    for (t, b), var in x.items():
        trow, brow = tasks.iloc[t], blocks.iloc[b]
        gain = trow["priority_score"] * 10
        penalty = TRAFFIC_PENALTY.get(brow["traffic_level"], 0) + brow["train_conflict_count"] * 2
        objective_terms.append(int(round(gain - penalty)) * var)
    model.Maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_sec
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    scheduled, scheduled_task_idx = [], set()
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for (t, b), var in x.items():
            if solver.Value(var) == 1:
                trow, brow = tasks.iloc[t], blocks.iloc[b]
                scheduled.append({
                    "task_id": trow["task_id"],
                    "source": trow["source"],
                    "department": trow["department"],
                    "corridor_id": trow["corridor_id"],
                    "defect_type": trow["defect_type"],
                    "priority_score": round(float(trow["priority_score"]), 2),
                    "estimated_duration_min": int(trow["estimated_duration_min"]),
                    "block_id": brow["block_id"],
                    "date": brow["date"],
                    "start_time": brow["start_time"],
                    "end_time": brow["end_time"],
                    "traffic_level": brow["traffic_level"],
                    "train_conflict_count": int(brow["train_conflict_count"]),
                })
                scheduled_task_idx.add(t)

    unscheduled = tasks.drop(index=list(scheduled_task_idx)).fillna("").to_dict("records")

    total_priority_all = float(tasks["priority_score"].sum())
    total_priority_sched = sum(s["priority_score"] for s in scheduled)
    kpis = {
        "total_tasks_considered": n_tasks,
        "scheduled_count": len(scheduled),
        "unscheduled_count": len(unscheduled),
        "scheduled_pct": round(100 * len(scheduled) / n_tasks, 1) if n_tasks else 0,
        "total_priority_scheduled": round(total_priority_sched, 1),
        "total_priority_pct": round(100 * total_priority_sched / total_priority_all, 1) if total_priority_all else 0,
        "blocks_used": len({s["block_id"] for s in scheduled}),
        "blocks_available": n_blocks,
        "solver_status": solver.StatusName(status),
        "solve_time_sec": round(solver.WallTime(), 2),
    }
    return {"scheduled": scheduled, "unscheduled": unscheduled, "kpis": kpis}
