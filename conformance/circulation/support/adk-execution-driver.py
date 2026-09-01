#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sys
import tempfile
import types
from pathlib import Path
from typing import Any

# The conformance driver exercises the real continuum-adk adapter code. When
# Google ADK is not installed, only its BasePlugin/BaseTool type shells are
# supplied, exactly as the adapter's deterministic unit suite does.
if not (importlib.util.find_spec("google") and importlib.util.find_spec("google.adk")):
    google = types.ModuleType("google")
    adk = types.ModuleType("google.adk")
    plugins = types.ModuleType("google.adk.plugins")
    base_plugin = types.ModuleType("google.adk.plugins.base_plugin")
    tools = types.ModuleType("google.adk.tools")
    base_tool = types.ModuleType("google.adk.tools.base_tool")

    class BasePlugin:
        def __init__(self, name: str):
            self.name = name

    class BaseTool:
        def __init__(self, name: str):
            self.name = name

    base_plugin.BasePlugin = BasePlugin
    base_tool.BaseTool = BaseTool
    sys.modules.update({
        "google": google,
        "google.adk": adk,
        "google.adk.plugins": plugins,
        "google.adk.plugins.base_plugin": base_plugin,
        "google.adk.tools": tools,
        "google.adk.tools.base_tool": base_tool,
    })

from powerfarm.kernel import Kernel
from powerfarm.registry import StaticRegistryDirectory
from continuum_adk import (
    ContinuumPlugin,
    DottedToolPolicy,
    ExecutionSliceFromContext,
    StaticActor,
    StaticOffice,
    ToolMapping,
    execution_refs_from_slice,
)


class Tool:
    name = "search"


class Session:
    id = "adk-engine-local-session"


class Context:
    invocation_id = "adk-engine-local-invocation"
    function_call_id = "adk-engine-local-call"
    attempt_count = 1
    agent_name = "researcher"
    session = Session()

    def __init__(self, execution_slice: dict[str, Any]):
        self.powerfarm_execution_slice = execution_slice


def event_public(event) -> dict[str, Any]:
    return event.public()


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
            request_id=f"equivalence-grant-{index}",
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
    with tempfile.TemporaryDirectory(prefix="pf-adk-equivalence-") as root:
        kernel = Kernel(Path(root) / "institution.db", registry=directory)
        try:
            bootstrap(kernel)
            plugin = ContinuumPlugin(
                kernel=kernel,
                expect_institution=kernel.anchor(),
                office=StaticOffice("operations"),
                actor=StaticActor("agent-1"),
                execution_slice=ExecutionSliceFromContext(),
                policy=DottedToolPolicy(
                    overrides={"search": ToolMapping(kind="tool.invoke.search", subject="tool:search")},
                    strict=True,
                ),
                revision_ref=str(request["revision_ref"]),
                strict=True,
            )
            tool = Tool()
            context = Context(execution_slice)
            raw_input = request["raw_input"]
            raw_output = request["raw_output"]
            effects = 0

            refusal = await plugin.before_tool_callback(
                tool=tool,
                tool_args={"query": raw_input},
                tool_context=context,
            )
            if refusal is not None:
                return {"ok": False, "stage": "before", "refusal": refusal}
            effects += 1
            await plugin.after_tool_callback(
                tool=tool,
                tool_args={"query": raw_input},
                tool_context=context,
                result={"answer": raw_output},
            )

            replay = await plugin.before_tool_callback(
                tool=tool,
                tool_args={"query": raw_input},
                tool_context=context,
            )
            if replay is None:
                effects += 1

            events = [event_public(event) for event in kernel.events("main")]
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
