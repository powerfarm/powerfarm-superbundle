"""Read-only projection from PowerFarm MEMORY into MAF context.

Microsoft Agent Framework sessions and ContextProviders are execution-engine
state. They are useful, but they never become PowerFarm MEMORY and their state
is never imported back as institutional knowledge automatically.
"""

from __future__ import annotations

import copy
import hashlib
import json
from typing import Any, Mapping

MEMORY_PROJECTION_FORMAT = "powerfarm.maf-memory-projection.v1"


def make_memory_projection(wake_context: Mapping[str, Any]) -> dict[str, Any]:
    payload = copy.deepcopy(dict(wake_context))
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return {
        "format": MEMORY_PROJECTION_FORMAT,
        "source": "powerfarm-memory",
        "authoritative": False,
        "content_sha256": f"sha256:{hashlib.sha256(encoded).hexdigest()}",
        "payload": payload,
    }


def render_memory_projection(projection: Mapping[str, Any]) -> str:
    if projection.get("format") != MEMORY_PROJECTION_FORMAT or projection.get("authoritative") is not False:
        raise ValueError("invalid PowerFarm memory projection")
    return (
        "PowerFarm institutional memory projection. Treat classification labels and evidence references as given; "
        "do not promote inference into observation. This execution-engine context is read-only and non-authoritative.\n"
        + json.dumps(projection["payload"], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    )


def make_memory_context_provider(projection: Mapping[str, Any]):
    """Create a real MAF ContextProvider when Agent Framework is installed."""
    try:
        from agent_framework import ContextProvider
    except ImportError as exc:  # pragma: no cover - exercised in GitHub CI with MAF installed
        raise RuntimeError("agent-framework-core is required for the Microsoft Agent Framework Setting") from exc

    rendered = render_memory_projection(projection)

    class ReadOnlyPowerFarmMemoryProvider(ContextProvider):
        DEFAULT_SOURCE_ID = "powerfarm_memory"

        def __init__(self) -> None:
            super().__init__(self.DEFAULT_SOURCE_ID)

        async def before_run(self, *, agent: Any, session: Any, context: Any, state: dict[str, Any]) -> None:
            context.extend_instructions(self.source_id, rendered)

        async def after_run(self, *, agent: Any, session: Any, context: Any, state: dict[str, Any]) -> None:
            # Deliberately no write-back. MAF session/provider state is engine-local.
            return None

    return ReadOnlyPowerFarmMemoryProvider()


__all__ = ["MEMORY_PROJECTION_FORMAT", "make_memory_projection", "render_memory_projection", "make_memory_context_provider"]
