from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Iterable

MAX_PAYLOAD_BYTES = 256 * 1024
MAX_JSON_DEPTH = 32
MAX_JSON_NODES = 8192
MAX_CONTAINER_ITEMS = 2048
MAX_STRING_LENGTH = 64 * 1024
MAX_CAUSES = 128
SAFE_INTEGER_MAX = (1 << 53) - 1

_BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_KIND_RE = re.compile(r"^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$")
_EVENT_RE = re.compile(r"^evt_[0-9a-f]{32}$")
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")


class ValidationError(ValueError):
    pass


def _nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def _no_control_or_space(value: str, label: str) -> None:
    for ch in value:
        if ch.isspace() or unicodedata.category(ch).startswith("C"):
            raise ValidationError(f"{label} contains whitespace/control characters")


def validate_branch(value: str) -> str:
    value = _nfc(str(value))
    if not _BRANCH_RE.fullmatch(value):
        raise ValidationError("branch must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}")
    return value


def validate_ref(value: str, label: str, *, max_len: int = 512) -> str:
    value = _nfc(str(value))
    if not value or len(value) > max_len:
        raise ValidationError(f"{label} must contain 1..{max_len} characters")
    _no_control_or_space(value, label)
    return value


def validate_kind(value: str) -> str:
    value = _nfc(str(value))
    if len(value) > 128 or not _KIND_RE.fullmatch(value):
        raise ValidationError("kind must be a lowercase dotted identifier")
    return value


def validate_event_id(value: str) -> str:
    value = str(value)
    if not _EVENT_RE.fullmatch(value):
        raise ValidationError("invalid event id")
    return value


def validate_hash(value: str, label: str = "hash") -> str:
    value = str(value)
    if not _HEX64_RE.fullmatch(value):
        raise ValidationError(f"invalid {label}")
    return value


def validate_label(value: str | None) -> str | None:
    if value is None:
        return None
    value = _nfc(str(value))
    if len(value) > 256:
        raise ValidationError("label is too long")
    for ch in value:
        if unicodedata.category(ch) in {"Cc", "Cs"}:
            raise ValidationError("label contains control characters")
    return value


def validate_request_id(value: str | None) -> str | None:
    if value is None:
        return None
    return validate_ref(value, "request_id", max_len=200)


def normalize_timestamp(value: str, label: str = "timestamp") -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{label} must be an RFC3339 timestamp")
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValidationError(f"{label} must be an RFC3339 timestamp") from exc
    if dt.tzinfo is None:
        raise ValidationError(f"{label} must include a timezone")
    dt = dt.astimezone(timezone.utc)
    return dt.isoformat(timespec="microseconds").replace("+00:00", "Z")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _normalize_json(value: Any, *, depth: int, counter: list[int]) -> Any:
    if depth > MAX_JSON_DEPTH:
        raise ValidationError(f"payload exceeds maximum JSON depth {MAX_JSON_DEPTH}")
    counter[0] += 1
    if counter[0] > MAX_JSON_NODES:
        raise ValidationError(f"payload exceeds maximum JSON node count {MAX_JSON_NODES}")

    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > SAFE_INTEGER_MAX:
            raise ValidationError("payload integer exceeds cross-runtime safe integer range")
        return value
    if isinstance(value, float):
        raise ValidationError("floating point numbers are forbidden in institutional payloads; use a decimal string")
    if isinstance(value, str):
        if len(value) > MAX_STRING_LENGTH:
            raise ValidationError("payload string is too long")
        normalized = _nfc(value)
        if "\x00" in normalized:
            raise ValidationError("payload strings may not contain NUL")
        return normalized
    if isinstance(value, list):
        if len(value) > MAX_CONTAINER_ITEMS:
            raise ValidationError("payload array is too large")
        return [_normalize_json(v, depth=depth + 1, counter=counter) for v in value]
    if isinstance(value, dict):
        if len(value) > MAX_CONTAINER_ITEMS:
            raise ValidationError("payload object has too many keys")
        out: dict[str, Any] = {}
        for raw_key, raw_value in value.items():
            if not isinstance(raw_key, str):
                raise ValidationError("payload object keys must be strings")
            key = _nfc(raw_key)
            if not key or len(key) > 256 or "\x00" in key:
                raise ValidationError("invalid payload object key")
            if key in out:
                raise ValidationError("payload keys collide after Unicode normalization")
            out[key] = _normalize_json(raw_value, depth=depth + 1, counter=counter)
        return out
    raise ValidationError(f"unsupported payload type: {type(value).__name__}")


def normalize_payload(value: dict[str, Any] | None) -> dict[str, Any]:
    if value is None:
        value = {}
    if not isinstance(value, dict):
        raise ValidationError("payload must be a JSON object")
    normalized = _normalize_json(value, depth=0, counter=[0])
    encoded = json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    if len(encoded) > MAX_PAYLOAD_BYTES:
        raise ValidationError(f"payload exceeds {MAX_PAYLOAD_BYTES} bytes")
    return normalized


def normalize_causes(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = validate_event_id(raw)
        if value not in seen:
            seen.add(value)
            result.append(value)
        if len(result) > MAX_CAUSES:
            raise ValidationError(f"no more than {MAX_CAUSES} causal references are allowed")
    return result


def validate_scope_pattern(value: str, label: str) -> str:
    value = validate_ref(value, label, max_len=256)
    if any(ch in value for ch in "?[]"):
        raise ValidationError(f"{label} only supports an exact value or one trailing * wildcard")
    if "*" in value and (value.count("*") != 1 or not value.endswith("*")):
        raise ValidationError(f"{label} only supports an exact value or one trailing * wildcard")
    return value


def scope_matches(value: str, pattern: str) -> bool:
    if pattern == "*":
        return True
    if pattern.endswith("*"):
        return value.startswith(pattern[:-1])
    return value == pattern


def scope_contains(parent: str, child: str) -> bool:
    """Whether every value matched by child is also matched by parent.

    Patterns are intentionally restricted to exact values or a trailing wildcard,
    making containment deterministic and reviewable.
    """
    if parent == "*":
        return True
    if parent.endswith("*"):
        prefix = parent[:-1]
        if child.endswith("*"):
            return child[:-1].startswith(prefix)
        return child.startswith(prefix)
    return child == parent
