"""Centralized RBAC for NEXORA.

COA is the main operations/admin role for the SIH prototype, so the COA demo
account receives the same full permission set as the COA_ADMIN role.  SMMS/TMS/TDMS
users retain their department identity while the existing dashboards remain
independently reachable.
"""
from typing import Dict, List, Optional, Set

COA_ADMIN = "COA_ADMIN"
SMMS_USER = "SMMS_USER"
STANDARD_USER = "STANDARD_USER"

ALL_ROLES: List[str] = [COA_ADMIN, SMMS_USER, STANDARD_USER]
ROLE_LABELS: Dict[str, str] = {
    COA_ADMIN: "COA • Corridor Operations Authority",
    SMMS_USER: "SMMS • Signalling Maintenance",
    STANDARD_USER: "NEXORA User",
}

ALL_PERMISSIONS: List[str] = [
    "dashboard.view", "network.view", "network.manage",
    "blocks.view", "blocks.create", "blocks.edit", "blocks.approve",
    "plans.view", "plans.generate", "plans.edit", "plans.simulate",
    "analytics.view", "rl.view", "rl.train",
    "maintenance.view", "maintenance.create", "maintenance.edit",
    "signalling.view", "signalling.assets.view", "signalling.assets.manage",
    "signalling.maintenance.view", "signalling.maintenance.create",
    "signalling.maintenance.edit", "signalling.maintenance.complete",
    "signalling.failures.view", "signalling.failures.create", "signalling.failures.update",
    "signalling.problem_reports.view", "signalling.problem_reports.create",
    "signalling.digital_twin.view", "alerts.view", "ai.copilot", "ai.explainability",
    "ai.simulation", "audit.view",
]

ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    COA_ADMIN: set(ALL_PERMISSIONS),
    SMMS_USER: {
        "dashboard.view", "network.view", "plans.view", "analytics.view", "alerts.view",
        "ai.copilot", "ai.explainability", "ai.simulation", "audit.view",
        "maintenance.view", "maintenance.create", "maintenance.edit", "signalling.view",
        "signalling.assets.view", "signalling.assets.manage", "signalling.maintenance.view",
        "signalling.maintenance.create", "signalling.maintenance.edit", "signalling.maintenance.complete",
        "signalling.failures.view", "signalling.failures.create", "signalling.failures.update",
        "signalling.problem_reports.view", "signalling.problem_reports.create",
        "signalling.digital_twin.view",
    },
    STANDARD_USER: {
        "dashboard.view", "network.view", "network.manage", "blocks.view", "blocks.create",
        "blocks.edit", "plans.view", "plans.generate", "plans.edit", "plans.simulate",
        "analytics.view", "rl.view", "rl.train", "maintenance.view", "maintenance.create",
        "maintenance.edit", "alerts.view", "ai.copilot", "ai.explainability", "ai.simulation",
    },
}

def permissions_for_role(role: Optional[str]) -> List[str]:
    return sorted(ROLE_PERMISSIONS.get(role or "", set()))

def role_has_permission(role: Optional[str], permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role or "", set())
