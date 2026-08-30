from __future__ import annotations

from typing import Any

from powerfarm.core.canonical import sha256_json

BUNDLE_FORMAT = "powerfarm.bundle/v1"


def bundle_body(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "format": value.get("format"),
        "institution_id": value.get("institution_id"),
        "created_at": value.get("created_at"),
        "metadata": value.get("metadata"),
        "branches": value.get("branches"),
        "events": value.get("events"),
        "checkpoint": value.get("checkpoint"),
        "merkle_roots": value.get("merkle_roots"),
        "signatures": value.get("signatures"),
    }


def bundle_digest(value: dict[str, Any]) -> str:
    return sha256_json(bundle_body(value))
