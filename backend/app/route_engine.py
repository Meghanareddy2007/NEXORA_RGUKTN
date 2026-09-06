"""
Rail Network Graph Engine: Conflict Detection, Rerouting, and Availability Matrix.
Handles graph traversal, Dijkstra shortest path around blocked sections,
and simulation state at arbitrary simulation times (e.g. 06:00 to 22:00).
"""

import copy
import heapq
from typing import Dict, List, Any, Optional, Set, Tuple
from app.simulation_data import STATIONS_DATA, ROUTES_DATA, MAINTENANCE_BLOCKS_DATA, TRAINS_DATA


class RailNetworkEngine:
    def __init__(self):
        self.stations = {s["id"]: copy.deepcopy(s) for s in STATIONS_DATA}
        self.routes = {r["id"]: copy.deepcopy(r) for r in ROUTES_DATA}
        self.maintenance_blocks = [copy.deepcopy(b) for b in MAINTENANCE_BLOCKS_DATA]
        self.trains = {t["id"]: copy.deepcopy(t) for t in TRAINS_DATA}
        self.alerts: List[Dict[str, Any]] = []
        self._build_graph()

    def _build_graph(self):
        """Construct adjacency graph with distances."""
        self.adj: Dict[str, List[Tuple[str, float, str]]] = {s: [] for s in self.stations}
        for rid, r in self.routes.items():
            u, v, dist = r["source_station"], r["destination_station"], float(r["distance"])
            self.adj[u].append((v, dist, rid))
            self.adj[v].append((u, dist, rid))  # Bidirectional lines

    def find_alternative_route(
        self, origin: str, destination: str, blocked_routes: Set[str]
    ) -> Optional[List[str]]:
        """
        Dijkstra pathfinding avoiding any route in blocked_routes.
        Returns list of station IDs.
        """
        dist = {s: float("inf") for s in self.stations}
        prev: Dict[str, Optional[str]] = {s: None for s in self.stations}
        dist[origin] = 0
        pq = [(0, origin)]

        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue
            if u == destination:
                break

            for v, weight, rid in self.adj.get(u, []):
                if rid in blocked_routes:
                    continue
                # Route must also not be UNDER_MAINTENANCE or BLOCKED
                route_obj = self.routes.get(rid)
                if route_obj and route_obj["status"] in ["UNDER_MAINTENANCE", "BLOCKED", "EMERGENCY_BLOCK"]:
                    continue

                new_d = d + weight
                if new_d < dist[v]:
                    dist[v] = new_d
                    prev[v] = u
                    heapq.heappush(pq, (new_d, v))

        if dist[destination] == float("inf"):
            return None

        # Reconstruct path
        path = []
        curr = destination
        while curr is not None:
            path.append(curr)
            curr = prev[curr]
        path.reverse()
        return path

    def _time_to_minutes(self, t_str: str) -> int:
        h, m = map(int, t_str.split(":"))
        return h * 60 + m

    def _minutes_to_time(self, minutes: int) -> str:
        h = (minutes // 60) % 24
        m = minutes % 60
        return f"{h:02d}:{m:02d}"

    def update_simulation_time(self, current_time: str) -> Dict[str, Any]:
        """
        Advances the simulation to current_time (e.g. '10:30', '11:00').
        1. Updates Maintenance Block status (SCHEDULED -> IN_PROGRESS -> COMPLETED)
        2. Updates Route status (AVAILABLE, MAINTENANCE_SCHEDULED, UNDER_MAINTENANCE, etc.)
        3. Detects Train conflicts
        4. Calculates train positions and alternative routes
        """
        now_min = self._time_to_minutes(current_time)
        blocked_routes: Set[str] = set()
        active_blocks: List[Dict[str, Any]] = []
        upcoming_blocks: List[Dict[str, Any]] = []

        # Reset route statuses
        for r in self.routes.values():
            r["status"] = "AVAILABLE"

        # 1. Process Maintenance Blocks
        for b in self.maintenance_blocks:
            start_min = self._time_to_minutes(b["start_time"])
            end_min = self._time_to_minutes(b["end_time"])
            rid = b["route_id"]

            if now_min >= end_min:
                b["status"] = "COMPLETED"
            elif now_min >= start_min:
                b["status"] = "UNDER_MAINTENANCE"
                blocked_routes.add(rid)
                active_blocks.append(b)
                if rid in self.routes:
                    self.routes[rid]["status"] = "UNDER_MAINTENANCE"
            elif start_min - now_min <= 60:
                # Within 1 hour of activation
                b["status"] = "SCHEDULED"
                upcoming_blocks.append(b)
                if rid in self.routes and self.routes[rid]["status"] == "AVAILABLE":
                    self.routes[rid]["status"] = "MAINTENANCE_SCHEDULED"
            else:
                b["status"] = "SCHEDULED"

        # 2. Conflict Detection & Alerts
        alerts: List[Dict[str, Any]] = []

        # Emergency or active block alerts
        for b in active_blocks:
            rid = b["route_id"]
            route = self.routes.get(rid, {})
            s_from = self.stations.get(route.get("source_station", ""), {}).get("name", route.get("source_station"))
            s_to = self.stations.get(route.get("destination_station", ""), {}).get("name", route.get("destination_station"))
            alerts.append({
                "id": f"ALERT-BLK-{b['id']}",
                "type": "ROUTE_BLOCKED",
                "severity": "CRITICAL" if b["priority"] == "High" else "HIGH",
                "title": f"Route Under Maintenance: {b['id']}",
                "message": f"Corridor {s_from} \u2192 {s_to} is blocked for {b['activity']} until {b['end_time']}.",
                "route_id": rid,
                "block_id": b["id"],
                "suggested_action": f"Reroute affected traffic via {b.get('alternative_corridor', 'Alternative Corridor')}",
            })

        # Check trains for conflicts
        for tid, train in self.trains.items():
            curr_route_id = train["current_route"]
            # Check if current or upcoming route is blocked
            is_conflicted = curr_route_id in blocked_routes

            # If train is heading into a blocked route soon
            sched = train.get("scheduled_route", [])
            for i in range(len(sched) - 1):
                u, v = sched[i], sched[i+1]
                # Find route connecting u and v
                for r in self.routes.values():
                    if (r["source_station"] == u and r["destination_station"] == v) or (r["source_station"] == v and r["destination_station"] == u):
                        if r["id"] in blocked_routes:
                            is_conflicted = True
                            break

            if is_conflicted:
                train["status"] = "REROUTED" if train.get("is_rerouted") else "DELAYED"
                alt_path = self.find_alternative_route(train["origin"], train["destination"], blocked_routes)
                if alt_path and not train.get("is_rerouted"):
                    alt_names = [self.stations.get(s, {}).get("name", s) for s in alt_path]
                    alerts.append({
                        "id": f"ALERT-TR-{tid}",
                        "type": "TRAIN_CONFLICT",
                        "severity": "HIGH",
                        "title": f"\u26a0 Train {tid} ({train['name']}) Affected",
                        "message": f"Train {tid} cannot proceed on blocked route. Dynamic re-routing available.",
                        "train_id": tid,
                        "suggested_action": f"Reroute via: {' \u2192 '.join(alt_names)}",
                        "alternative_route": alt_path,
                    })

        # 3. Compute dynamic train position progress along their routes
        for tid, train in self.trains.items():
            dep_min = self._time_to_minutes(train["departure_time"])
            arr_min = self._time_to_minutes(train["expected_arrival"])
            total_duration = max(1, arr_min - dep_min)

            if now_min < dep_min:
                train["progress_percentage"] = 0.0
                train["status"] = "SCHEDULED"
            elif now_min >= arr_min:
                train["progress_percentage"] = 100.0
                train["status"] = "ARRIVED"
            else:
                elapsed = now_min - dep_min
                pct = min(99.0, max(1.0, (elapsed / total_duration) * 100))
                train["progress_percentage"] = round(pct, 1)
                if train["status"] not in ["DELAYED", "REROUTED"]:
                    train["status"] = "RUNNING"

            # Update route visually if train is active on it
            if train["status"] in ["RUNNING", "REROUTED"] and train["current_route"] in self.routes:
                c_route = self.routes[train["current_route"]]
                if c_route["status"] == "AVAILABLE":
                    c_route["status"] = "ACTIVE_TRAIN"

        self.alerts = alerts

        # Compile Live Ops Metrics
        active_trains_count = sum(1 for t in self.trains.values() if t["status"] in ["RUNNING", "REROUTED", "DELAYED"])
        active_blocks_count = len(active_blocks)
        unavailable_routes_count = sum(1 for r in self.routes.values() if r["status"] in ["UNDER_MAINTENANCE", "BLOCKED", "EMERGENCY_BLOCK"])
        delayed_trains_count = sum(1 for t in self.trains.values() if t["status"] in ["DELAYED", "REROUTED"])

        return {
            "simulation_time": current_time,
            "metrics": {
                "active_trains": active_trains_count,
                "active_maintenance_blocks": active_blocks_count,
                "unavailable_routes": unavailable_routes_count,
                "delayed_trains": delayed_trains_count,
            },
            "stations": list(self.stations.values()),
            "routes": list(self.routes.values()),
            "trains": list(self.trains.values()),
            "maintenance_blocks": self.maintenance_blocks,
            "alerts": self.alerts,
        }

    def reroute_train(self, train_id: str) -> Dict[str, Any]:
        """Dynamically apply alternative corridor reroute for a train."""
        if train_id not in self.trains:
            return {"success": False, "error": f"Train {train_id} not found"}

        train = self.trains[train_id]
        blocked_routes = {b["route_id"] for b in self.maintenance_blocks if b["status"] == "UNDER_MAINTENANCE"}
        alt_path = self.find_alternative_route(train["origin"], train["destination"], blocked_routes)

        if not alt_path:
            return {"success": False, "error": "No viable alternative corridor found"}

        train["scheduled_route"] = alt_path
        train["is_rerouted"] = True
        train["status"] = "REROUTED"
        train["delay_minutes"] = train.get("delay_minutes", 0) + 18  # Slight reroute detour penalty

        # If Train 12641 Kovai Express is rerouted around Salem -> Erode via Karur:
        if train_id == "12641":
            train["current_route"] = "R_SA_KRR"

        return {
            "success": True,
            "train_id": train_id,
            "new_route": alt_path,
            "delay_minutes": train["delay_minutes"],
            "status": "REROUTED",
        }

    def trigger_emergency_block(self, route_id: str, reason: str = "Urgent Rail Crack Detected") -> Dict[str, Any]:
        """Inject emergency block for live hackathon demonstration."""
        if route_id not in self.routes:
            return {"success": False, "error": "Invalid route ID"}

        r = self.routes[route_id]
        r["status"] = "EMERGENCY_BLOCK"

        new_block = {
            "id": f"EMG-{len(self.maintenance_blocks) + 1:03d}",
            "route_id": route_id,
            "location": f"{r['source_station']} \u2192 {r['destination_station']}",
            "source_station": r["source_station"],
            "destination_station": r["destination_station"],
            "departments": "Engineering (Emergency Gang)",
            "department_list": ["Engineering"],
            "activity": reason,
            "start_time": "10:00",
            "end_time": "14:00",
            "priority": "Emergency",
            "status": "UNDER_MAINTENANCE",
            "estimated_delay_min": 45,
            "alternative_corridor": "Dynamic Loop Divert",
            "allowed_tracks": "All Lines Blocked for Safety",
            "description": f"Emergency halt: {reason}. Safety crews dispatched with tamping machine.",
        }
        self.maintenance_blocks.append(new_block)
        return {"success": True, "block": new_block}


# Global engine instance
rail_engine = RailNetworkEngine()
