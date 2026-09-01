"""ExecutionSlice v4 resource-window negative controls for the MAF Setting.

The Setting receives a sealed slice whose energy/cost authorization windows were
sealed at derivation time. It must revalidate those windows against its own clock
immediately before the external effect, and fail closed once they have lapsed.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field

import pytest

from continuum_maf import ContinuumFunctionController, DottedToolPolicy, PINNED_MAF_REVISION_REF, ToolMapping
from powerfarm.execution_slice import (
    ExecutionSliceError,
    assert_execution_slice_temporally_executable,
    verify_execution_slice_seal,
)

from conftest import make_execution_slice

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
    session_id: str = "maf-engine-local-session"
    state: dict = field(default_factory=dict)


@dataclass
class Context:
    session: Session = field(default_factory=Session)
    metadata: dict = field(default_factory=lambda: {"agent_name": "researcher"})


def controller(kernel, *, now: str):
    return ContinuumFunctionController(
        kernel=kernel,
        policy=DottedToolPolicy({"search": ToolMapping(kind="tool.invoke.search", subject="tool:search")}),
        revision_ref=PINNED_MAF_REVISION_REF,
        clock=lambda: now,
    )


@pytest.mark.asyncio
async def test_expired_energy_window_refuses_before_any_ledger_effect(kernel):
    ctl = controller(kernel, now=AFTER_EXPIRY)
    before = len(kernel.events("main"))

    response = await ctl.admit(
        tool_name="search", tool_args={"query": "x"}, execution_slice=expiring_slice(), context=Context()
    )

    assert response is not None, "a refusal is required; None would let MAF execute"
    assert response["status"] == "refused"
    assert response["code"] == "POWERFARM_CONTEXT_INVALID"
    assert response["reason"] == "energy authorization expired before execution"
    assert len(kernel.events("main")) == before


@pytest.mark.asyncio
async def test_expired_cost_window_alone_refuses(kernel):
    ctl = controller(kernel, now=AFTER_EXPIRY)
    response = await ctl.admit(
        tool_name="search",
        tool_args={"query": "x"},
        execution_slice=expiring_slice(energy_expires_at=None),
        context=Context(),
    )
    assert response is not None
    assert response["reason"] == "cost authorization expired before execution"


@pytest.mark.asyncio
async def test_expires_at_is_an_exclusive_upper_boundary(kernel):
    at_expiry = await controller(kernel, now=EXPIRY).admit(
        tool_name="search", tool_args={"query": "x"}, execution_slice=expiring_slice(), context=Context()
    )
    assert at_expiry is not None and at_expiry["status"] == "refused"

    just_before = await controller(kernel, now=JUST_BEFORE_EXPIRY).admit(
        tool_name="search", tool_args={"query": "x"}, execution_slice=expiring_slice(), context=Context()
    )
    assert just_before is None, "the last instant inside the window is still authorized"


@pytest.mark.asyncio
async def test_engine_local_session_identity_cannot_widen_an_expired_window(kernel):
    ctl = controller(kernel, now=AFTER_EXPIRY)
    before = len(kernel.events("main"))

    # A fresh MAF session is engine-local provenance, not a re-authorization.
    response = await ctl.admit(
        tool_name="search",
        tool_args={"query": "x"},
        execution_slice=expiring_slice(),
        context=Context(session=Session(session_id="fresh-maf-session")),
    )
    assert response is not None and response["status"] == "refused"
    assert response["reason"] == "energy authorization expired before execution"
    assert len(kernel.events("main")) == before


@pytest.mark.asyncio
async def test_a_hand_widened_window_breaks_the_seal(kernel):
    ctl = controller(kernel, now=AFTER_EXPIRY)
    before = len(kernel.events("main"))

    tampered = copy.deepcopy(expiring_slice())
    tampered["resources"]["authorization_window"]["energy"]["expires_at"] = "2099-01-01T00:00:00.000Z"
    tampered["resources"]["authorization_window"]["cost"]["expires_at"] = "2099-01-01T00:00:00.000Z"

    # Stated honestly: the temporal assertion trusts the window it is handed.
    assert_execution_slice_temporally_executable(tampered, at=AFTER_EXPIRY)
    # The seal is what makes the window unforgeable, and the Setting checks it.
    assert verify_execution_slice_seal(tampered) is False

    response = await ctl.admit(
        tool_name="search", tool_args={"query": "x"}, execution_slice=tampered, context=Context()
    )
    assert response is not None
    assert response["reason"] == "ExecutionSlice content seal mismatch"
    assert len(kernel.events("main")) == before


def test_a_rewound_clock_cannot_precede_the_sealed_evaluation_instant():
    value = expiring_slice(evaluated_at="2026-08-30T00:30:00.000Z")
    with pytest.raises(ExecutionSliceError, match="evaluated after execution time"):
        assert_execution_slice_temporally_executable(value, at=EFFECTIVE)
