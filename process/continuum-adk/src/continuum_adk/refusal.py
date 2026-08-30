"""Rendering governed refusals back to the model without leaking principals."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from .mapping import ActProjection


@runtime_checkable
class RefusalRenderer(Protocol):
    def render(self, *, reason: str, office: str, actor: str, projection: ActProjection, tool_name: str) -> dict[str, Any]: ...


class StructuredRefusal:
    def __init__(self, *, include_actor: bool = False) -> None:
        self.include_actor = include_actor

    def render(self, *, reason: str, office: str, actor: str, projection: ActProjection, tool_name: str) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "status": "refused",
            "refused_by": "continuum",
            "reason": reason,
            "office": office,
            "tool": tool_name,
            "attempted_act": {"kind": projection.kind, "subject": projection.subject},
        }
        if self.include_actor:
            payload["actor"] = actor
        return payload


class TerseRefusal:
    def render(self, *, reason: str, office: str, actor: str, projection: ActProjection, tool_name: str) -> dict[str, Any]:
        return {"status": "refused", "refused_by": "continuum", "reason": "not authorized"}
