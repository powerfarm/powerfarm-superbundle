from __future__ import annotations

from dataclasses import dataclass, field

import pytest

agent_framework = pytest.importorskip("agent_framework")
from agent_framework import FunctionInvocationContext, FunctionTool

from continuum_maf import ContinuumFunctionController, DottedToolPolicy, PINNED_MAF_REVISION_REF, ToolMapping, make_continuum_middleware

from conftest import make_execution_slice


@dataclass
class Session:
    session_id: str = "real-maf-session"
    state: dict = field(default_factory=dict)


@pytest.mark.asyncio
async def test_real_maf_function_tool_runs_through_powerfarm_middleware(kernel):
    effects = 0
    seen = {}

    async def search(query: str, ctx: FunctionInvocationContext):
        nonlocal effects
        effects += 1
        seen.update(ctx.kwargs)
        return {"answer": "RAW-MAF-ENGINE-RESULT", "query": query}

    tool = FunctionTool(name="search", description="search", func=search, approval_mode="never_require")
    execution_slice = make_execution_slice()
    context = FunctionInvocationContext(
        function=tool,
        arguments={"query": "RAW-MAF-ENGINE-INPUT"},
        session=Session(),
        metadata={"agent_name": "researcher"},
        kwargs={"powerfarm_execution_slice": execution_slice},
    )
    controller = ContinuumFunctionController(
        kernel=kernel,
        policy=DottedToolPolicy({"search": ToolMapping(kind="tool.invoke.search", subject="tool:search")}),
        revision_ref=PINNED_MAF_REVISION_REF,
    )
    middleware = make_continuum_middleware(controller)

    async def call_next():
        context.result = await tool.invoke(arguments=context.arguments, context=context, skip_parsing=True)

    await middleware(context, call_next)
    assert effects == 1
    assert seen["powerfarm_run_ref"].startswith("pfx-")
    assert seen["powerfarm_card_ref"] == execution_slice["card"]["ref"]
    assert seen["powerfarm_resource_budget"] == execution_slice["resources"]

    await middleware(context, call_next)
    assert effects == 1
    assert context.result["code"] == "POWERFARM_ALREADY_COMPLETED"
