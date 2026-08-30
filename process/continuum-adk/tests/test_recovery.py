from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import timedelta

import pytest

from continuum_adk import (
    ContinuumPlugin,
    DottedToolPolicy,
    ExecutionSliceFromContext,
    StaticActor,
    StaticOffice,
    ToolMapping,
    execution_refs_from_slice,
)
from powerfarm.kernel import Kernel
from powerfarm.projection import parse_time
from powerfarm.registry import StaticRegistryDirectory


def canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def seal_slice(value: dict) -> dict:
    out = json.loads(canonical(value))
    out.pop("slice_sha256", None)
    out["slice_sha256"] = "sha256:" + hashlib.sha256(canonical(out).encode()).hexdigest()
    return out


def make_slice(*, actor: str, occupancy_ref: str, beat_ref: str, run_ref: str | None = None) -> dict:
    base = {
        "contract_version": "powerfarm.execution-slice.v3",
        "card": {
            "ref": "pf.card.adk-recovery",
            "generation": 1,
            "revision": 4,
            "content_sha256": "sha256:" + "a" * 64,
        },
        "principal": {"actor": actor, "office": "operations"},
        "institutional": {
            "identity_ref": f"pf.identity.{actor}",
            "office_ref": "pf.office.operations",
            "occupancy_ref": occupancy_ref,
            "direction_ref": "pf.direction.adk-recovery",
            "responsibility_ref": None,
            "authority_ref": "continuum:projected-at-admission",
            "run_ref": run_ref,
            "run_grant_ref": None,
            "ecs_sha256": "b" * 64,
        },
        "circulation": {"beat_ref": beat_ref, "attempt_ref": "pf.attempt.adk-recovery"},
        "capability": {"tool_name": "search", "kind": "tool.invoke.search", "subject": "tool:search"},
        "resources": {
            "energy_remaining": {
                "beats": 2, "model_tokens": 100000, "tool_calls": 20, "network_calls": 20,
                "compute_ms": 600000, "sandbox_ms": 600000, "wall_ms": 900000, "human_attention_ms": 600000,
            },
            "cost": {"currency": "USD", "remaining_micros": 10000000},
        },
    }
    first = seal_slice(base)
    refs = execution_refs_from_slice(first)
    base["institutional"]["run_ref"] = refs.run_ref
    return seal_slice(base)


class Tool:
    name = "search"


@dataclass
class Context:
    powerfarm_execution_slice: dict
    invocation_id: str = "engine-local"
    function_call_id: str = "engine-local-call"
    attempt_count: int = 1
    agent_name: str = "worker"


def plugin(kernel: Kernel, actor: str) -> ContinuumPlugin:
    return ContinuumPlugin(
        kernel=kernel,
        office=StaticOffice("operations"),
        actor=StaticActor(actor),
        execution_slice=ExecutionSliceFromContext(),
        policy=DottedToolPolicy(
            overrides={"search": ToolMapping(kind="tool.invoke.search", subject="tool:search")},
            strict=True,
        ),
        revision_ref="google-adk==2.8.0",
        strict=True,
    )


@pytest.mark.asyncio
async def test_adk_reissue_resumes_same_run_after_registry_takeover(tmp_path):
    registry = StaticRegistryDirectory(
        offices={"director", "operations"},
        occupancies={"director": "human-1", "operations": "agent-old"},
        occupancy_refs={"operations": "pf.occupancy.agent-old"},
        identity_refs={"agent-old": "pf.identity.agent-old", "agent-new": "pf.identity.agent-new"},
    )
    kernel = Kernel(tmp_path / "institution.db", registry=registry)
    kernel.init("human-1")
    for index, (action, subject) in enumerate([
        ("tool.invoke.search", "tool:search"),
        ("run.start", "run:*"),
    ]):
        kernel.append(
            branch="main", actor="human-1", office="director", kind="authority.grant",
            subject=f"authority:operations:{index}",
            payload={"grantee_office": "operations", "action": action, "subject": subject},
        )

    first_slice = make_slice(actor="agent-old", occupancy_ref="pf.occupancy.agent-old", beat_ref="pf.beat.adk-recovery-1")
    refs = execution_refs_from_slice(first_slice)
    assert await plugin(kernel, "agent-old").before_tool_callback(
        tool=Tool(), tool_args={"query": "world"}, tool_context=Context(first_slice),
    ) is None
    start = next(event for event in kernel.events() if event.request_id == refs.run_request_id)

    switch_at = (parse_time(start.recorded_at) + timedelta(microseconds=1)).isoformat(timespec="microseconds").replace("+00:00", "Z")
    registry.set_occupancy(
        "operations", "agent-new", effective_at=switch_at,
        occupancy_ref="pf.occupancy.agent-new", identity_ref="pf.identity.agent-new",
    )
    takeover = kernel.append(
        branch="main", actor="agent-new", office="operations", kind="run.takeover", subject=refs.run_subject,
        payload={
            "previous_actor": "agent-old", "successor_actor": "agent-new",
            "previous_occupancy_ref": "pf.occupancy.agent-old", "successor_occupancy_ref": "pf.occupancy.agent-new",
            "card_ref": "pf.card.adk-recovery", "reconciliation_ref": "pf.reconciliation.adk-recovery",
        },
        causes=[start.id], request_id="adk-recovery-takeover",
    )

    successor_slice = make_slice(
        actor="agent-new", occupancy_ref="pf.occupancy.agent-new", beat_ref="pf.beat.adk-recovery-2", run_ref=refs.run_ref,
    )
    successor_refs = execution_refs_from_slice(successor_slice)
    assert successor_refs.run_ref == refs.run_ref
    assert successor_refs.resume_request_id != refs.resume_request_id

    successor = plugin(kernel, "agent-new")
    context = Context(successor_slice)
    assert await successor.before_tool_callback(tool=Tool(), tool_args={"query": "world"}, tool_context=context) is None
    resume = next(event for event in kernel.events() if event.request_id == successor_refs.resume_request_id)
    assert resume.kind == "run.resume"
    assert resume.authority_ref == f"continuation:{takeover.id}"

    await successor.after_tool_callback(tool=Tool(), tool_args={}, tool_context=context, result={"ok": True})
    finish = next(event for event in kernel.events() if event.request_id == successor_refs.outcome_request_id)
    assert finish.actor == "agent-new"
    assert finish.authority_ref == f"continuation:{resume.id}"
    assert kernel.audit()["ok"] is True
    kernel.close()
