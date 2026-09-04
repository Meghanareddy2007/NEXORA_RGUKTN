"""
Lightweight SQLite persistence for the Block Planning module.

Why SQLite (not another CSV): maintenance requests submitted from the
"Generate Plan" form are user-generated records, not part of the seeded
demo dataset, so they need a real, durable store that survives restarts
and supports simple querying (status, ordering). Stdlib sqlite3 keeps
this dependency-free.

DB file lives at backend/data/app.db (created automatically on first run).
"""
import json
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "app.db")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the maintenance_requests table if it doesn't exist yet. Safe to call on every startup."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS maintenance_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id TEXT NOT NULL,
                asset_label TEXT,
                corridor_id TEXT NOT NULL,
                corridor_label TEXT,
                maintenance_type TEXT,
                required_duration_hrs REAL,
                priority TEXT,
                preferred_date TEXT,
                time_window TEXT,
                status TEXT DEFAULT 'Pending Approval',
                candidates_json TEXT,
                selected_option_index INTEGER,
                selected_block_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    d["required_duration_hrs"] = float(d["required_duration_hrs"]) if d["required_duration_hrs"] is not None else None
    d["candidates"] = json.loads(d.pop("candidates_json")) if d.get("candidates_json") else []
    return d


def create_request(payload: Dict[str, Any], candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            INSERT INTO maintenance_requests
                (asset_id, asset_label, corridor_id, corridor_label, maintenance_type,
                 required_duration_hrs, priority, preferred_date, time_window,
                 status, candidates_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["asset_id"],
                payload.get("asset_label"),
                payload["corridor_id"],
                payload.get("corridor_label"),
                payload.get("maintenance_type"),
                payload.get("required_duration_hrs"),
                payload.get("priority"),
                payload.get("preferred_date"),
                payload.get("time_window"),
                "Pending Approval",
                json.dumps(candidates),
                now,
                now,
            ),
        )
        conn.commit()
        new_id = cur.lastrowid
        return get_request(new_id)  # type: ignore[return-value]
    finally:
        conn.close()


def list_requests() -> List[Dict[str, Any]]:
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM maintenance_requests ORDER BY id DESC"
        ).fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_request(request_id: int) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM maintenance_requests WHERE id = ?", (request_id,)
        ).fetchone()
        return _row_to_dict(row) if row else None
    finally:
        conn.close()


def select_option(request_id: int, option_index: int, block_id: str) -> Optional[Dict[str, Any]]:
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    conn = get_conn()
    try:
        conn.execute(
            """
            UPDATE maintenance_requests
            SET selected_option_index = ?, selected_block_id = ?, status = 'Approved', updated_at = ?
            WHERE id = ?
            """,
            (option_index, block_id, now, request_id),
        )
        conn.commit()
    finally:
        conn.close()
    return get_request(request_id)


def delete_request(request_id: int) -> None:
    conn = get_conn()
    try:
        conn.execute("DELETE FROM maintenance_requests WHERE id = ?", (request_id,))
        conn.commit()
    finally:
        conn.close()
