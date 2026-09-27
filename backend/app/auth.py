"""Small, self-contained authentication layer for the SIH prototype."""
import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional

from fastapi import Header, HTTPException

from app.db import get_conn
from app.rbac import ROLE_LABELS, SMMS_USER, STANDARD_USER, COA_ADMIN, permissions_for_role

SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "sih-ps27-dev-secret-change-me")
TOKEN_TTL_SECONDS = 12 * 60 * 60

DEFAULT_USERS = [
    {"username": "smms_user", "password": "smms123", "department": "SMMS", "role": SMMS_USER, "full_name": "Signal & Telecom (SMMS)"},
    {"username": "tms_user", "password": "tms123", "department": "TMS", "role": STANDARD_USER, "full_name": "Engineering / Track (TMS)"},
    {"username": "traction_user", "password": "traction123", "department": "TRACTION", "role": STANDARD_USER, "full_name": "Traction Distribution (TDMS)"},
    # COA is the main operations/admin account in the merged prototype.
    {"username": "coa_user", "password": "coa123", "department": "COA", "role": COA_ADMIN, "full_name": "Corridor Operating Authority (COA)"},
]

def _hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()

def _verify_password(password: str, stored: str) -> bool:
    try:
        salt_b64, digest_b64 = stored.split("$")
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
    except Exception:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return hmac.compare_digest(actual, expected)

def init_auth_db() -> None:
    conn = get_conn()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                department TEXT NOT NULL,
                role TEXT NOT NULL,
                full_name TEXT,
                created_at TEXT NOT NULL
            )
        """)
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "role" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN role TEXT")
        if "full_name" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN full_name TEXT")
        conn.commit()
        # COA is the single main operations/admin account in this prototype.
        # Remove any legacy standalone ADMIN account from older database versions.
        conn.execute("DELETE FROM users WHERE username=? OR department=?", ("admin", "ADMIN"))
        conn.execute("UPDATE users SET role=? WHERE role=?", (COA_ADMIN, "SYSTEM_ADMIN"))
        conn.commit()
        existing = {row["username"] for row in conn.execute("SELECT username FROM users").fetchall()}
        for user in DEFAULT_USERS:
            if user["username"] not in existing:
                conn.execute(
                    "INSERT INTO users (username,password_hash,department,role,full_name,created_at) VALUES (?,?,?,?,?,datetime('now'))",
                    (user["username"], _hash_password(user["password"]), user["department"], user["role"], user["full_name"]),
                )
            else:
                conn.execute(
                    "UPDATE users SET role=?, department=?, full_name=? WHERE username=?",
                    (user["role"], user["department"], user["full_name"], user["username"]),
                )
        conn.commit()
    finally:
        conn.close()

def _get_user(username: str):
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def _sign(payload_b64: str) -> str:
    return base64.urlsafe_b64encode(hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).digest()).decode()

def create_token(username: str, department: str, role: str) -> str:
    payload = {"sub": username, "dept": department, "role": role, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
    return f"{raw}.{_sign(raw)}"

def _decode_token(token: str) -> dict:
    try:
        payload_b64, signature = token.split(".", 1)
        if not hmac.compare_digest(_sign(payload_b64), signature):
            raise ValueError("bad signature")
        payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode()).decode())
        if int(payload["exp"]) < int(time.time()):
            raise ValueError("expired")
        return payload
    except Exception as exc:
        raise HTTPException(401, "Invalid or expired session — please log in again.") from exc

def login_user(username: str, password: str) -> Optional[dict]:
    user = _get_user(username)
    if not user or not _verify_password(password, user["password_hash"]):
        return None
    role = user.get("role") or STANDARD_USER
    return {
        "access_token": create_token(user["username"], user["department"], role),
        "token_type": "bearer",
        "username": user["username"],
        "department": user["department"],
        "role": role,
        "role_label": ROLE_LABELS.get(role, role),
        "full_name": user.get("full_name") or user["username"],
        "permissions": permissions_for_role(role),
    }

def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated — missing bearer token.")
    payload = _decode_token(authorization.removeprefix("Bearer ").strip())
    role = payload.get("role") or STANDARD_USER
    return {"username": payload["sub"], "department": payload["dept"], "role": role, "permissions": permissions_for_role(role)}
