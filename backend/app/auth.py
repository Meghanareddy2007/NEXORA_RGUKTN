"""
Department-based login for the Block Planning app.

NEW FILE — does not modify any existing file's logic. Only main.py gets a
few additive lines (imports + new endpoints + Depends() on a couple of
write actions) to wire this in.

Design notes:
- Stdlib only (hashlib/hmac/json/base64) so nothing new needs to go in
  requirements.txt and nothing can fail to `pip install`.
- Uses the SAME sqlite file as db.py (backend/data/app.db) via db.get_conn(),
  just a new `users` table — the existing `maintenance_requests` table is
  untouched.
- Tokens are signed (HMAC-SHA256) and carry an expiry, so they're tamper-proof
  without needing a sessions table. Good enough for a hackathon prototype;
  swap SECRET_KEY via an env var before any real deployment.
"""
import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional

from fastapi import Header, HTTPException

from app.db import get_conn

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "sih-ps27-dev-secret-change-me")
TOKEN_TTL_SECONDS = 12 * 60 * 60  # 12 hours

# The four departments you asked for. "ADMIN" is added so one account can
# see/do everything (useful for you while demoing / debugging).
DEPARTMENTS = ["SMMS", "TMS", "TRACTION", "COA", "ADMIN"]

# Seeded demo accounts — one per department. Change/remove these once you
# have real users; this just gets the login working out of the box.
DEFAULT_USERS = [
    {"username": "smms_user", "password": "smms123", "department": "SMMS", "full_name": "Signal & Telecom (SMMS)"},
    {"username": "tms_user", "password": "tms123", "department": "TMS", "full_name": "Engineering / Track (TMS)"},
    {"username": "traction_user", "password": "traction123", "department": "TRACTION", "full_name": "Traction Distribution (TDMS)"},
    {"username": "coa_user", "password": "coa123", "department": "COA", "full_name": "Corridor Operating Authority (COA)"},
    {"username": "admin", "password": "admin123", "department": "ADMIN", "full_name": "System Administrator"},
]


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2, stdlib only — no bcrypt/passlib dependency)
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# DB setup — additive: a new `users` table in the existing app.db
# ---------------------------------------------------------------------------
def init_auth_db() -> None:
    """Create the users table (if missing) and seed default accounts. Safe to call every startup."""
    conn = get_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                department TEXT NOT NULL,
                full_name TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
        existing = {row["username"] for row in conn.execute("SELECT username FROM users").fetchall()}
        for u in DEFAULT_USERS:
            if u["username"] not in existing:
                conn.execute(
                    "INSERT INTO users (username, password_hash, department, full_name, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
                    (u["username"], _hash_password(u["password"]), u["department"], u["full_name"]),
                )
        conn.commit()
    finally:
        conn.close()


def _get_user(username: str):
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Token: base64(json payload) + "." + hmac signature — no external JWT lib
# ---------------------------------------------------------------------------
def _sign(payload_b64: str) -> str:
    sig = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode()


def create_token(username: str, department: str) -> str:
    payload = {"sub": username, "dept": department, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    return f"{payload_b64}.{_sign(payload_b64)}"


def _decode_token(token: str) -> dict:
    try:
        payload_b64, sig = token.split(".")
        if not hmac.compare_digest(_sign(payload_b64), sig):
            raise ValueError("bad signature")
        payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode()))
        if payload["exp"] < time.time():
            raise ValueError("expired")
        return payload
    except Exception:
        raise HTTPException(401, "Invalid or expired session — please log in again.")


# ---------------------------------------------------------------------------
# Public functions used by main.py
# ---------------------------------------------------------------------------
def login_user(username: str, password: str) -> Optional[dict]:
    user = _get_user(username)
    if not user or not _verify_password(password, user["password_hash"]):
        return None
    token = create_token(user["username"], user["department"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "department": user["department"],
        "full_name": user["full_name"],
    }


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """FastAPI dependency: reads the 'Authorization: Bearer <token>' header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated — missing bearer token.")
    token = authorization.removeprefix("Bearer ").strip()
    payload = _decode_token(token)
    return {"username": payload["sub"], "department": payload["dept"]}


def require_department(*allowed_departments: str):
    """
    FastAPI dependency factory. Use like:
        @app.post("/api/blocks/{id}/approve")
        def approve(..., user: dict = Depends(require_department("COA", "ADMIN"))):
    ADMIN is always allowed through automatically.
    """

    def _dep(authorization: Optional[str] = Header(None)) -> dict:
        user = get_current_user(authorization)
        if user["department"] != "ADMIN" and user["department"] not in allowed_departments:
            raise HTTPException(
                403,
                f"Your department ({user['department']}) doesn't have access to this action. "
                f"Allowed: {', '.join(allowed_departments)}.",
            )
        return user

    return _dep
