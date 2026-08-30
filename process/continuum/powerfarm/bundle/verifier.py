from __future__ import annotations

from collections import defaultdict
from typing import Any

from powerfarm.core.canonical import canonical_json, sha256_json
from powerfarm.crypto.event_signatures import key_binding_at, verify_event_signature
from powerfarm.model import Event
from powerfarm.ledger.anchors import branch_merkle_roots

from .format import BUNDLE_FORMAT, bundle_digest

ZERO_HASH = "0" * 64


def _event_model(value: dict[str, Any]) -> Event:
    return Event(
        seq=int(value["seq"]), branch_index=int(value["branch_index"]), id=str(value["id"]),
        branch_id=str(value["branch_id"]), request_id=value.get("request_id"),
        recorded_at=str(value["recorded_at"]), effective_at=str(value["effective_at"]),
        actor=str(value["actor"]), office=str(value["office"]), kind=str(value["kind"]),
        subject=str(value["subject"]), payload=dict(value["payload"]), causes=list(value["causes"]),
        authority_ref=str(value["authority_ref"]), intent_hash=str(value["intent_hash"]),
        prev_hash=str(value["prev_hash"]), hash=str(value["hash"]), seal=str(value.get("seal", "")),
    )


def _intent(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "actor": event["actor"],
        "office": event["office"],
        "kind": event["kind"],
        "subject": event["subject"],
        "payload": event["payload"],
        "causes": event["causes"],
        "effective_at": event["effective_at"],
    }


def _body(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "branch_index": event["branch_index"],
        "id": event["id"],
        "branch_id": event["branch_id"],
        "request_id": event.get("request_id"),
        "recorded_at": event["recorded_at"],
        "effective_at": event["effective_at"],
        "actor": event["actor"],
        "office": event["office"],
        "kind": event["kind"],
        "subject": event["subject"],
        "payload": event["payload"],
        "causes": event["causes"],
        "authority_ref": event["authority_ref"],
        "intent_hash": event["intent_hash"],
        "prev_hash": event["prev_hash"],
    }


def verify_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    """Verify portable structure/hash chains without possession of the local HMAC key."""
    errors: list[str] = []
    if bundle.get("format") != BUNDLE_FORMAT:
        errors.append("unsupported bundle format")
    try:
        if bundle.get("digest") != bundle_digest(bundle):
            errors.append("bundle digest mismatch")
    except Exception as exc:
        errors.append(f"bundle canonicalization failed: {exc}")

    branches_value = bundle.get("branches")
    events_value = bundle.get("events")
    if not isinstance(branches_value, list) or not branches_value:
        errors.append("bundle has no branches")
        branches_value = []
    if not isinstance(events_value, list) or not events_value:
        errors.append("bundle has no events")
        events_value = []

    branches: dict[str, dict[str, Any]] = {}
    for branch in branches_value:
        try:
            bid = str(branch["id"])
            if bid in branches:
                errors.append(f"duplicate branch {bid}")
            branches[bid] = branch
        except Exception:
            errors.append("malformed branch")

    canonical = [b for b in branches.values() if b.get("canonical") == 1]
    if len(canonical) != 1:
        errors.append("bundle must contain exactly one canonical branch")
    if "main" not in branches:
        errors.append("bundle is missing main")

    local: dict[str, list[dict[str, Any]]] = defaultdict(list)
    event_ids: set[str] = set()
    hashes: set[str] = set()
    for event in events_value:
        try:
            event_id = str(event["id"])
            if event_id in event_ids:
                errors.append(f"duplicate event id {event_id}")
            event_ids.add(event_id)
            digest = str(event["hash"])
            if digest in hashes:
                errors.append(f"duplicate event hash {digest}")
            hashes.add(digest)
            if sha256_json(_intent(event)) != event["intent_hash"]:
                errors.append(f"{event_id}: intent hash mismatch")
            if sha256_json(_body(event)) != digest:
                errors.append(f"{event_id}: event hash mismatch")
            local[str(event["branch_id"])].append(event)
        except Exception as exc:
            errors.append(f"malformed event: {exc}")

    visible_cache: dict[str, list[dict[str, Any]]] = {}
    visiting: set[str] = set()

    def visible(branch_id: str) -> list[dict[str, Any]]:
        if branch_id in visible_cache:
            return visible_cache[branch_id]
        if branch_id in visiting:
            errors.append(f"branch cycle at {branch_id}")
            return []
        visiting.add(branch_id)
        branch = branches.get(branch_id)
        if branch is None:
            errors.append(f"event references unknown branch {branch_id}")
            visiting.remove(branch_id)
            return []
        inherited: list[dict[str, Any]] = []
        parent_id = branch.get("parent_id")
        if parent_id is not None:
            parent_history = visible(str(parent_id))
            fork_event_id = branch.get("fork_event_id")
            match = next((i for i, e in enumerate(parent_history) if e["id"] == fork_event_id), None)
            if match is None:
                errors.append(f"{branch_id}: fork event not visible in parent")
            else:
                inherited = parent_history[: match + 1]
        rows = sorted(local.get(branch_id, []), key=lambda e: int(e["branch_index"]))
        expected_prev = inherited[-1]["hash"] if inherited else ZERO_HASH
        for expected_index, event in enumerate(rows, 1):
            if int(event["branch_index"]) != expected_index:
                errors.append(f"{branch_id}: non-contiguous branch_index at {event['id']}")
            if event["prev_hash"] != expected_prev:
                errors.append(f"{branch_id}: broken hash chain at {event['id']}")
            expected_prev = event["hash"]
        result = inherited + rows
        visible_cache[branch_id] = result
        visiting.remove(branch_id)
        return result

    for branch_id in branches:
        visible(branch_id)

    expected_roots = branch_merkle_roots(events_value) if events_value else {}
    if bundle.get("merkle_roots") != expected_roots:
        errors.append("branch Merkle roots mismatch")

    signatures = bundle.get("signatures", [])
    if not isinstance(signatures, list):
        errors.append("bundle signatures must be an array")
        signatures = []
    by_event = {str(event.get("id")): event for event in events_value if isinstance(event, dict)}
    for signature in signatures:
        if not isinstance(signature, dict):
            errors.append("malformed event signature")
            continue
        event_value = by_event.get(str(signature.get("event_id", "")))
        if event_value is None:
            errors.append("event signature references absent event")
            continue
        try:
            event = _event_model(event_value)
            for error in verify_event_signature(signature, event, institution_id=str(bundle.get("institution_id", ""))):
                errors.append(f"{event.id}: {error}")
            visible_models = [_event_model(item) for item in visible_cache.get(event.branch_id, [])]
            binding = key_binding_at(
                visible_models, key_id=str(signature.get("key_id", "")), principal=event.actor, office=event.office,
                at_recorded=event.recorded_at,
            )
            if binding is None:
                errors.append(f"{event.id}: signature key lacks historical institutional binding")
            elif canonical_json(binding.get("jwk")) != canonical_json(signature.get("jwk")):
                errors.append(f"{event.id}: signature JWK differs from historical binding")
        except Exception as exc:
            errors.append(f"event signature verification failed: {exc}")

    checkpoint = bundle.get("checkpoint")
    if not isinstance(checkpoint, dict):
        errors.append("bundle checkpoint missing")
    else:
        if checkpoint.get("institution_id") != bundle.get("institution_id"):
            errors.append("checkpoint institution mismatch")
        anchors = checkpoint.get("branches")
        if not isinstance(anchors, list):
            errors.append("checkpoint branch anchors missing")
        else:
            for anchor in anchors:
                bid = str(anchor.get("id", ""))
                history = visible_cache.get(bid, [])
                target = next((e for e in history if e["id"] == anchor.get("head_event_id")), None)
                if target is None or target.get("hash") != anchor.get("head_hash"):
                    errors.append(f"{bid}: checkpoint anchor not present in bundle history")

    return {
        "ok": not errors,
        "errors": errors,
        "institution_id": bundle.get("institution_id"),
        "branches": len(branches),
        "events": len(events_value),
        "digest": bundle.get("digest"),
        "seal_verification": "not-available-without-local-hmac-key",
    }
