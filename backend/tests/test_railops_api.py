"""
Verification test script for Railway Operations and Maintenance Dashboard reading directly from CSV datasets.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_railops_csv_apis():
    # 1. Stations directly from RAILWAY_NETWORK.csv
    res = client.get("/api/stations")
    assert res.status_code == 200, f"Failed /api/stations: {res.text}"
    stations = res.json()
    assert len(stations) >= 10, f"Expected >= 10 stations, got {len(stations)}"
    station_names = [s["name"] for s in stations]
    for required in ["Chennai Central", "Arakkonam Jn", "Katpadi Jn", "Salem Junction", "Erode Junction", "Coimbatore Jn", "KSR Bengaluru"]:
        assert any(required in name for name in station_names), f"Missing required station name {required}"
    print(f"PASS: /api/stations returned {len(stations)} authentic stations from CSV")

    # 2. Routes directly from RAILWAY_NETWORK.csv
    res = client.get("/api/routes")
    assert res.status_code == 200, f"Failed /api/routes: {res.text}"
    routes = res.json()
    assert len(routes) == 20, f"Expected 20 routes from RAILWAY_NETWORK.csv, got {len(routes)}"
    route_ids = [r["id"] for r in routes]
    assert "COR_01" in route_ids, "Missing route COR_01"
    print(f"PASS: /api/routes returned {len(routes)} corridors from RAILWAY_NETWORK.csv")

    # 3. Trains directly from TRAINS.csv
    res = client.get("/api/trains")
    assert res.status_code == 200, f"Failed /api/trains: {res.text}"
    trains = res.json()
    assert len(trains) > 0, f"Expected trains from TRAINS.csv, got {len(trains)}"
    print(f"PASS: /api/trains returned {len(trains)} trains loaded from TRAINS.csv")

    # 4. Maintenance Blocks directly from COA_BLOCK_AVAILABILITY.csv
    res = client.get("/api/maintenance-blocks")
    assert res.status_code == 200, f"Failed /api/maintenance-blocks: {res.text}"
    blocks = res.json()
    assert len(blocks) > 0, f"Expected blocks from COA_BLOCK_AVAILABILITY.csv, got {len(blocks)}"
    print(f"PASS: /api/maintenance-blocks returned {len(blocks)} blocks from COA_BLOCK_AVAILABILITY.csv")

    # 5. Route Status Matrix from CSV
    res = client.get("/api/route-status")
    assert res.status_code == 200, f"Failed /api/route-status: {res.text}"
    route_status = res.json()
    assert "COR_01" in route_status, "Missing COR_01 in route status"
    print(f"PASS: /api/route-status returned dynamic status for {len(route_status)} routes")

    # 6. Live State Endpoint reading directly from CSV
    res = client.get("/api/live/state")
    assert res.status_code == 200, f"Failed /api/live/state: {res.text}"
    live_state = res.json()
    assert "active_date" in live_state
    assert "metrics" in live_state
    assert live_state["metrics"]["active_trains"] > 0
    print(f"PASS: /api/live/state returned real-time operations payload for date {live_state['active_date']}")

    # 7. AI Priority Prediction endpoint
    res = client.post("/api/ai/predict-priority", json={
        "criticality": 5,
        "urgency": 5,
        "safety_risk": 5,
        "overdue_days": 15,
        "gross_million_tonnes": 90.0,
        "track_age_years": 16.0,
        "is_peak_hour": True
    })
    assert res.status_code == 200, f"Failed /api/ai/predict-priority: {res.text}"
    ai_pred = res.json()
    assert "urgency_score" in ai_pred
    print(f"PASS: AI priority prediction output: {ai_pred['priority_label']}, score {ai_pred['urgency_score']}")

    print("\nALL CSV DATA ENGINE APIS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    test_railops_csv_apis()
