"""Admission behaviour under a real ADK Runner.

These drive google.adk.Runner end to end with a scripted model, so they cover
the actual PluginManager dispatch, flow machinery, and Continuum semantics
rather than a mock of any of them.
"""

from __future__ import annotations

import os
import pytest

if os.environ.get("CONTINUUM_ADK_REAL_ADK") != "1":
    pytest.skip("google-adk is not installed in this offline QA environment", allow_module_level=True)

from google.adk.agents.llm_agent import LlmAgent
from google.adk.agents.run_config import RunConfig
from google.adk.apps.app import App
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types

from continuum_adk import (
    ActorFromAgent,
    ContinuumPlugin,
    DottedToolPolicy,
    ExecutionSliceFromContext,
    StaticOffice,
    ToolMapping,
)
from support import make_execution_slice

from typing import AsyncGenerator
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse

class ScriptedModel(BaseLlm):
    model: str = "scripted"
    script: list = []
    index: int = -1

    @classmethod
    def supported_models(cls) -> list[str]:
        return ["scripted"]

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        self.index += 1
        step = self.script[self.index] if self.index < len(self.script) else ("text", "done")
        if step[0] == "call":
            part = types.Part.from_function_call(name=step[1], args=step[2])
        else:
            part = types.Part(text=step[1])
        yield LlmResponse(content=types.Content(role="model", parts=[part]))


def search(query: str) -> dict:
    """Search the corpus."""
    return {"hits": [f"result for {query}"], "count": 1}


def deploy(service: str) -> dict:
    """Deploy a service to production."""
    return {"deployed": service}


def read_doc(doc_id: str) -> dict:
    """Read a document by id."""
    raise FileNotFoundError(f"no such document: {doc_id}")


POLICY = DottedToolPolicy(
    {
        "search": ToolMapping(kind="tool.invoke.search", subject="tool:search"),
        "read_doc": ToolMapping(kind="tool.invoke.read-doc", subject="doc:{doc_id}"),
        "deploy": ToolMapping(kind="tool.invoke.deploy", subject="service:{service}"),
    },
    strict=True,
)


def make_plugin(kernel, **kwargs) -> ContinuumPlugin:
    return ContinuumPlugin(
        kernel=kernel,
        office=StaticOffice("research"),
        actor=ActorFromAgent(),
        execution_slice=ExecutionSliceFromContext(),
        policy=POLICY,
        revision_ref="test",
        **kwargs,
    )


async def run_script(kernel, script, tools, **plugin_kwargs):
    """Drive a Runner through a scripted sequence, returning the tool results."""
    plugin = make_plugin(kernel, **plugin_kwargs)
    agent = LlmAgent(
        name="researcher",
        model=ScriptedModel(script=script),
        instruction="Use your tools.",
        tools=tools,
    )
    session_service = InMemorySessionService()
    await session_service.create_session(
        app_name="test", user_id="u1", session_id="s1"
    )
    # Plugins are registered on the App; passing them to Runner is deprecated
    # in ADK 2.8.
    app = App(name="test", root_agent=agent, plugins=[plugin])
    runner = Runner(app=app, session_service=session_service)

    first_call = next(step for step in script if step[0] == "call")
    projection = POLICY.project(first_call[1], first_call[2])
    execution_slice = make_execution_slice(
        tool_name=first_call[1],
        kind=projection.kind,
        subject=projection.subject,
    )

    responses = []
    error = None
    try:
        async for event in runner.run_async(
            user_id="u1",
            session_id="s1",
            new_message=types.Content(role="user", parts=[types.Part(text="go")]),
            run_config=RunConfig(
                custom_metadata={"powerfarm_execution_slice": execution_slice}
            ),
        ):
            for part in event.content.parts if event.content else []:
                if part.function_response:
                    responses.append(part.function_response.response)
    except Exception as exc:  # noqa: BLE001 - the tool error is the subject
        error = exc
    return responses, error


def kinds(kernel) -> list[str]:
    return [e.kind for e in kernel.events("main")]


# ----------------------------------------------------------------------
# granted path
# ----------------------------------------------------------------------


async def test_granted_tool_executes_and_is_recorded(kernel):
    responses, error = await run_script(
        kernel, [("call", "search", {"query": "edge"})], [search]
    )
    assert error is None
    assert responses[0]["count"] == 1

    recorded = kinds(kernel)
    assert "tool.invoke.search" in recorded
    assert "run.start" in recorded
    assert "run.finish" in recorded


async def test_outcome_cites_both_run_and_intent(kernel):
    await run_script(kernel, [("call", "search", {"query": "edge"})], [search])
    events = kernel.events("main")
    by_id = {e.id: e for e in events}
    finish = next(e for e in events if e.kind == "run.finish")
    cited = [by_id[c].kind for c in finish.causes]
    # The run is cited for the lifecycle check; the intent so that proof()
    # can walk back to the authorizing grant.
    assert "run.start" in cited
    assert "tool.invoke.search" in cited


async def test_proof_walks_back_to_the_authorizing_grant(kernel):
    await run_script(kernel, [("call", "search", {"query": "edge"})], [search])
    finish = next(e for e in kernel.events("main") if e.kind == "run.finish")
    proof = kernel.proof(finish.id)
    assert "authority.grant" in {n["kind"] for n in proof["nodes"]}


# ----------------------------------------------------------------------
# refusal
# ----------------------------------------------------------------------


async def test_ungranted_tool_is_refused_and_never_executes(kernel):
    responses, error = await run_script(
        kernel, [("call", "deploy", {"service": "billing-api"})], [deploy]
    )
    assert error is None
    assert responses[0]["status"] == "refused"
    assert responses[0]["refused_by"] == "continuum"
    # The tool's own return value never appears.
    assert "deployed" not in responses[0]


async def test_refusal_names_the_attempted_act(kernel):
    responses, _ = await run_script(
        kernel, [("call", "deploy", {"service": "billing-api"})], [deploy]
    )
    attempted = responses[0]["attempted_act"]
    assert attempted["kind"] == "tool.invoke.deploy"
    assert attempted["subject"].startswith("service:billing-api~")
    assert responses[0]["office"] == "research"


async def test_refused_call_leaves_no_trace_in_the_ledger(kernel):
    before = len(kernel.events("main"))
    await run_script(kernel, [("call", "deploy", {"service": "x"})], [deploy])
    assert len(kernel.events("main")) == before


async def test_refusal_is_returned_not_raised(bare_kernel):
    # A raised exception would be wrapped by PluginManager into a RuntimeError
    # and would surface as a framework crash rather than a governed refusal.
    responses, error = await run_script(
        bare_kernel, [("call", "search", {"query": "x"})], [search]
    )
    assert error is None
    assert responses[0]["status"] == "refused"


# ----------------------------------------------------------------------
# failure
# ----------------------------------------------------------------------


async def test_tool_failure_closes_the_run_as_failed(kernel):
    responses, error = await run_script(
        kernel, [("call", "read_doc", {"doc_id": "rfc-42"})], [read_doc]
    )
    # The plugin must not swallow the tool's error.
    assert isinstance(error, FileNotFoundError)
    recorded = kinds(kernel)
    assert "run.fail" in recorded
    assert "run.finish" not in recorded


async def test_failure_payload_records_the_error(kernel):
    await run_script(kernel, [("call", "read_doc", {"doc_id": "rfc-42"})], [read_doc])
    fail = next(e for e in kernel.events("main") if e.kind == "run.fail")
    assert fail.payload["error"]["type"] == "builtins.FileNotFoundError"


# ----------------------------------------------------------------------
# integrity
# ----------------------------------------------------------------------


async def test_ledger_audits_clean_after_a_mixed_run(kernel):
    await run_script(
        kernel,
        [
            ("call", "search", {"query": "edge"}),
            ("call", "deploy", {"service": "billing-api"}),
            ("text", "done"),
        ],
        [search, deploy],
    )
    report = kernel.audit()
    assert report["ok"], report["errors"]


async def test_record_outcomes_false_admits_without_run_lifecycle(kernel):
    await run_script(
        kernel,
        [("call", "search", {"query": "edge"})],
        [search],
        record_outcomes=False,
    )
    recorded = kinds(kernel)
    assert "tool.invoke.search" in recorded
    assert "run.start" not in recorded
