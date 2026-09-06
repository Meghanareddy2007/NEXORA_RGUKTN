"""
Synthetic dataset generator for SIH PS27 - AI-Powered Automatic Block Planning.
Matches the exact schema of the 7 datasets in the dataset plan:
  1. TMS_MAINTENANCE.csv      (Engineering/Track)
  2. SMMS_MAINTENANCE.csv     (Signal & Telecom)
  3. TDMS_MAINTENANCE.csv     (Traction/OHE)
  4. COA_BLOCK_AVAILABILITY.csv
  5. ASSETS.csv
  6. TRAINS.csv
  7. RAILWAY_NETWORK.csv

Row counts are configurable below (defaults are demo-scale; bump ROWS_* up
to match the poster's ~5,900-9,100 total rows for the final submission).
"""
import random
import string
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

random.seed(42)
np.random.seed(42)

OUT_DIR = "data"
NUM_CORRIDORS = 20
ROWS_TMS = 250
ROWS_SMMS = 250
ROWS_TDMS = 250
ROWS_COA = 150
ROWS_ASSETS = 120
ROWS_TRAINS = 600
ROWS_NETWORK = NUM_CORRIDORS

CORRIDORS = [f"COR_{i:02d}" for i in range(1, NUM_CORRIDORS + 1)]
STATIONS = [
    "Chennai_Central",
    "Arakkonam",
    "Katpadi",
    "Vellore",
    "Vaniyambadi",
    "Jolarpettai",
    "Bangarapet",
    "Krishnarajapuram",
    "Bengaluru_City",
    "Hosur",
    "Dharmapuri",
    "Salem",
    "Erode",
    "Karur",
    "Tiruppur",
    "Coimbatore",
    "Tiruchirappalli",
    "Dindigul",
]

DEFECT_TYPES_TRACK = ["Rail Crack", "Ballast Deficiency", "Track Geometry Fault", "Weld Failure", "Rail Wear"]
DEFECT_TYPES_SIGNAL = ["Signal Failure", "Point Malfunction", "Cable Fault", "Interlocking Fault", "Axle Counter Fault"]
DEFECT_TYPES_TRACTION = ["Catenary Damage", "OHE Wire Sag", "Insulator Failure", "Feeder Fault", "Pole Damage"]

MAINT_TYPES = ["Corrective", "Preventive", "Predictive", "Emergency"]
STATUSES = ["Pending", "Scheduled", "In Progress", "Completed"]
BLOCK_TYPES = ["Engineering", "Signal", "Traction", "Combined"]
TRAFFIC_LEVELS = ["Low", "Med", "High"]
TRAIN_TYPES = ["Passenger", "Goods", "Mail/Express", "Suburban"]


def rand_date(start_days=-10, end_days=20):
    return (datetime(2026, 9, 4) + timedelta(days=random.randint(start_days, end_days))).strftime("%Y-%m-%d")


def gen_maintenance_dataset(prefix, n, defect_pool, asset_type_col=False, source="ENGG"):
    rows = []
    for i in range(1, n + 1):
        due = rand_date(-5, 15)
        overdue = max(0, (datetime(2026, 9, 4) - datetime.strptime(due, "%Y-%m-%d")).days)
        row = {
            "task_id": f"{prefix}{i:04d}",
            "asset_id": f"{'TRK' if source=='ENGG' else 'SIG' if source=='SIGNAL' else 'OHE'}_{random.randint(1, 300):03d}",
            "corridor_id": random.choice(CORRIDORS),
            "location_km": round(random.uniform(0, 180), 1),
        }
        if asset_type_col:
            row["asset_type"] = random.choice(["Signal", "Point", "Cable", "Interlock"]) if source == "SIGNAL" else random.choice(["OHE", "Feeder", "Insulator", "Pole"])
        row.update({
            "defect_type": random.choice(defect_pool),
            "maintenance_type": random.choice(MAINT_TYPES),
            "criticality": random.randint(1, 5),
            "urgency": random.randint(1, 5),
            "safety_risk": random.randint(1, 5),
            "due_date": due,
            "overdue_days": overdue,
            "estimated_duration_min": random.choice([30, 45, 60, 90, 120, 150, 180]),
            "crew_required": random.randint(2, 8),
            "status": random.choices(STATUSES, weights=[0.5, 0.25, 0.15, 0.1])[0],
        })
        rows.append(row)
    return pd.DataFrame(rows)


def gen_coa_blocks(n):
    rows = []
    for i in range(1, n + 1):
        date = rand_date(0, 20)
        start_h = random.randint(0, 20)
        dur = random.choice([60, 90, 120, 150, 180, 210, 240])
        start = f"{start_h:02d}:{random.choice(['00','15','30','45'])}"
        end_dt = datetime.strptime(f"{date} {start}", "%Y-%m-%d %H:%M") + timedelta(minutes=dur)
        rows.append({
            "block_id": f"BLK{i:04d}",
            "corridor_id": random.choice(CORRIDORS),
            "date": date,
            "start_time": start,
            "end_time": end_dt.strftime("%H:%M"),
            "duration_min": dur,
            "traffic_level": random.choices(TRAFFIC_LEVELS, weights=[0.5, 0.3, 0.2])[0],
            "train_conflict_count": random.randint(0, 6),
            "block_type": random.choice(BLOCK_TYPES),
            "existing_block": random.choices(["Yes", "No"], weights=[0.3, 0.7])[0],
            "allowed_departments": "|".join(random.sample(["Engineering", "Signal", "Traction"], k=random.randint(1, 3))),
            "status": random.choices(["Available", "Booked", "Locked"], weights=[0.6, 0.3, 0.1])[0],
        })
    return pd.DataFrame(rows)


def gen_assets(n):
    rows = []
    for i in range(1, n + 1):
        dept = random.choice(["Engineering", "Signal", "Traction"])
        atype = {"Engineering": "Track", "Signal": "Signal", "Traction": "OHE"}[dept]
        last_maint = rand_date(-180, -5)
        rows.append({
            "asset_id": f"{'TRK' if dept=='Engineering' else 'SIG' if dept=='Signal' else 'OHE'}_{i:03d}",
            "asset_type": atype,
            "department": dept,
            "corridor_id": random.choice(CORRIDORS),
            "location_km": round(random.uniform(0, 180), 1),
            "asset_criticality": random.randint(1, 5),
            "availability_target_pct": round(random.uniform(92, 99.9), 1),
            "current_status": random.choices(["Normal", "Degraded", "Critical"], weights=[0.6, 0.3, 0.1])[0],
            "last_maintenance_date": last_maint,
            "next_due_date": rand_date(1, 60),
            "failure_risk": round(random.uniform(0, 1), 2),
        })
    return pd.DataFrame(rows)


def gen_trains(n):
    rows = []
    for i in range(1, n + 1):
        corridor = random.choice(CORRIDORS)
        s_from, s_to = random.sample(STATIONS, 2)
        dep_h = random.randint(0, 23)
        dep = f"{dep_h:02d}:{random.choice(['00','10','20','30','40','50'])}"
        arr_dt = datetime.strptime(dep, "%H:%M") + timedelta(minutes=random.randint(30, 300))
        rows.append({
            "train_id": f"TR{i:04d}",
            "train_number": random.randint(10000, 79999),
            "train_type": random.choices(TRAIN_TYPES, weights=[0.4, 0.35, 0.15, 0.1])[0],
            "origin": s_from,
            "destination": s_to,
            "corridor_id": corridor,
            "station_from": s_from,
            "station_to": s_to,
            "arrival_time": arr_dt.strftime("%H:%M"),
            "departure_time": dep,
            "scheduled_date": rand_date(0, 20),
            "direction": random.choice(["Up", "Down"]),
        })
    return pd.DataFrame(rows)


CORRIDOR_EDGES = [
    ("Chennai_Central", "Arakkonam", 69.0, 4, "Yes", "Triple", "High"),
    ("Arakkonam", "Katpadi", 61.0, 2, "Yes", "Double", "High"),
    ("Katpadi", "Vellore", 12.0, 2, "Yes", "Double", "Med"),
    ("Katpadi", "Vaniyambadi", 57.0, 2, "Yes", "Double", "High"),
    ("Vaniyambadi", "Jolarpettai", 26.0, 2, "Yes", "Double", "High"),
    ("Jolarpettai", "Bangarapet", 71.0, 2, "Yes", "Double", "Med"),
    ("Bangarapet", "Krishnarajapuram", 56.0, 2, "Yes", "Double", "High"),
    ("Krishnarajapuram", "Bengaluru_City", 14.0, 3, "Yes", "Triple", "High"),
    ("Bengaluru_City", "Hosur", 52.0, 1, "Yes", "Single", "Med"),
    ("Hosur", "Dharmapuri", 92.0, 1, "Yes", "Single", "Med"),
    ("Dharmapuri", "Salem", 63.0, 1, "Yes", "Single", "Med"),
    ("Jolarpettai", "Salem", 120.0, 2, "Yes", "Double", "High"),
    ("Salem", "Erode", 63.0, 2, "Yes", "Double", "High"),
    ("Salem", "Karur", 85.0, 1, "Yes", "Single", "Med"),
    ("Karur", "Erode", 65.0, 1, "Yes", "Single", "Med"),
    ("Erode", "Tiruppur", 50.0, 2, "Yes", "Double", "High"),
    ("Tiruppur", "Coimbatore", 50.0, 2, "Yes", "Double", "High"),
    ("Karur", "Tiruchirappalli", 78.0, 2, "Yes", "Double", "Med"),
    ("Karur", "Dindigul", 74.0, 1, "Yes", "Single", "Low"),
    ("Erode", "Dindigul", 108.0, 1, "Yes", "Single", "Low"),
]


def gen_network(n):
    rows = []
    for i, c in enumerate(CORRIDORS[:n]):
        s_from, s_to, dist, tracks, elec, sec, dens = CORRIDOR_EDGES[i % len(CORRIDOR_EDGES)]
        rows.append({
            "corridor_id": c,
            "station_from": s_from,
            "station_to": s_to,
            "distance_km": dist,
            "track_count": tracks,
            "electrified": elec,
            "section_type": sec,
            "traffic_density": dens,
        })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    import os
    os.makedirs(OUT_DIR, exist_ok=True)

    tms = gen_maintenance_dataset("TMS", ROWS_TMS, DEFECT_TYPES_TRACK, asset_type_col=False, source="ENGG")
    smms = gen_maintenance_dataset("SMMS", ROWS_SMMS, DEFECT_TYPES_SIGNAL, asset_type_col=True, source="SIGNAL")
    tdms = gen_maintenance_dataset("TDMS", ROWS_TDMS, DEFECT_TYPES_TRACTION, asset_type_col=True, source="TRACTION")
    coa = gen_coa_blocks(ROWS_COA)
    assets = gen_assets(ROWS_ASSETS)
    trains = gen_trains(ROWS_TRAINS)
    network = gen_network(ROWS_NETWORK)

    tms.to_csv(f"{OUT_DIR}/TMS_MAINTENANCE.csv", index=False)
    smms.to_csv(f"{OUT_DIR}/SMMS_MAINTENANCE.csv", index=False)
    tdms.to_csv(f"{OUT_DIR}/TDMS_MAINTENANCE.csv", index=False)
    coa.to_csv(f"{OUT_DIR}/COA_BLOCK_AVAILABILITY.csv", index=False)
    assets.to_csv(f"{OUT_DIR}/ASSETS.csv", index=False)
    trains.to_csv(f"{OUT_DIR}/TRAINS.csv", index=False)
    network.to_csv(f"{OUT_DIR}/RAILWAY_NETWORK.csv", index=False)

    print("Generated datasets:")
    for name, df in [("TMS_MAINTENANCE", tms), ("SMMS_MAINTENANCE", smms), ("TDMS_MAINTENANCE", tdms),
                      ("COA_BLOCK_AVAILABILITY", coa), ("ASSETS", assets), ("TRAINS", trains),
                      ("RAILWAY_NETWORK", network)]:
        print(f"  {name}: {len(df)} rows, {len(df.columns)} cols")
