"""ExecutionSlice v4 resource-window negative controls for the ADK Setting.

An ExecutionSlice may be derived while its energy/cost authorization is valid
and then reach the engine after that authorization has expired. The Setting must
revalidate the sealed window against its own clock, immediately before the
external effect, and must fail closed when the window has lapsed.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field

import pytest

from continuum_adk import (
    ActorFromAgent,
    ContinuumPlugin,
    DottedToolPolicy,
    ExecutionSliceFromContext,
    StaticOffice,
    ToolMapping,
    assert_execution_slice_temporally_executable,
    verify_execution_slice_seal,
)
from powerfarm.execution_slice import ExecutionSliceError
from powerfarm.kernel import Kernel
from governance import Grant, provision_office
from support import make_execution_slice

EFFECTIVE = "2026-08-30T00:00:00.000Z"
EXPIRY = "2026-08-30T01:00:00.000Z"
JUST_BEFORE_EXPIRY = "2026-08-30T00:59:59.999Z"
AFTER_EXPIRY = "2026-08-30T01:00:00.001Z"


def expiring_slice(**overrides) -> dict:
    kwargs = {
        "evaluated_at": EFFECTIVE,
        "effective_at": EFFECTIVE,
        "energy_expires_at": EXPIRY,
        "cost_expires_at": EXPIRY,
    }
    kwargs.update(overrides)
    return make_execution_slice(**kwargs)


@dataclass
class Session:
    id: str = "s1"


@dataclass
class Context:
    powerfarm_execution_slice: dict | None = None
    invocation_id: str | None = "inv-window"
    function_call_id: str | None = "fc-window"
    attempt_count: int = 1
    agent_name: str = "researcher"
    user_id: str = "sensitive-user-id"
    session: Session = field(default_factory=Session)
    custom_metadata: dict | None = None


class Tool:
    def __init__(self, name: str):
        self.name = name


POLICY = DottedToolPolicy(
    {"search": ToolMapping(kind="tool.invoke.search", subject="tool:search")},
    strict=True,
)


def make_kernel(tmp_path) -> Kernel:
    k = Kernel(str(tmp_path / "institution.db"), identity_mode="embedded-test")
    k.init("director-human")
    provision_office(
        k,
        "research",
        mandate="research",
        principal="agent:researcher",
        grants=[Grant(action="tool.invoke.search", subject="tool:search")],
        director="director-human",
        with_run_lifecycle=True,
    )
    return k


def plugin(kernel: Kernel, *, now: str) -> ContinuumPlugin:
    return ContinuumPlugin(
        kernel=kernel,
        office=StaticOffice("research"),
        actor=ActorFromAgent(),
        execution_slice=ExecutionSliceFromContext(),
        policy=POLICY,
        revision_ref="build:abc123",
        clock=lambda: now,
    )


@pytest.mark.asyncio
async def test_expired_energy_window_refuses_before_any_ledger_effect(tmp_path):
    k = make_kernel(tmp_path)
    p = plugin(k, now=AFTER_EXPIRY)
    before = len(k.events())

    response = await p.before_tool_callback(
        tool=Tool("search"),
        tool_args={"query": "edge"},
        tool_context=Context(powerfarm_execution_slice=expiring_slice()),
    )

    # A non-None return blocks ADK from executing the external effect.
    assert response is not None
    assert response["status"] == "refused"
    assert response["reason"] == "energy authorization expired before execution"
    assert len(k.events()) == before, "an expired window must not admit an institutional run"
    k.close()


@pytest.mark.asyncio
async def test_expired_cost_window_alone_refuses(tmp_path):
    k = make_kernel(tmp_path)
    p = plugin(k, now=AFTER_EXPIRY)

    response = await p.before_tool_callback(
        tool=Tool("search"),
        tool_args={"query": "edge"},
        tool_context=Context(powerfarm_execution_slice=expiring_slice(energy_expires_at=None)),
    )

    assert response is not None
    assert response["status"] == "refused"
    assert response["reason"] == "cost authorization expired before execution"
    k.close()


@pytest.mark.asyncio
async def test_expires_at_is_an_exclusive_upper_boundary(tmp_path):
    k = make_kernel(tmp_path)

    at_expiry = await plugin(k, now=EXPIRY).before_tool_callback(
        tool=Tool("search"),
        tool_args={"query": "edge"},
        tool_context=Context(powerfarm_execution_slice=expiring_slice()),
    )
    assert at_expiry is not None and at_expiry["status"] == "refused"

    just_before = await plugin(k, now=JUST_BEFORE_EXPIRY).before_tool_callback(
        tool=Tool("search"),
        tool_args={"query": "edge"},
        tool_context=Context(powerfarm_execution_slice=expiring_slice()),
    )
    assert just_before is None, "the last instant inside the window is still authorized"
    k.close()


@pytest.mark.asyncio
async def test_engine_local_identity_cannot_widen_an_expired_window(tmp_path):
    k = make_kernel(tmp_path)
    p = plugin(k, now=AFTER_EXPIRY)
    before = len(k.events())

    # A fresh ADK invocation / function-call id is provenance, not authorization.
    response = await p.before_tool_callback(
        tool=Tool("search"),
        tool_args={"query": "edge"},
        tool_context=Context(
            powerfarm_execution_slice=expiring_slice(),
            invocation_id="fresh-invocation",
            function_call_id="fresh-function-call",
            attempt_count=7,
        ),
    )
    assert response is not None and response["status"] == "refused"
    assert response["reason"] == "energy authorization expired before execution"
    assert len(k.events()) == before
    k.close()


@pytest.mark.asyncio
async def test_a_hand_widened_window_breaks_the_seal(tmp_path):
    k = make_kernel(tmp_path)
    p = plugin(k, now=AFTER_EXPIRY)
    before = len(k.events())

    tampered = copy.deepcopy(expiring_slice())
    tampered["resources"]["authorization_window"]["energy"]["expires_at"] = "2099-01-01T00:00:00.000Z"
    tampered["resources"]["authorization_window"]["cost"]["expires_at"] = "2099-01-01T00:00:00.000Z"

    # Stated honestly: the temporal assertion trusts the window it is handed.
    assert_execution_slice_temporally_executable(tampered, at=AFTER_EXPIRY)
    # The seal is what makes the window unforgeable.
    assert verify_execution_slice_seal(tampered) is False

    response = await p.before_tool_callback(
        tool=Tool("search"),
        tool_args={"query": "edge"},
        tool_context=Context(powerfarm_execution_slice=tampered),
    )
    assert response is not None and response["status"] == "refused"
    assert response["reason"] == "ExecutionSlice content seal mismatch"
    assert len(k.events()) == before
    k.close()


def test_a_rewound_clock_cannot_precede_the_sealed_evaluation_instant():
    slice_value = expiring_slice(evaluated_at="2026-08-30T00:30:00.000Z")
    with pytest.raises(ExecutionSliceError, match="evaluated after execution time"):
        assert_execution_slice_temporally_executable(slice_value, at=EFFECTIVE)
