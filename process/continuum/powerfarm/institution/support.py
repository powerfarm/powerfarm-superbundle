from __future__ import annotations

from typing import Any

from powerfarm.kernel import Kernel


def unsupported_objects(kernel: Kernel, branch: str = "main") -> list[dict[str, Any]]:
    """Surface institutional objects whose last act no longer has an auditable support path."""
    state = kernel.state(branch)
    result: list[dict[str, Any]] = []
    for subject, obj in state.get("objects", {}).items():
        event_id = obj.get("last_event")
        if not event_id:
            continue
        try:
            proof = kernel.proof(str(event_id), branch)
        except Exception as exc:
            result.append({"subject": subject, "event_id": event_id, "reason": str(exc)})
            continue
        if not proof.get("nodes"):
            result.append({"subject": subject, "event_id": event_id, "reason": "empty proof"})
    return result
