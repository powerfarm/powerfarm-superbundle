"""Development/test governance helpers.

Production authority should be created by governance tooling and signed, not by
an ADK process at startup. These helpers exist to make local institutions easy
to provision without teaching the runtime to create its own authority.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from powerfarm.kernel import Kernel

# Closing a run inherits the exact authority of its cited run.start in
# Continuum >=0.3.1. Only start authority must therefore be granted up front.
RUN_LIFECYCLE_ACTIONS: tuple[str, ...] = ("run.start",)


@dataclass(frozen=True)
class Grant:
    action: str
    subject: str = "*"


def create_office(kernel: Kernel, office_id: str, *, mandate: str, director: str, branch: str = "main", as_office: str = "director", request_id: str | None = None):
    return kernel.append(branch=branch, actor=director, office=as_office, kind="office.create", subject=f"office:{office_id}", payload={"mandate": mandate}, request_id=request_id or f"office-{office_id}")


def assign_occupancy(kernel: Kernel, office_id: str, principal: str, *, director: str, branch: str = "main", as_office: str = "director", request_id: str | None = None):
    return kernel.append(branch=branch, actor=director, office=as_office, kind="occupancy.assign", subject=f"office:{office_id}", payload={"principal": principal}, request_id=request_id or f"occupy-{office_id}-{principal}")


def grant(kernel: Kernel, office_id: str, grant_spec: Grant, *, director: str, branch: str = "main", as_office: str = "director", request_id: str | None = None):
    return kernel.append(branch=branch, actor=director, office=as_office, kind="authority.grant", subject=f"office:{office_id}", payload={"grantee_office": office_id, "action": grant_spec.action, "subject": grant_spec.subject}, request_id=request_id or f"grant-{office_id}-{grant_spec.action}-{grant_spec.subject}")


def grant_run_lifecycle(kernel: Kernel, office_id: str, *, director: str, branch: str = "main", run_subject: str = "run:*") -> list:
    return [grant(kernel, office_id, Grant(action="run.start", subject=run_subject), director=director, branch=branch)]


def provision_office(kernel: Kernel, office_id: str, *, mandate: str, principal: str, grants: Sequence[Grant], director: str, branch: str = "main", with_run_lifecycle: bool = True) -> list:
    events = [
        create_office(kernel, office_id, mandate=mandate, director=director, branch=branch),
        assign_occupancy(kernel, office_id, principal, director=director, branch=branch),
    ]
    events.extend(grant(kernel, office_id, spec, director=director, branch=branch) for spec in grants)
    if with_run_lifecycle:
        events.extend(grant_run_lifecycle(kernel, office_id, director=director, branch=branch))
    return events


def missing_run_lifecycle_grants(kernel: Kernel, office_id: str, *, branch: str = "main") -> list[str]:
    state = kernel.state(branch)
    granted: set[str] = set()
    for row in state.get("authority", []) if isinstance(state, dict) else []:
        if row.get("office") == office_id or row.get("grantee_office") == office_id:
            granted.add(str(row.get("action", "")))
    return [action for action in RUN_LIFECYCLE_ACTIONS if not _covered(action, granted)]


def _covered(action: str, patterns: Iterable[str]) -> bool:
    return any(pattern == action or pattern == "*" or (pattern.endswith("*") and action.startswith(pattern[:-1])) for pattern in patterns)
