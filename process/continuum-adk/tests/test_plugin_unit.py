from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from continuum_adk import (
    ActorFromAgent,
    ContinuumPlugin,
    DottedToolPolicy,
    ExecutionSliceError,
    ExecutionSliceFromContext,
    StaticOffice,
    ToolMapping,
)
from powerfarm.kernel import Kernel
from governance import Grant, provision_office
from support import make_execution_slice


@dataclass
class Session:
    id: str = "s1"


@dataclass
class Context:
    invocation_id: str | None = "inv-1"
    function_call_id: str | None = "fc-1"
    attempt_count: int = 1
    agent_name: str = "researcher"
    user_id: str = "sensitive-user-id"
    session: Session = field(default_factory=Session)
    custom_metadata: dict | None = None
    powerfarm_execution_slice: dict | None = field(default_factory=make_execution_slice)


class Tool:
    def __init__(self, name: str): self.name = name


POLICY = DottedToolPolicy(
    {
        "search": ToolMapping(kind="tool.invoke.search", subject="tool:search"),
        "read_doc": ToolMapping(kind="tool.invoke.read-doc", subject="doc:{doc_id}"),
    },
    strict=True,
)


def plugin(kernel: Kernel, **kwargs) -> ContinuumPlugin:
    return ContinuumPlugin(
        kernel=kernel,
        expect_institution=kernel.anchor(),
        office=StaticOffice("research"),
        actor=ActorFromAgent(),
        execution_slice=ExecutionSliceFromContext(),
        policy=POLICY,
        revision_ref="build:abc123",
        **kwargs,
    )


def make_kernel(tmp_path, *, with_run_start: bool = True) -> Kernel:
    k = Kernel(str(tmp_path / "institution.db"), identity_mode="embedded-test")
    k.init("director-human")
    provision_office(
        k,
        "research",
        mandate="research",
        principal="agent:researcher",
        grants=[Grant(action="tool.invoke.search", subject="tool:search")],
        director="director-human",
        with_run_lifecycle=with_run_start,
    )
    return k


def ledger_text(k: Kernel) -> str:
    return "\n".join(repr(e.public()) for e in k.events("main"))


def test_execution_slice_uses_invocation_metadata_and_checks_requested_capability():
    expected = make_execution_slice()
    context = Context(
        custom_metadata={"powerfarm_execution_slice": expected},
        powerfarm_execution_slice=None,
    )

    resolved = ExecutionSliceFromContext()(
        context,
        tool_name="search",
        kind="tool.invoke.search",
        subject="tool:search",
    )

    assert resolved == expected
    with pytest.raises(ExecutionSliceError, match="capability"):
        ExecutionSliceFromContext()(
            context,
            tool_name="deploy",
            kind="tool.invoke.deploy",
            subject="service:billing",
        )


@pytest.mark.asyncio
async def test_plugin_passes_projected_act_to_execution_slice_resolver(tmp_path):
    class RecordingResolver:
        def __init__(self):
            self.requests = []

        def __call__(self, context, *, tool_name, kind, subject):
            self.requests.append((tool_name, kind, subject))
            return make_execution_slice(tool_name=tool_name, kind=kind, subject=subject)

    k = make_kernel(tmp_path)
    resolver = RecordingResolver()
    p = ContinuumPlugin(
        kernel=k,
        expect_institution=k.anchor(),
        office=StaticOffice("research"),
        actor=ActorFromAgent(),
        execution_slice=resolver,
        policy=POLICY,
        revision_ref="build:abc123",
    )

    response = await p.before_tool_callback(
        tool=Tool("search"), tool_args={"query": "edge"}, tool_context=Context()
    )

    assert response is None
    assert resolver.requests == [("search", "tool.invoke.search", "tool:search")]
    k.close()


def test_strict_plugin_requires_explicit_policy_and_revision(tmp_path):
    k = Kernel(str(tmp_path / "x.db"), identity_mode="embedded-test"); k.init("director-human")
    with pytest.raises(ValueError, match="ExecutionSlice"):
        ContinuumPlugin(kernel=k, expect_institution=k.anchor(), office=StaticOffice("director"), actor=ActorFromAgent(), policy=POLICY, revision_ref="r")
    with pytest.raises(ValueError):
        ContinuumPlugin(kernel=k, expect_institution=k.anchor(), office=StaticOffice("director"), actor=ActorFromAgent(), execution_slice=ExecutionSliceFromContext(), revision_ref="r")
    with pytest.raises(ValueError):
        ContinuumPlugin(kernel=k, expect_institution=k.anchor(), office=StaticOffice("director"), actor=ActorFromAgent(), execution_slice=ExecutionSliceFromContext(), policy=POLICY)
    k.close()


@pytest.mark.asyncio
async def test_intent_and_run_start_are_atomic_on_refusal(tmp_path):
    k = make_kernel(tmp_path, with_run_start=False)
    p = plugin(k)
    before = len(k.events())
    response = await p.before_tool_callback(tool=Tool("search"), tool_args={"query": "edge"}, tool_context=Context())
    assert response["status"] == "refused"
    assert len(k.events()) == before
    assert "actor" not in response
    k.close()


@pytest.mark.asyncio
async def test_success_records_digest_only_and_never_raw_secret(tmp_path):
    k = make_kernel(tmp_path)
    p = plugin(k)
    response = await p.before_tool_callback(
        tool=Tool("search"),
        tool_args={"query": "edge", "token": "sk-top-secret", "temperature": 0.7},
        tool_context=Context(),
    )
    assert response is None
    text = ledger_text(k)
    assert "sk-top-secret" not in text
    assert "sensitive-user-id" not in text
    assert "tool.invoke.search" in text
    assert "run.start" in text
    k.close()


@pytest.mark.asyncio
async def test_outcome_is_recovered_from_ledger_not_plugin_memory(tmp_path):
    k = make_kernel(tmp_path)
    ctx = Context()
    await plugin(k).before_tool_callback(tool=Tool("search"), tool_args={"query": "edge"}, tool_context=ctx)

    # New plugin instance: no callback-local memory exists to carry the run.
    p2 = plugin(k)
    await p2.after_tool_callback(tool=Tool("search"), tool_args={"query": "edge"}, tool_context=ctx, result={"hits": ["secret-result"], "count": 1})
    kinds = [e.kind for e in k.events()]
    assert "run.finish" in kinds
    assert "secret-result" not in ledger_text(k)
    assert k.audit()["ok"]
    k.close()


@pytest.mark.asyncio
async def test_revocation_blocks_new_runs_but_does_not_erase_existing_outcome(tmp_path):
    k = make_kernel(tmp_path)
    ctx = Context()
    p = plugin(k)
    await p.before_tool_callback(tool=Tool("search"), tool_args={"query": "edge"}, tool_context=ctx)

    start_grant = next(e for e in k.events() if e.kind == "authority.grant" and e.payload.get("action") == "run.start")
    k.append(
        branch="main", actor="director-human", office="director", kind="authority.revoke",
        subject="office:research", payload={"grant_id": start_grant.id},
    )

    await p.after_tool_callback(tool=Tool("search"), tool_args={}, tool_context=ctx, result={"ok": True})
    finish = next(e for e in k.events() if e.kind == "run.finish")
    run = next(e for e in k.events() if e.kind == "run.start")
    assert finish.authority_ref == f"continuation:{run.id}"

    refused = await p.before_tool_callback(
        tool=Tool("search"), tool_args={"query": "new"},
        tool_context=Context(
            invocation_id="inv-2", function_call_id="fc-2",
            powerfarm_execution_slice=make_execution_slice(
                beat_ref="pf.beat.adk-test-2", attempt_ref="pf.attempt.adk-test-2"
            ),
        ),
    )
    assert refused["status"] == "refused"
    k.close()


@pytest.mark.asyncio
async def test_engine_local_invocation_ids_do_not_create_new_institutional_runs(tmp_path):
    k = make_kernel(tmp_path)
    p = plugin(k)
    first = Context(invocation_id="inv-a", function_call_id="same-fc")
    second = Context(invocation_id="inv-b", function_call_id="same-fc")
    assert await p.before_tool_callback(
        tool=Tool("search"), tool_args={"query": "a"}, tool_context=first,
    ) is None
    refused = await p.before_tool_callback(
        tool=Tool("search"), tool_args={"query": "b"}, tool_context=second,
    )
    assert refused["status"] == "refused"
    assert refused["code"] == "POWERFARM_ALREADY_IN_FLIGHT"
    starts = [e for e in k.events() if e.kind == "run.start"]
    assert len(starts) == 1
    assert starts[0].subject.startswith("run:pfx-")
    k.close()


@pytest.mark.asyncio
async def test_missing_execution_slice_fails_closed_without_trace(tmp_path):
    k = make_kernel(tmp_path)
    p = plugin(k)
    before = len(k.events())
    response = await p.before_tool_callback(
        tool=Tool("search"), tool_args={},
        tool_context=Context(invocation_id=None, function_call_id=None, powerfarm_execution_slice=None),
    )
    assert response["status"] == "refused"
    assert len(k.events()) == before
    k.close()


@pytest.mark.asyncio
async def test_unmapped_tool_fails_closed_in_strict_policy(tmp_path):
    k = make_kernel(tmp_path)
    p = plugin(k)
    before = len(k.events())
    response = await p.before_tool_callback(tool=Tool("deploy"), tool_args={"service": "prod"}, tool_context=Context())
    assert response["status"] == "refused"
    assert len(k.events()) == before
    k.close()


@pytest.mark.asyncio
async def test_error_message_is_hashed_not_persisted(tmp_path):
    k = make_kernel(tmp_path)
    p = plugin(k)
    ctx = Context()
    await p.before_tool_callback(tool=Tool("search"), tool_args={}, tool_context=ctx)
    await p.on_tool_error_callback(
        tool=Tool("search"), tool_args={}, tool_context=ctx,
        error=RuntimeError("token=super-secret database password"),
    )
    text = ledger_text(k)
    assert "super-secret" not in text
    assert "database password" not in text
    assert "run.fail" in text
    k.close()

@pytest.mark.asyncio
async def test_outcome_callback_is_idempotent(tmp_path):
    k = make_kernel(tmp_path)
    ctx = Context()
    p = plugin(k)
    await p.before_tool_callback(tool=Tool("search"), tool_args={}, tool_context=ctx)
    await p.after_tool_callback(tool=Tool("search"), tool_args={}, tool_context=ctx, result={"ok": True})
    count = len(k.events())
    await p.after_tool_callback(tool=Tool("search"), tool_args={}, tool_context=ctx, result={"ok": True})
    assert len(k.events()) == count
    assert len([e for e in k.events() if e.kind == "run.finish"]) == 1
    k.close()


@pytest.mark.asyncio
async def test_restarted_plugin_uses_revision_that_opened_run(tmp_path):
    k = make_kernel(tmp_path)
    ctx = Context()
    await plugin(k).before_tool_callback(tool=Tool("search"), tool_args={}, tool_context=ctx)
    newer = ContinuumPlugin(
        kernel=k,
        expect_institution=k.anchor(), office=StaticOffice("research"), actor=ActorFromAgent(),
        execution_slice=ExecutionSliceFromContext(), policy=POLICY, revision_ref="build:newer",
    )
    await newer.after_tool_callback(tool=Tool("search"), tool_args={}, tool_context=ctx, result={"ok": True})
    finish = next(e for e in k.events() if e.kind == "run.finish")
    assert finish.payload["revision_ref"] == "build:abc123"
    k.close()


@pytest.mark.asyncio
async def test_refusal_does_not_leak_principal_through_reason(tmp_path):
    k = make_kernel(tmp_path, with_run_start=False)
    p = plugin(k)
    response = await p.before_tool_callback(tool=Tool("search"), tool_args={}, tool_context=Context())
    assert "agent:researcher" not in repr(response)
    assert response["reason"] == "institutional authority denied"
    k.close()


@pytest.mark.asyncio
async def test_completed_call_is_blocked_before_adk_can_repeat_external_effect(tmp_path):
    k = make_kernel(tmp_path)
    ctx = Context()
    p = plugin(k)
    assert await p.before_tool_callback(tool=Tool("search"), tool_args={"query": "edge"}, tool_context=ctx) is None
    await p.after_tool_callback(tool=Tool("search"), tool_args={}, tool_context=ctx, result={"ok": True})
    count = len(k.events())

    replay = await p.before_tool_callback(tool=Tool("search"), tool_args={"query": "edge"}, tool_context=ctx)
    assert replay["status"] == "refused"
    assert replay["code"] == "POWERFARM_ALREADY_COMPLETED"
    assert replay["reason"] == "institutional run already completed"
    assert len(k.events()) == count
    k.close()
