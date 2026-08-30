"""Projection of Microsoft Agent Framework tools into institutional acts."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping, Protocol, runtime_checkable

_KIND_SEGMENT_UNSAFE = re.compile(r"[^a-z0-9_-]+")


class MappingError(ValueError):
    """A MAF tool cannot be projected safely into institutional authority."""


def kindify(value: str) -> str:
    cleaned = _KIND_SEGMENT_UNSAFE.sub("-", str(value).lower()).strip("-")
    return cleaned or "unnamed"


@dataclass(frozen=True)
class ActProjection:
    kind: str
    subject: str


@dataclass(frozen=True)
class ToolMapping:
    kind: str
    subject: str


@runtime_checkable
class MappingPolicy(Protocol):
    def project(self, tool_name: str, tool_args: Mapping[str, Any]) -> ActProjection: ...


class DottedToolPolicy:
    """Strict-by-default mapping for MAF function tools."""

    def __init__(
        self,
        overrides: Mapping[str, ToolMapping] | None = None,
        *,
        prefix: str = "tool.invoke",
        subject_prefix: str = "tool:",
        strict: bool = True,
    ) -> None:
        self.overrides = dict(overrides or {})
        self.prefix = prefix
        self.subject_prefix = subject_prefix
        self.strict = strict

    def project(self, tool_name: str, tool_args: Mapping[str, Any]) -> ActProjection:
        override = self.overrides.get(tool_name)
        if override is not None:
            if not override.kind or not override.subject:
                raise MappingError(f"invalid mapping for {tool_name!r}")
            return ActProjection(kind=str(override.kind), subject=str(override.subject))
        if self.strict:
            raise MappingError(f"tool {tool_name!r} has no explicit institutional mapping")
        safe = kindify(tool_name)
        return ActProjection(kind=f"{self.prefix}.{safe}", subject=f"{self.subject_prefix}{safe}")


__all__ = [
    "ActProjection", "ToolMapping", "MappingPolicy", "DottedToolPolicy",
    "MappingError", "kindify",
]
