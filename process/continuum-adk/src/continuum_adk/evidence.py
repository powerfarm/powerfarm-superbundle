"""Privacy-preserving evidence for tool calls and outcomes.

The adapter never writes raw tool arguments or results to Continuum by default.
It records deterministic digests plus low-cardinality metadata. Callers may opt
into narrowly allowlisted disclosure for fields that are institutionally safe.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Mapping, Protocol, runtime_checkable


def _safe(value: Any) -> Any:
    """Convert arbitrary Python values to deterministic JSON-safe data.

    Floats are tagged strings, never JSON numbers, because Continuum
    deliberately rejects floats in institutional payloads.
    """
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        if -(2**53 - 1) <= value <= (2**53 - 1):
            return value
        return {"$int": str(value)}
    if isinstance(value, float):
        if math.isnan(value):
            return {"$float": "nan"}
        if math.isinf(value):
            return {"$float": "inf" if value > 0 else "-inf"}
        return {"$float": repr(value)}
    if isinstance(value, Decimal):
        return {"$decimal": format(value, "f")}
    if isinstance(value, bytes):
        return {
            "$bytes_sha256": hashlib.sha256(value).hexdigest(),
            "$bytes_length": len(value),
        }
    if isinstance(value, Mapping):
        keys = [str(k) for k in value.keys()]
        if len(keys) == len(set(keys)) and all(isinstance(k, str) for k in value.keys()):
            return {str(k): _safe(v) for k, v in sorted(value.items(), key=lambda kv: str(kv[0]))}
        # Preserve key identity when string coercion would collide (e.g. 1 and "1").
        pairs = [[_safe(k), _safe(v)] for k, v in value.items()]
        pairs.sort(key=lambda pair: json.dumps(pair[0], sort_keys=True, separators=(",", ":"), ensure_ascii=False))
        return {"$map": pairs}
    if isinstance(value, (list, tuple)):
        return [_safe(v) for v in value]
    if isinstance(value, (set, frozenset)):
        normalized = [_safe(v) for v in value]
        return sorted(normalized, key=lambda x: json.dumps(x, sort_keys=True, separators=(",", ":"), ensure_ascii=False))

    # Do not persist repr(value): reprs frequently contain tokens, paths, PII,
    # object addresses or full record contents. Preserve only the type and a
    # digest of the representation for correlation.
    rep = repr(value).encode("utf-8", "replace")
    return {
        "$type": f"{type(value).__module__}.{type(value).__qualname__}",
        "$repr_sha256": hashlib.sha256(rep).hexdigest(),
    }


def stable_bytes(value: Any) -> bytes:
    return json.dumps(
        _safe(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def digest_summary(value: Any) -> dict[str, Any]:
    raw = stable_bytes(value)
    if isinstance(value, Mapping):
        shape = "object"
        count = len(value)
    elif isinstance(value, (list, tuple, set, frozenset)):
        shape = "array"
        count = len(value)
    else:
        shape = type(value).__name__
        count = 1
    return {
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
        "shape": shape,
        "items": count,
    }


def opaque_ref(value: Any, *, prefix: str) -> str | None:
    if value is None:
        return None
    digest = hashlib.sha256(str(value).encode("utf-8", "replace")).hexdigest()
    return f"{prefix}:{digest[:24]}"


@runtime_checkable
class EvidencePolicy(Protocol):
    def arguments(self, tool_name: str, value: Mapping[str, Any]) -> dict[str, Any]: ...
    def result(self, tool_name: str, value: Any) -> dict[str, Any]: ...
    def error(self, tool_name: str, error: Exception) -> dict[str, Any]: ...
    def provenance(self, context: Any) -> dict[str, Any]: ...


@dataclass(frozen=True)
class DigestOnlyEvidence:
    """Default policy: values become digests, never ledger plaintext."""

    def arguments(self, tool_name: str, value: Mapping[str, Any]) -> dict[str, Any]:
        return digest_summary(value)

    def result(self, tool_name: str, value: Any) -> dict[str, Any]:
        return digest_summary(value)

    def error(self, tool_name: str, error: Exception) -> dict[str, Any]:
        return {
            "type": f"{type(error).__module__}.{type(error).__qualname__}",
            "message_sha256": hashlib.sha256(str(error).encode("utf-8", "replace")).hexdigest(),
        }

    def provenance(self, context: Any) -> dict[str, Any]:
        return {
            "invocation_ref": opaque_ref(getattr(context, "invocation_id", None), prefix="inv"),
            "session_ref": opaque_ref(getattr(getattr(context, "session", None), "id", None), prefix="ses"),
            "agent": getattr(context, "agent_name", None),
            "attempt": int(getattr(context, "attempt_count", 1) or 1),
        }


@dataclass(frozen=True)
class AllowlistedEvidence(DigestOnlyEvidence):
    """Reveal only explicitly named fields while retaining a full digest.

    Values are converted with the same float-safe canonicalizer used for the
    digest. Fields not allowlisted never reach the ledger in plaintext.
    """

    argument_fields: Mapping[str, frozenset[str]]
    result_fields: Mapping[str, frozenset[str]]

    def arguments(self, tool_name: str, value: Mapping[str, Any]) -> dict[str, Any]:
        summary = digest_summary(value)
        allow = self.argument_fields.get(tool_name, frozenset())
        summary["disclosed"] = {k: _safe(value[k]) for k in sorted(allow) if k in value}
        return summary

    def result(self, tool_name: str, value: Any) -> dict[str, Any]:
        summary = digest_summary(value)
        if isinstance(value, Mapping):
            allow = self.result_fields.get(tool_name, frozenset())
            summary["disclosed"] = {k: _safe(value[k]) for k in sorted(allow) if k in value}
        return summary


__all__ = [
    "EvidencePolicy",
    "DigestOnlyEvidence",
    "AllowlistedEvidence",
    "digest_summary",
    "stable_bytes",
    "opaque_ref",
]
