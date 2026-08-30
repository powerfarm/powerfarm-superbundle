"""Privacy-reduced evidence for Microsoft Agent Framework function calls."""

from __future__ import annotations

import hashlib
import json
import math
from decimal import Decimal
from typing import Any, Mapping


def _safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        return value if -(2**53 - 1) <= value <= (2**53 - 1) else {"$int": str(value)}
    if isinstance(value, float):
        if math.isnan(value):
            return {"$float": "nan"}
        if math.isinf(value):
            return {"$float": "inf" if value > 0 else "-inf"}
        return {"$float": repr(value)}
    if isinstance(value, Decimal):
        return {"$decimal": format(value, "f")}
    if isinstance(value, bytes):
        return {"$bytes_sha256": hashlib.sha256(value).hexdigest(), "$bytes_length": len(value)}
    if hasattr(value, "model_dump") and callable(value.model_dump):
        return _safe(value.model_dump(mode="python"))
    if isinstance(value, Mapping):
        return {str(k): _safe(v) for k, v in sorted(value.items(), key=lambda item: str(item[0]))}
    if isinstance(value, (list, tuple)):
        return [_safe(v) for v in value]
    if isinstance(value, (set, frozenset)):
        normalized = [_safe(v) for v in value]
        return sorted(normalized, key=lambda x: json.dumps(x, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
    rep = repr(value).encode("utf-8", "replace")
    return {
        "$type": f"{type(value).__module__}.{type(value).__qualname__}",
        "$repr_sha256": hashlib.sha256(rep).hexdigest(),
    }


def stable_bytes(value: Any) -> bytes:
    return json.dumps(_safe(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest_summary(value: Any) -> dict[str, Any]:
    raw = stable_bytes(value)
    if isinstance(value, Mapping):
        shape, count = "object", len(value)
    elif isinstance(value, (list, tuple, set, frozenset)):
        shape, count = "array", len(value)
    else:
        shape, count = type(value).__name__, 1
    return {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "shape": shape, "items": count}


def opaque_ref(value: Any, *, prefix: str) -> str | None:
    if value is None:
        return None
    digest = hashlib.sha256(str(value).encode("utf-8", "replace")).hexdigest()
    return f"{prefix}:{digest[:24]}"


def context_provenance(context: Any) -> dict[str, Any]:
    session = getattr(context, "session", None)
    session_id = getattr(session, "session_id", None) or getattr(session, "id", None)
    metadata = getattr(context, "metadata", None)
    agent_name = metadata.get("agent_name") if isinstance(metadata, Mapping) else None
    return {
        "session_ref": opaque_ref(session_id, prefix="maf-session"),
        "agent": agent_name,
        "engine_context": "microsoft-agent-framework",
    }


__all__ = ["digest_summary", "stable_bytes", "opaque_ref", "context_provenance"]
