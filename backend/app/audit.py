"""
Audit trail - records security-relevant and operational actions.

Additive, same pattern as app/db.py and app/auth.py: a new table
(`audit_log`) in the existing backend/data/app.db SQLite file. Nothing
else is touched.
"""
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.db import get_conn


def init_audit_db() -> None:
    conn = get_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                username TEXT,
                role TEXT,
                department TEXT,
                action TEXT NOT NULL,
                resource TEXT,
                resource_id TEXT,
                result TEXT NOT NULL,
                detail TEXT
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def log_action(
    user: Optional[Dict[str, Any]],
    action: str,
    resource: Optional[str] = None,
    resource_id: Optional[str] = None,
    result: str = "SUCCESS",
    detail: Optional[str] = None,
) -> None:
    """Best-effort audit write. Never raises - a logging failure must not
    break the request it's auditing."""
    try:
        conn = get_conn()
        try:
            conn.execute(
                """
                INSERT INTO audit_log
                    (timestamp, username, role, department, action, resource, resource_id, result, detail)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    (user or {}).get("username"),
                    (user or {}).get("role"),
                    (user or {}).get("department"),
                    action,
                    resource,
                    str(resource_id) if resource_id is not None else None,
                    result,
                    detail,
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass


def list_audit(limit: int = 200, username: Optional[str] = None, action: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_conn()
    try:
        query = "SELECT * FROM audit_log"
        clauses = []
        params: List[Any] = []
        if username:
            clauses.append("username = ?")
            params.append(username)
        if action:
            clauses.append("action = ?")
            params.append(action)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
