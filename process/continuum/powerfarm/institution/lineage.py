from __future__ import annotations

from typing import Any

from powerfarm.kernel import Kernel


def lineage(kernel: Kernel, subject: str, branch: str = "main") -> dict[str, Any]:
    events = [event for event in kernel.events(branch) if event.subject == subject]
    return {
        "subject": subject,
        "branch": branch,
        "events": [event.public() for event in events],
        "first": events[0].id if events else None,
        "last": events[-1].id if events else None,
        "count": len(events),
    }
