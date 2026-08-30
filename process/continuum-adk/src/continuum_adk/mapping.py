"""Projection of ADK tool calls into collision-resistant institutional acts."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Mapping, Protocol, runtime_checkable

from .evidence import stable_bytes

_KIND_SEGMENT_UNSAFE = re.compile(r"[^a-z0-9_-]+")
_PLACEHOLDER = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")
UNSPECIFIED = "unspecified"


class MappingError(ValueError):
    """A tool call cannot be projected safely into institutional authority."""


def kindify(value: str) -> str:
    cleaned = _KIND_SEGMENT_UNSAFE.sub("-", str(value).lower()).strip("-")
    return cleaned or "unnamed"


def subject_token(value: Any, *, max_prefix: int = 48) -> str:
    """Readable but collision-resistant token for a subject discriminator."""
    raw = stable_bytes(value)
    digest = hashlib.sha256(raw).hexdigest()[:16]
    prefix = kindify(str(value))[:max_prefix] or "value"
    return f"{prefix}~{digest}"


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
    """Map tools to unique kinds; optional strict mode requires explicit mapping."""

    def __init__(
        self,
        overrides: Mapping[str, ToolMapping] | None = None,
        *,
        prefix: str = "tool.invoke",
        subject_prefix: str = "tool:",
        max_subject_token: int = 80,
        strict: bool = False,
    ) -> None:
        self.overrides = dict(overrides or {})
        self.prefix = prefix
        self.subject_prefix = subject_prefix
        self.max_subject_token = max_subject_token
        self.strict = strict

    def project(self, tool_name: str, tool_args: Mapping[str, Any]) -> ActProjection:
        override = self.overrides.get(tool_name)
        if override is not None:
            return ActProjection(kind=override.kind, subject=self._fill(override.subject, tool_args))
        if self.strict:
            raise MappingError(f"tool {tool_name!r} has no explicit institutional mapping")
        safe = kindify(tool_name)
        return ActProjection(kind=f"{self.prefix}.{safe}", subject=f"{self.subject_prefix}{safe}")

    def _fill(self, template: str, tool_args: Mapping[str, Any]) -> str:
        def replace(match: re.Match[str]) -> str:
            key = match.group(1)
            if key not in tool_args:
                if self.strict:
                    raise MappingError(f"required subject discriminator {key!r} is missing")
                return UNSPECIFIED
            token = subject_token(tool_args[key], max_prefix=max(8, self.max_subject_token - 17))
            return token[: self.max_subject_token]

        return _PLACEHOLDER.sub(replace, template)


__all__ = [
    "ActProjection",
    "ToolMapping",
    "MappingPolicy",
    "DottedToolPolicy",
    "MappingError",
    "kindify",
    "subject_token",
    "UNSPECIFIED",
]
