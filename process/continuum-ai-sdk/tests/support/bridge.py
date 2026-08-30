#!/usr/bin/env python3
"""Local JSON transport for continuum-ai-sdk golden integration tests.

This is a Setting transport, not PowerFarm ontology. It exists so the Node
adapter can exercise the real Continuum kernel without making the engine own
institutional state.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from powerfarm.kernel import InstitutionalError, Kernel
from powerfarm.registry import StaticRegistryDirectory
from powerfarm.runtime.receipt import RuntimeReceipt, receipt_to_act
from powerfarm.core.time import utcnow
from powerfarm.validation import ValidationError


def emit(value: Any) -> None:
    sys.stdout.write(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False))


def registry_from(value: dict[str, Any]) -> StaticRegistryDirectory:
    directory = StaticRegistryDirectory(
        offices=set(str(x) for x in value.get("offices", [])),
        occupancies={str(k): str(v) for k, v in value.get("occupancies", {}).items()},
        occupancy_refs={str(k): str(v) for k, v in value.get("occupancy_refs", {}).items()},
        identity_refs={str(k): str(v) for k, v in value.get("identity_refs", {}).items()},
    )
    directory.occupancy_history = {
        str(office): [
            {
                "office": str(office),
                "principal": str(row["principal"]),
                "occupancy_ref": str(row.get("occupancy_ref") or f"pf.occupancy.{row['principal']}"),
                "identity_ref": str(row.get("identity_ref") or f"pf.identity.{row['principal']}"),
                "effective_at": str(row["effective_at"]),
            }
            for row in rows
        ]
        for office, rows in value.get("occupancy_history", {}).items()
    }
    return directory


def refs(value: dict[str, Any]) -> dict[str, str]:
    required = {
        "run_ref": "runRef",
        "run_subject": "runSubject",
        "intent_request_id": "intentRequestId",
        "run_request_id": "runRequestId",
        "resume_request_id": "resumeRequestId",
        "outcome_request_id": "outcomeRequestId",
    }
    out: dict[str, str] = {}
    for target, source in required.items():
        raw = value.get(source)
        if not raw:
            raise ValueError(f"refs.{source} is required")
        out[target] = str(raw)
    return out


def event_public(event) -> dict[str, Any]:
    return event.public()


def find_by_request(kernel: Kernel, branch: str, request_id: str):
    return next((event for event in reversed(kernel.events(branch)) if event.request_id == request_id), None)


def bootstrap(kernel: Kernel, request: dict[str, Any]) -> dict[str, Any]:
    root_actor = str(request["root_actor"])
    root_office = str(request.get("root_office", "director"))
    if not kernel.initialized():
        kernel.init(root_actor, root_office=root_office)

    admitted = []
    for index, grant in enumerate(request.get("grants", [])):
        grantee = str(grant["office"])
        action = str(grant["action"])
        subject = str(grant.get("subject", "*"))
        event = kernel.append(
            branch=str(request.get("branch", "main")),
            actor=root_actor,
            office=root_office,
            kind="authority.grant",
            subject=f"authority:{grantee}:{index}",
            payload={
                "grantee_office": grantee,
                "action": action,
                "subject": subject,
            },
            request_id=f"golden-grant-{grantee}-{index}-{action}-{subject}",
        )
        admitted.append(event_public(event))
    return {"ok": True, "initialized": True, "grants": admitted}


def latest_run_event(kernel: Kernel, branch: str, subject: str, kinds: set[str], *, actor: str | None = None, office: str | None = None):
    for event in reversed(kernel.events(branch)):
        if event.subject != subject or event.kind not in kinds:
            continue
        if actor is not None and event.actor != actor:
            continue
        if office is not None and event.office != office:
            continue
        return event
    return None


def takeover_run(kernel: Kernel, request: dict[str, Any]) -> dict[str, Any]:
    r = refs(request["refs"])
    branch = str(request.get("branch", "main"))
    if find_by_request(kernel, branch, r["outcome_request_id"]) is not None:
        return {"ok": False, "decision": "DENY", "code": "POWERFARM_ALREADY_COMPLETED", "run_ref": r["run_ref"]}
    start = find_by_request(kernel, branch, r["run_request_id"])
    if start is None:
        raise InstitutionalError("cannot takeover a run that was not started")
    prior = latest_run_event(kernel, branch, r["run_subject"], {"run.takeover"}) or start
    actor = str(request["actor"]); office = str(request["office"])
    event = kernel.append(
        branch=branch, actor=actor, office=office, kind="run.takeover", subject=r["run_subject"],
        payload={
            "previous_actor": prior.actor,
            "successor_actor": actor,
            "previous_occupancy_ref": request.get("previous_occupancy_ref"),
            "successor_occupancy_ref": request["successor_occupancy_ref"],
            "card_ref": request.get("card_ref"),
            "reconciliation_ref": request.get("reconciliation_ref"),
        },
        causes=[prior.id], request_id=str(request["request_id"]),
    )
    return {"ok": True, "decision": "ALLOW", "run_ref": r["run_ref"], "event": event_public(event)}


def admit_tool(kernel: Kernel, request: dict[str, Any]) -> dict[str, Any]:
    r = refs(request["refs"])
    branch = str(request.get("branch", "main"))
    completed = find_by_request(kernel, branch, r["outcome_request_id"])
    if completed is not None:
        return {
            "ok": False,
            "decision": "DENY",
            "code": "POWERFARM_ALREADY_COMPLETED",
            "reason": "institutional run already completed",
            "run_ref": r["run_ref"],
        }
    actor = str(request["actor"])
    office = str(request["office"])
    tool_name = str(request["tool_name"])
    runtime = str(request["runtime"])
    revision_ref = str(request["revision_ref"])
    direction_ref = request.get("direction_ref")
    ecs = request.get("effective_capability_set_sha256")

    existing_run = find_by_request(kernel, branch, r["run_request_id"])
    if existing_run is not None:
        if kernel.registry is not None and not kernel.registry.occupancy_matches(office, actor, at=utcnow()):
            return {"ok": False, "decision": "DENY", "code": "POWERFARM_STALE_OCCUPANCY", "reason": "actor is not current Registry occupant", "run_ref": r["run_ref"]}
        current_beat = request.get("beat_ref")
        if str(existing_run.payload.get("beat_ref") or "") == str(current_beat or ""):
            return {"ok": False, "decision": "DENY", "code": "POWERFARM_ALREADY_IN_FLIGHT", "reason": "same Heartime beat is already admitted", "run_ref": r["run_ref"]}
        if actor == existing_run.actor and office == existing_run.office:
            anchor = latest_run_event(kernel, branch, r["run_subject"], {"run.resume"}, actor=actor, office=office) or existing_run
        else:
            anchor = latest_run_event(kernel, branch, r["run_subject"], {"run.takeover"}, actor=actor, office=office)
            if anchor is None:
                return {"ok": False, "decision": "DENY", "code": "POWERFARM_TAKEOVER_REQUIRED", "reason": "successor occupancy must be admitted by Process", "run_ref": r["run_ref"]}
        resume = kernel.append(
            branch=branch, actor=actor, office=office, kind="run.resume", subject=r["run_subject"],
            payload={
                "card_ref": request.get("card_ref"), "beat_ref": request.get("beat_ref"),
                "attempt_ref": request.get("attempt_ref"), "reconciliation_ref": request.get("reconciliation_ref"),
                "execution_slice_sha256": request.get("execution_slice_sha256"),
            },
            causes=[anchor.id], request_id=r["resume_request_id"],
        )
        return {
            "ok": True, "decision": "ALLOW", "resumed": True, "run_ref": r["run_ref"],
            "run_subject": r["run_subject"], "run_event_id": existing_run.id, "continuation_event_id": resume.id,
            "authority_ref": resume.authority_ref, "started_at": existing_run.recorded_at,
            "actor": actor, "office": office,
            "runtime": runtime, "revision_ref": revision_ref,
            "card_ref": request.get("card_ref"), "beat_ref": request.get("beat_ref"), "attempt_ref": request.get("attempt_ref"),
            "execution_slice_sha256": request.get("execution_slice_sha256"), "direction_ref": direction_ref,
            "effective_capability_set_sha256": ecs,
        }

    provenance = {
        "call_ref": str(request["refs"].get("digest", "")),
        "engine": runtime,
    }
    if direction_ref:
        provenance["direction_ref"] = str(direction_ref)
    if ecs:
        provenance["effective_capability_set_sha256"] = str(ecs)
    card_ref = request.get("card_ref")
    beat_ref = request.get("beat_ref")
    attempt_ref = request.get("attempt_ref")
    execution_slice_sha256 = request.get("execution_slice_sha256")
    if card_ref:
        provenance["card_ref"] = str(card_ref)
    if beat_ref:
        provenance["beat_ref"] = str(beat_ref)
    if attempt_ref:
        provenance["attempt_ref"] = str(attempt_ref)
    if execution_slice_sha256:
        provenance["execution_slice_sha256"] = str(execution_slice_sha256)

    events = kernel.append_batch(
        [
            {
                "alias": "intent",
                "actor": actor,
                "office": office,
                "kind": str(request["kind"]),
                "subject": str(request["subject"]),
                "payload": {
                    "tool": tool_name,
                    "arguments": request["input_evidence"],
                    "runtime": runtime,
                    "revision_ref": revision_ref,
                    "provenance": provenance,
                },
                "request_id": r["intent_request_id"],
            },
            {
                "alias": "run",
                "actor": actor,
                "office": office,
                "kind": "run.start",
                "subject": r["run_subject"],
                "payload": {
                    "runtime": runtime,
                    "revision_ref": revision_ref,
                    "tool": tool_name,
                    "owner_office": office,
                    "call_ref": str(request["refs"].get("digest", "")),
                    "direction_ref": direction_ref,
                    "effective_capability_set_sha256": ecs,
                    "card_ref": card_ref,
                    "beat_ref": beat_ref,
                    "attempt_ref": attempt_ref,
                    "execution_slice_sha256": execution_slice_sha256,
                },
                "causes": ["@intent"],
                "request_id": r["run_request_id"],
            },
        ],
        branch=branch,
    )
    intent, run = events
    return {
        "ok": True,
        "decision": "ALLOW",
        "run_ref": r["run_ref"],
        "run_subject": r["run_subject"],
        "intent_event_id": intent.id,
        "run_event_id": run.id,
        "authority_ref": intent.authority_ref,
        "started_at": run.recorded_at,
        "actor": actor, "office": office,
        "runtime": runtime, "revision_ref": revision_ref,
        "card_ref": card_ref, "beat_ref": beat_ref, "attempt_ref": attempt_ref,
        "execution_slice_sha256": execution_slice_sha256, "direction_ref": direction_ref,
        "effective_capability_set_sha256": ecs,
    }


def close_tool(kernel: Kernel, request: dict[str, Any], *, failed: bool) -> dict[str, Any]:
    branch = str(request.get("branch", "main"))
    r = refs(request["refs"])
    existing = find_by_request(kernel, branch, r["outcome_request_id"])
    if existing is not None:
        return {"ok": True, "idempotent": True, "event": event_public(existing)}

    intent = find_by_request(kernel, branch, r["intent_request_id"])
    run = find_by_request(kernel, branch, r["run_request_id"])
    if intent is None or run is None:
        raise InstitutionalError("cannot close a tool call that was not institutionally admitted")

    status = "failed" if failed else "completed"
    admission = request.get("admission") or {}
    close_actor = str(admission.get("actor") or run.actor)
    close_office = str(admission.get("office") or run.office)
    cause_id = str(admission.get("continuation_event_id") or run.id)
    receipt = RuntimeReceipt(
        runtime=str(admission.get("runtime") or run.payload.get("runtime", "vercel-ai-sdk")),
        run_ref=r["run_ref"],
        status=status,
        capability_ref=f"tool:{run.payload.get('tool', 'unknown')}",
        revision_ref=str(admission.get("revision_ref") or run.payload.get("revision_ref", "unspecified")),
        authority_ref=intent.authority_ref,
        started_at=run.recorded_at,
        finished_at=utcnow(),
        output=None if failed else request.get("output_evidence"),
        error=request.get("error_evidence") if failed else None,
        usage={},
        provenance={
            "engine": str(run.payload.get("runtime", "vercel-ai-sdk")),
            "card_ref": admission.get("card_ref") or run.payload.get("card_ref"),
            "beat_ref": admission.get("beat_ref") or run.payload.get("beat_ref"),
            "attempt_ref": admission.get("attempt_ref") or run.payload.get("attempt_ref"),
            "execution_slice_sha256": admission.get("execution_slice_sha256") or run.payload.get("execution_slice_sha256"),
            "direction_ref": admission.get("direction_ref") or run.payload.get("direction_ref"),
            "effective_capability_set_sha256": admission.get("effective_capability_set_sha256") or run.payload.get("effective_capability_set_sha256"),
        },
    )
    act = receipt_to_act(receipt, subject=r["run_subject"])
    event = kernel.append(
        branch=branch,
        actor=close_actor,
        office=close_office,
        kind=str(act["kind"]),
        subject=str(act["subject"]),
        payload=act["payload"],
        causes=[cause_id],
        request_id=r["outcome_request_id"],
    )
    return {"ok": True, "idempotent": False, "event": event_public(event)}


def main() -> int:
    request = json.load(sys.stdin)
    action = str(request.get("action", ""))
    directory = registry_from(request.get("registry", {}))
    kernel = Kernel(Path(request["db_path"]), registry=directory)
    try:
        if action == "bootstrap":
            response = bootstrap(kernel, request)
        elif action == "takeover_run":
            response = takeover_run(kernel, request)
        elif action == "admit_tool":
            try:
                response = admit_tool(kernel, request)
            except (InstitutionalError, ValidationError, ValueError):
                response = {
                    "ok": False,
                    "decision": "DENY",
                    "code": "POWERFARM_REFUSED",
                    "reason": "institutional authority denied",
                }
        elif action == "finish_tool":
            response = close_tool(kernel, request, failed=False)
        elif action == "fail_tool":
            response = close_tool(kernel, request, failed=True)
        elif action == "events":
            response = {"ok": True, "events": [event_public(e) for e in kernel.events(str(request.get("branch", "main")))]}
        elif action == "audit":
            response = {"ok": True, "audit": kernel.audit()}
        elif action == "state":
            response = {"ok": True, "state": kernel.state(str(request.get("branch", "main")))}
        else:
            raise ValueError(f"unknown action: {action}")
        emit(response)
        return 0
    except Exception as exc:
        emit({"ok": False, "error": type(exc).__name__, "message": str(exc)})
        return 1
    finally:
        kernel.close()


if __name__ == "__main__":
    raise SystemExit(main())
