from __future__ import annotations

from typing import Any

from powerfarm.projection import InstitutionalState, matching_authorities


def explain_authority(
    state: InstitutionalState,
    *,
    office: str,
    action: str,
    subject: str,
    at: str,
) -> dict[str, Any]:
    matches = matching_authorities(state, office, action, subject, at)
    return {
        "office": office,
        "action": action,
        "subject": subject,
        "at": at,
        "authorized": bool(matches),
        "selected": matches[0] if matches else None,
        "alternatives": matches[1:],
        "root": state.root_office == office,
    }
