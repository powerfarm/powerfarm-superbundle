from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from continuum_maf import ContinuumFunctionController, DottedToolPolicy, PINNED_MAF_REVISION_REF, ToolMapping
from powerfarm.execution_slice import execution_refs_from_slice

from conftest import make_execution_slice


@dataclass
class Session:
    session_id: str = "maf-engine-local-session"
    state: dict = field(default_factory=dict)


@dataclass
class Context:
    session: Session = field(default_factory=Session)
    metadata: dict = field(default_factory=lambda: {"agent_name": "researcher"})


def controller(kernel):
    return ContinuumFunctionController(
        kernel=kernel,
        expect_institution=kernel.anchor(),
        policy=DottedToolPolicy({"search": ToolMapping(kind="tool.invoke.search", subject="tool:search")}),
        revision_ref=PINNED_MAF_REVISION_REF,
    )


@pytest.mark.asyncio
async def test_admission_and_completion_are_digest_only(kernel):
    value = make_execution_slice()
    ctl = controller(kernel)
    raw_input = "RAW-MAF-INPUT-MUST-NOT-ENTER-LEDGER"
    raw_output = "RAW-MAF-OUTPUT-MUST-NOT-ENTER-LEDGER"

    refused = await ctl.admit(tool_name="search", tool_args={"query": raw_input}, execution_slice=value, context=Context())
    assert refused is None
    await ctl.close(tool_name="search", execution_slice=value, context=Context(), result={"answer": raw_output})

    events = [event.public() for event in kernel.events("main")]
    serialized = str(events)
    assert raw_input not in serialized
    assert raw_output not in serialized
    assert [e["kind"] for e in events[-3:]] == ["tool.invoke.search", "run.start", "run.finish"]
    assert events[-3]["payload"]["runtime"] == "microsoft-agent-framework"
    assert events[-3]["payload"]["revision_ref"] == PINNED_MAF_REVISION_REF
    assert kernel.audit()["ok"] is True


@pytest.mark.asyncio
async def test_completed_run_refuses_replay_before_effect(kernel):
    value = make_execution_slice()
    ctl = controller(kernel)
    context = Context()
    assert await ctl.admit(tool_name="search", tool_args={"query": "x"}, execution_slice=value, context=context) is None
    await ctl.close(tool_name="search", execution_slice=value, context=context, result={"answer": "y"})

    replay = await ctl.admit(tool_name="search", tool_args={"query": "x"}, execution_slice=value, context=context)
    assert replay["code"] == "POWERFARM_ALREADY_COMPLETED"


@pytest.mark.asyncio
async def test_same_beat_is_in_flight_but_new_beat_can_resume(kernel):
    first = make_execution_slice()
    ctl = controller(kernel)
    context = Context()
    assert await ctl.admit(tool_name="search", tool_args={}, execution_slice=first, context=context) is None
    duplicate = await ctl.admit(tool_name="search", tool_args={}, execution_slice=first, context=context)
    assert duplicate["code"] == "POWERFARM_ALREADY_IN_FLIGHT"

    second = make_execution_slice(beat_ref="pf.beat.maf-test-reissue")
    assert execution_refs_from_slice(second).run_ref == execution_refs_from_slice(first).run_ref
    resumed = await ctl.admit(tool_name="search", tool_args={}, execution_slice=second, context=context)
    assert resumed is None
    assert any(e.kind == "run.resume" for e in kernel.events("main"))


@pytest.mark.asyncio
async def test_execution_slice_mapping_mismatch_fails_closed(kernel):
    value = make_execution_slice(subject="tool:wrong")
    ctl = controller(kernel)
    refusal = await ctl.admit(tool_name="search", tool_args={}, execution_slice=value, context=Context())
    assert refusal["code"] == "POWERFARM_CONTEXT_INVALID"
    assert not any(e.kind == "tool.invoke.search" for e in kernel.events("main"))


def test_runtime_kwargs_project_run_and_budget_without_engine_identity(kernel):
    value = make_execution_slice()
    ctl = controller(kernel)
    kwargs = ctl.runtime_kwargs(value)
    refs = execution_refs_from_slice(value)
    assert kwargs["powerfarm_run_ref"] == refs.run_ref
    assert kwargs["powerfarm_card_ref"] == value["card"]["ref"]
    assert kwargs["powerfarm_resource_budget"] == value["resources"]
    assert "session" not in kwargs
    assert "invocation" not in kwargs
