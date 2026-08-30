from __future__ import annotations

import json
from typing import Any

from powerfarm.core.time import utcnow
from powerfarm.kernel import Kernel
from powerfarm.ledger.anchors import branch_merkle_roots

from .format import BUNDLE_FORMAT, bundle_digest

MAX_BUNDLE_EVENTS = 250_000


def _event_from_row(row) -> dict[str, Any]:
    return {
        "seq": int(row["seq"]),
        "branch_index": int(row["branch_index"]),
        "id": str(row["id"]),
        "branch_id": str(row["branch_id"]),
        "request_id": str(row["request_id"]) if row["request_id"] is not None else None,
        "recorded_at": str(row["recorded_at"]),
        "effective_at": str(row["effective_at"]),
        "actor": str(row["actor"]),
        "office": str(row["office"]),
        "kind": str(row["kind"]),
        "subject": str(row["subject"]),
        "payload": json.loads(row["payload"]),
        "causes": json.loads(row["causes"]),
        "authority_ref": str(row["authority_ref"]),
        "intent_hash": str(row["intent_hash"]),
        "prev_hash": str(row["prev_hash"]),
        "hash": str(row["hash"]),
        "seal": str(row["seal"]),
    }


def export_bundle(kernel: Kernel) -> dict[str, Any]:
    """Export local branch rows and local events without requiring the seal key to travel."""
    with kernel._read_snapshot():  # one consistent WAL snapshot
        audit = kernel.audit()
        if not audit["ok"]:
            raise ValueError("refusing to export a bundle from a failing audit")
        rows = kernel.db.execute("SELECT * FROM events ORDER BY seq").fetchall()
        if len(rows) > MAX_BUNDLE_EVENTS:
            raise ValueError("institution is too large for a single portable bundle")
        metadata = {
            str(row["key"]): str(row["value"])
            for row in kernel.db.execute("SELECT key,value FROM metadata ORDER BY key").fetchall()
        }
        branches = [
            {
                "id": str(row["id"]),
                "parent_id": str(row["parent_id"]) if row["parent_id"] is not None else None,
                "fork_event_id": str(row["fork_event_id"]) if row["fork_event_id"] is not None else None,
                "created_at": str(row["created_at"]),
                "label": str(row["label"]) if row["label"] is not None else None,
                "canonical": int(row["canonical"]),
                "seal": str(row["seal"]),
            }
            for row in kernel.db.execute("SELECT * FROM branches ORDER BY id").fetchall()
        ]
        exported_events = [_event_from_row(row) for row in rows]
        bundle: dict[str, Any] = {
            "format": BUNDLE_FORMAT,
            "institution_id": metadata.get("institution_id"),
            "created_at": utcnow(),
            "metadata": metadata,
            "branches": branches,
            "events": exported_events,
            "merkle_roots": branch_merkle_roots(exported_events),
            "signatures": kernel.signature_rows(),
            "checkpoint": kernel.checkpoint(),
        }
        bundle["digest"] = bundle_digest(bundle)
        return bundle
