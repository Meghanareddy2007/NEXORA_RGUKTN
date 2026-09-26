"""
Centralized Role-Based Access Control (RBAC) for NEXORA — SMMS-focused.

Scope, deliberately kept simple:
  - SMMS_USER      : the Signalling Maintenance role — the actual focus of
                      this build, with full signalling asset/failure/
                      maintenance capabilities.
  - SYSTEM_ADMIN    : full access to everything (including SMMS), for
                      oversight/demo purposes.
  - STANDARD_USER   : everyone else (Track/Traction/Corridor accounts) —
                      unchanged NEXORA behaviour, no signalling access.

This is the SINGLE SOURCE OF TRUTH for which permissions exist and which
role has them. The FastAPI dependency `require_permission()` is the ONE
place backend authorization happens — nothing else hard-codes a role
check. The token is HMAC-signed server-side (see app/auth.py), so a client
can never forge or upgrade its own role/permissions.
"""
from typing import Dict, List, Optional, Set

from fastapi import Header, HTTPException, Request

# ---------------------------------------------------------------------------
# 1. Roles
# ---------------------------------------------------------------------------
SYSTEM_ADMIN = "SYSTEM_ADMIN"
SMMS_USER = "SMMS_USER"
STANDARD_USER = "STANDARD_USER"

ALL_ROLES: List[str] = [SYSTEM_ADMIN, SMMS_USER, STANDARD_USER]

ROLE_LABELS: Dict[str, str] = {
    SYSTEM_ADMIN: "System Administrator",
    SMMS_USER: "SMMS \u2022 Signalling Maintenance",
    STANDARD_USER: "NEXORA User",
}

# ---------------------------------------------------------------------------
# 2. Permissions (granular, dot-namespaced)
# ---------------------------------------------------------------------------
ALL_PERMISSIONS: List[str] = [
    "dashboard.view",
    "network.view",
    "network.manage",
    "blocks.view",
    "blocks.create",
    "blocks.edit",
    "blocks.approve",
    "plans.view",
    "plans.generate",
    "plans.edit",
    "plans.simulate",
    "analytics.view",
    "rl.view",
    "rl.train",
    "maintenance.view",
    "maintenance.create",
    "maintenance.edit",
    "signalling.view",
    "signalling.assets.view",
    "signalling.assets.manage",
    "signalling.maintenance.view",
    "signalling.maintenance.create",
    "signalling.maintenance.edit",
    "signalling.maintenance.complete",
    "signalling.failures.view",
    "signalling.failures.create",
    "signalling.failures.update",
    "signalling.problem_reports.view",
    "signalling.problem_reports.create",
    "signalling.digital_twin.view",
    "alerts.view",
    "ai.copilot",
    "ai.explainability",
    "ai.simulation",
    "audit.view",
]

# ---------------------------------------------------------------------------
# 3. Role -> Permission grants
# ---------------------------------------------------------------------------
ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    SYSTEM_ADMIN: set(ALL_PERMISSIONS),

    # SMMS: the actual focus of this build. Full signalling
    # assets/maintenance/failures authority, plus the shared
    # situational-awareness views it needs (network, plans, analytics,
    # alerts, AI, audit) — no block/plan approval authority.
    SMMS_USER: {
        "dashboard.view",
        "network.view",
        "plans.view",
        "analytics.view",
        "alerts.view",
        "ai.copilot", "ai.explainability", "ai.simulation",
        "audit.view",
        "maintenance.view", "maintenance.create", "maintenance.edit",
        "signalling.view",
        "signalling.assets.view", "signalling.assets.manage",
        "signalling.maintenance.view", "signalling.maintenance.create",
        "signalling.maintenance.edit", "signalling.maintenance.complete",
        "signalling.failures.view", "signalling.failures.create", "signalling.failures.update",
        "signalling.problem_reports.view", "signalling.problem_reports.create",
        "signalling.digital_twin.view",
    },

    # Everyone else — unchanged NEXORA behaviour (Track/Traction/Corridor
    # accounts). No signalling module access; block approval is still
    # gated by department (see require_department in app/auth.py), same
    # as the original app, not by this permission system.
    STANDARD_USER: {
        "dashboard.view", "network.view", "network.manage",
        "blocks.view", "blocks.create", "blocks.edit",
        "plans.view", "plans.generate", "plans.edit", "plans.simulate",
        "analytics.view", "rl.view", "rl.train",
        "maintenance.view", "maintenance.create", "maintenance.edit",
        "alerts.view",
        "ai.copilot", "ai.explainability", "ai.simulation",
    },
}


def permissions_for_role(role: Optional[str]) -> List[str]:
    return sorted(ROLE_PERMISSIONS.get(role or "", set()))


def role_has_permission(role: Optional[str], permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role or "", set())


# ---------------------------------------------------------------------------
# 4. FastAPI dependency
# ---------------------------------------------------------------------------
def require_permission(permission: str):
    """
    FastAPI dependency factory - the ONE place backend authorization
    happens for permission-based (as opposed to legacy department-based)
    checks:

        @app.post("/api/smms/maintenance/{id}/complete")
        def complete(..., user: dict = Depends(require_permission("signalling.maintenance.complete"))):
            ...

    Verifies: valid signed session -> role from that session -> role has
    the requested permission. Any failure is a 401 (not authenticated) or
    403 (authenticated but not authorized); 403s are written to the audit
    trail so unauthorized-access attempts are traceable.
    """

    def _dep(request: Request, authorization: Optional[str] = Header(None)) -> dict:
        from app.auth import get_current_user  # local import: avoid circular import
        from app import audit

        user = get_current_user(authorization)
        if not role_has_permission(user.get("role"), permission):
            audit.log_action(
                user=user,
                action="UNAUTHORIZED_ACCESS_ATTEMPT",
                resource=str(request.url.path),
                resource_id=None,
                result="DENIED",
                detail=f"Missing permission '{permission}'",
            )
            raise HTTPException(
                403,
                {
                    "message": "You don't have permission to perform this action.",
                    "required_permission": permission,
                    "your_role": user.get("role"),
                },
            )
        return user

    return _dep
