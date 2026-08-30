#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from powerfarm.execution_slice import execution_refs_from_slice
from powerfarm.kernel import Kernel
from powerfarm.registry import StaticRegistryDirectory
from continuum_maf import ContinuumFunctionController, DottedToolPolicy, ToolMapping


@dataclass
class Session:
    session_id: str = "maf-engine-local-session"
    state: dict[str, Any] = field(default_factory=dict)


@dataclass
class Context:
    session: Session = field(default_factory=Session)
    metadata: dict[str, Any] = field(default_factory=lambda: {"agent_name": "researcher"})


def bootstrap(kernel: Kernel) -> None:
    kernel.init("human-1", root_office="director")
    for index, (action, subject) in enumerate([
        ("tool.invoke.search", "tool:search"),
        ("run.start", "run:*"),
    ]):
        kernel.append(
            branch="main",
            actor="human-1",
            office="director",
            kind="authority.grant",
            subject=f"authority:operations:{index}",
            payload={"grantee_office": "operations", "action": action, "subject": subject},
            request_id=f"maf-equivalence-grant-{index}",
        )


def normalized(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for event in events:
        if event["kind"] not in {"tool.invoke.search", "run.start", "run.finish", "run.fail"}:
            continue
        payload = event.get("payload") or {}
        provenance = payload.get("provenance") or {}
        rows.append({
            "kind": event["kind"],
            "subject": event["subject"],
            "actor": event["actor"],
            "office": event["office"],
            "request_id": event.get("request_id"),
            "run_ref": payload.get("run_ref") or (event["subject"][4:] if str(event["subject"]).startswith("run:") else None),
            "card_ref": payload.get("card_ref") or provenance.get("card_ref"),
            "beat_ref": payload.get("beat_ref") or provenance.get("beat_ref"),
            "attempt_ref": payload.get("attempt_ref") or provenance.get("attempt_ref"),
            "direction_ref": payload.get("direction_ref") or provenance.get("direction_ref"),
            "ecs": payload.get("effective_capability_set_sha256") or provenance.get("effective_capability_set_sha256"),
            "execution_slice_sha256": payload.get("execution_slice_sha256") or provenance.get("execution_slice_sha256"),
            "status": payload.get("status"),
            "capability_ref": payload.get("capability_ref"),
        })
    return rows


async def run(request: dict[str, Any]) -> dict[str, Any]:
    execution_slice = request["execution_slice"]
    refs = execution_refs_from_slice(execution_slice)
    directory = StaticRegistryDirectory(
        offices={"director", "operations"},
        occupancies={"director": "human-1", "operations": "agent-1"},
    )
    with tempfile.TemporaryDirectory(prefix="pf-maf-equivalence-") as root:
        kernel = Kernel(Path(root) / "institution.db", registry=directory)
        try:
            bootstrap(kernel)
            controller = ContinuumFunctionController(
                kernel=kernel,
                policy=DottedToolPolicy({"search": ToolMapping(kind="tool.invoke.search", subject="tool:search")}),
                revision_ref=str(request["revision_ref"]),
                strict=True,
            )
            context = Context()
            raw_input = request["raw_input"]
            raw_output = request["raw_output"]
            effects = 0

            refused = await controller.admit(
                tool_name="search",
                tool_args={"query": raw_input},
                execution_slice=execution_slice,
                context=context,
            )
            if refused is not None:
                return {"ok": False, "stage": "before", "refusal": refused}
            effects += 1
            await controller.close(
                tool_name="search",
                execution_slice=execution_slice,
                context=context,
                result={"answer": raw_output},
            )

            replay = await controller.admit(
                tool_name="search",
                tool_args={"query": raw_input},
                execution_slice=execution_slice,
                context=context,
            )
            if replay is None:
                effects += 1

            events = [event.public() for event in kernel.events("main")]
            serialized = json.dumps(events, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            return {
                "ok": True,
                "effects": effects,
                "replay_code": replay.get("code") if isinstance(replay, dict) else None,
                "raw_values_absent": raw_input not in serialized and raw_output not in serialized,
                "refs": {
                    "digest": refs.digest,
                    "runRef": refs.run_ref,
                    "runSubject": refs.run_subject,
                    "intentRequestId": refs.intent_request_id,
                    "runRequestId": refs.run_request_id,
                    "resumeRequestId": refs.resume_request_id,
                    "outcomeRequestId": refs.outcome_request_id,
                },
                "events": normalized(events),
                "audit_ok": bool(kernel.audit().get("ok")),
            }
        finally:
            kernel.close()


def main() -> int:
    request = json.load(sys.stdin)
    result = asyncio.run(run(request))
    sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
