"""Google ADK admission plugin backed by Powerfarm Continuum.

The before-tool boundary is fail-closed and atomic: tool intent + run.start are
admitted in one Continuum transaction. Raw arguments/results are not persisted
by default. The plugin keeps no authoritative in-memory run state; outcome
callbacks recover the open run from deterministic request IDs in the ledger.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Optional

from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools.base_tool import BaseTool
from powerfarm.kernel import InstitutionalError, Kernel
from powerfarm.validation import ValidationError

from .evidence import DigestOnlyEvidence, EvidencePolicy
from .execution_slice import (
    ExecutionSliceError,
    ExecutionSliceResolver,
    execution_refs_from_slice,
    slice_provenance,
    validate_execution_slice,
    verify_execution_slice_seal,
)
from .identity import ActorResolver, OfficeResolver
from .mapping import ActProjection, DottedToolPolicy, MappingError, MappingPolicy, kindify
from .receipts import COMPLETED, FAILED, build_receipt, outcome_act
from .refusal import RefusalRenderer, StructuredRefusal

logger = logging.getLogger("continuum_adk")
DEFAULT_RUNTIME = "google-adk"


class AdapterContextError(ValueError):
    """The ADK callback lacks identity required for safe idempotency."""


@dataclass(frozen=True)
class _CallRefs:
    digest: str
    run_ref: str
    run_subject: str
    intent_request_id: str
    run_request_id: str
    resume_request_id: str
    outcome_request_id: str


@dataclass(frozen=True)
class _OpenCall:
    intent_event_id: str
    intent_authority_ref: str
    run_event_id: str
    run_subject: str
    run_ref: str
    started_at: str
    actor: str
    office: str
    runtime: str
    revision_ref: str
    tool_name: str


class ContinuumPlugin(BasePlugin):
    """Institutional admission control for ADK tool execution.

    Production defaults are intentionally strict:
    * an explicit tool mapping policy is required;
    * a concrete runtime revision is required;
    * refusals do not reveal the principal;
    * arguments/results are digest-only evidence unless a narrower policy is
      explicitly supplied.
    """

    def __init__(
        self,
        *,
        kernel: Kernel,
        office: OfficeResolver,
        actor: ActorResolver,
        execution_slice: ExecutionSliceResolver | None = None,
        policy: MappingPolicy | None = None,
        evidence: EvidencePolicy | None = None,
        refusal: RefusalRenderer | None = None,
        ledger_branch: str = "main",
        runtime_name: str = DEFAULT_RUNTIME,
        revision_ref: str | None = None,
        record_outcomes: bool = True,
        strict: bool = True,
        name: str = "continuum_admission",
    ) -> None:
        super().__init__(name=name)
        if execution_slice is None:
            raise ValueError("ContinuumPlugin requires an ExecutionSlice resolver; ADK engine-local context is not institutional identity")
        if strict and policy is None:
            raise ValueError("strict ContinuumPlugin requires an explicit tool mapping policy")
        if strict and isinstance(policy, DottedToolPolicy) and not policy.strict:
            raise ValueError("strict ContinuumPlugin requires DottedToolPolicy(strict=True)")
        if strict and (not revision_ref or revision_ref == "unspecified"):
            raise ValueError("strict ContinuumPlugin requires a concrete revision_ref")
        self.kernel = kernel
        self.office = office
        self.actor = actor
        self.execution_slice = execution_slice
        self.policy = policy or DottedToolPolicy(strict=False)
        self.evidence = evidence or DigestOnlyEvidence()
        self.refusal = refusal or StructuredRefusal(include_actor=False)
        self.ledger_branch = ledger_branch
        self.runtime_name = runtime_name
        self.revision_ref = revision_ref or "unspecified"
        self.record_outcomes = record_outcomes
        self.strict = strict

    async def before_tool_callback(self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: Any) -> Optional[dict[str, Any]]:
        projection: ActProjection | None = None
        office = "unknown"
        actor = "unknown"
        try:
            projection = self.policy.project(tool.name, tool_args)
            execution_slice = self._resolve_execution_slice(tool_context, tool.name, projection)
            office = str(execution_slice["principal"]["office"])
            actor = str(execution_slice["principal"]["actor"])
            refs = self._call_refs(tool_context, tool.name)
            if self.record_outcomes and await asyncio.to_thread(self._outcome_exists, refs):
                # The institutional call already reached a terminal outcome.
                # Returning a non-None value from before_tool_callback prevents
                # ADK from executing the external effect again.
                refusal = self._render_refusal(
                    tool.name, "institutional run already completed", office, actor, projection
                )
                refusal["code"] = "POWERFARM_ALREADY_COMPLETED"
                return refusal
            if self.record_outcomes:
                existing_run = await asyncio.to_thread(self._event_by_request, refs.run_request_id)
                if existing_run is not None:
                    current_beat = execution_slice["circulation"]["beat_ref"]
                    if current_beat is None or str(existing_run.payload.get("beat_ref") or "") == str(current_beat):
                        refusal = self._render_refusal(tool.name, "same Heartime beat is already admitted", office, actor, projection)
                        refusal["code"] = "POWERFARM_ALREADY_IN_FLIGHT"
                        return refusal
                    anchor = await asyncio.to_thread(self._continuation_anchor, refs, actor, office)
                    if anchor is None:
                        refusal = self._render_refusal(tool.name, "successor occupancy requires Process takeover", office, actor, projection)
                        refusal["code"] = "POWERFARM_TAKEOVER_REQUIRED"
                        return refusal
                    await asyncio.to_thread(
                        self.kernel.append,
                        branch=self.ledger_branch, actor=actor, office=office, kind="run.resume",
                        subject=refs.run_subject,
                        payload={
                            "card_ref": execution_slice["card"]["ref"],
                            "beat_ref": execution_slice["circulation"]["beat_ref"],
                            "attempt_ref": execution_slice["circulation"]["attempt_ref"],
                            "execution_slice_sha256": execution_slice["slice_sha256"],
                        },
                        causes=[anchor.id], request_id=refs.resume_request_id,
                    )
                    return None
            provenance = {**self.evidence.provenance(tool_context), **slice_provenance(execution_slice)}
            intent_payload = {
                "tool": tool.name,
                "arguments": self.evidence.arguments(tool.name, tool_args),
                "runtime": self.runtime_name,
                "revision_ref": self.revision_ref,
                "provenance": provenance,
            }

            if not self.record_outcomes:
                await asyncio.to_thread(
                    self.kernel.append,
                    branch=self.ledger_branch,
                    actor=actor,
                    office=office,
                    kind=projection.kind,
                    subject=projection.subject,
                    payload=intent_payload,
                    request_id=refs.intent_request_id,
                )
                return None

            # All or nothing. If run.start lacks authority, the intent event is
            # rolled back too; refused calls leave no partial ledger trace.
            await asyncio.to_thread(
                self.kernel.append_batch,
                [
                    {
                        "alias": "intent",
                        "actor": actor,
                        "office": office,
                        "kind": projection.kind,
                        "subject": projection.subject,
                        "payload": intent_payload,
                        "request_id": refs.intent_request_id,
                    },
                    {
                        "alias": "run",
                        "actor": actor,
                        "office": office,
                        "kind": "run.start",
                        "subject": refs.run_subject,
                        "payload": {
                            "runtime": self.runtime_name,
                            "revision_ref": self.revision_ref,
                            "tool": tool.name,
                            "owner_office": office,
                            "call_ref": refs.digest,
                            "direction_ref": execution_slice["institutional"].get("direction_ref"),
                            "effective_capability_set_sha256": execution_slice["institutional"].get("ecs_sha256"),
                            "card_ref": execution_slice["card"]["ref"],
                            "beat_ref": execution_slice["circulation"]["beat_ref"],
                            "attempt_ref": execution_slice["circulation"]["attempt_ref"],
                            "execution_slice_sha256": execution_slice["slice_sha256"],
                        },
                        "causes": ["@intent"],
                        "request_id": refs.run_request_id,
                    },
                ],
                branch=self.ledger_branch,
            )
            return None
        except (InstitutionalError, ValidationError, MappingError, AdapterContextError, ExecutionSliceError) as exc:
            logger.info("continuum refused %s: %s", tool.name, exc)
            return self._render_refusal(tool.name, self._public_reason(exc), office, actor, projection)
        except Exception:  # fail closed; never turn policy infrastructure failure into tool execution
            logger.exception("continuum admission infrastructure failed for %s", tool.name)
            return self._render_refusal(tool.name, "admission check failed", office, actor, projection)

    async def after_tool_callback(self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: Any, result: dict[str, Any]) -> Optional[dict[str, Any]]:
        await self._close_run(tool=tool, tool_context=tool_context, status=COMPLETED, output=result, error=None)
        return None

    async def on_tool_error_callback(self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: Any, error: Exception) -> Optional[dict[str, Any]]:
        await self._close_run(tool=tool, tool_context=tool_context, status=FAILED, output=None, error=error)
        return None

    async def _close_run(self, *, tool: BaseTool, tool_context: Any, status: str, output: Any, error: Exception | None) -> None:
        if not self.record_outcomes:
            return
        try:
            refs = self._call_refs(tool_context, tool.name)
            if await asyncio.to_thread(self._outcome_exists, refs):
                return
            current_slice = self.execution_slice(tool_context)
            current_actor = str(current_slice["principal"]["actor"])
            current_office = str(current_slice["principal"]["office"])
            open_call = await asyncio.to_thread(self._recover_open_call, refs, current_actor, current_office)
            if open_call is None:
                logger.warning("continuum could not recover an admitted run for %s", tool.name)
                return
            output_evidence = self.evidence.result(tool.name, output) if output is not None else None
            error_evidence = self.evidence.error(tool.name, error) if error is not None else None
            receipt_provenance = {**self.evidence.provenance(tool_context), **slice_provenance(self.execution_slice(tool_context))}
            receipt = build_receipt(
                runtime=open_call.runtime,
                revision_ref=open_call.revision_ref,
                run_ref=open_call.run_ref,
                status=status,
                tool_name=open_call.tool_name,
                authority_ref=open_call.intent_authority_ref,
                started_at=open_call.started_at,
                output_evidence=output_evidence,
                error_evidence=error_evidence,
                provenance=receipt_provenance,
            )
            act = outcome_act(receipt, run_subject=open_call.run_subject)
            await asyncio.to_thread(
                self.kernel.append,
                branch=self.ledger_branch,
                actor=open_call.actor,
                office=open_call.office,
                kind=act["kind"],
                subject=act["subject"],
                payload=act["payload"],
                causes=[open_call.run_event_id, open_call.intent_event_id],
                request_id=refs.outcome_request_id,
            )
        except (InstitutionalError, ValidationError, AdapterContextError, ExecutionSliceError) as exc:
            # A failed close never changes the tool's result. The open run is
            # intentionally visible to Continuum reconciliation/findings.
            logger.warning("continuum could not close run for %s: %s", tool.name, exc)
        except Exception:
            logger.exception("continuum outcome recording failed for %s", tool.name)

    def _event_by_request(self, request_id: str):
        return next((e for e in reversed(self.kernel.events(self.ledger_branch)) if e.request_id == request_id), None)

    def _continuation_anchor(self, refs: _CallRefs, actor: str, office: str):
        events = self.kernel.events(self.ledger_branch)
        run = next((e for e in reversed(events) if e.request_id == refs.run_request_id), None)
        if run is None:
            return None
        if run.actor == actor and run.office == office:
            return next((e for e in reversed(events) if e.subject == refs.run_subject and e.kind == "run.resume" and e.actor == actor and e.office == office), run)
        return next((e for e in reversed(events) if e.subject == refs.run_subject and e.kind == "run.takeover" and e.actor == actor and e.office == office), None)

    def _recover_open_call(self, refs: _CallRefs, actor: str | None = None, office: str | None = None) -> _OpenCall | None:
        events = self.kernel.events(self.ledger_branch)
        intent = next((e for e in reversed(events) if e.request_id == refs.intent_request_id), None)
        run = next((e for e in reversed(events) if e.request_id == refs.run_request_id), None)
        if (
            intent is None
            or run is None
            or run.kind != "run.start"
            or run.subject != refs.run_subject
            or intent.id not in run.causes
            or run.actor != intent.actor
            or run.office != intent.office
        ):
            return None
        close_actor = actor or run.actor
        close_office = office or run.office
        continuation = next((e for e in reversed(events) if e.request_id == refs.resume_request_id and e.subject == refs.run_subject and e.actor == close_actor and e.office == close_office), None)
        if continuation is None and (close_actor != run.actor or close_office != run.office):
            continuation = next((e for e in reversed(events) if e.subject == refs.run_subject and e.kind == "run.takeover" and e.actor == close_actor and e.office == close_office), None)
        if continuation is None and (close_actor != run.actor or close_office != run.office):
            return None
        cause = continuation or run
        return _OpenCall(
            intent_event_id=intent.id,
            intent_authority_ref=intent.authority_ref,
            run_event_id=cause.id,
            run_subject=run.subject,
            run_ref=refs.run_ref,
            started_at=run.recorded_at,
            actor=close_actor,
            office=close_office,
            runtime=str(run.payload.get("runtime") or self.runtime_name),
            revision_ref=str(run.payload.get("revision_ref") or self.revision_ref),
            tool_name=str(run.payload.get("tool") or intent.payload.get("tool") or "unknown"),
        )

    def _outcome_exists(self, refs: _CallRefs) -> bool:
        return any(e.request_id == refs.outcome_request_id for e in self.kernel.events(self.ledger_branch))

    def _public_reason(self, exc: Exception) -> str:
        if isinstance(exc, MappingError):
            return str(exc)
        if isinstance(exc, (AdapterContextError, ExecutionSliceError)):
            return str(exc)
        if isinstance(exc, ValidationError):
            return "institutional request was invalid"
        return "institutional authority denied"

    def _resolve_execution_slice(self, context: Any, tool_name: str, projection: ActProjection) -> dict[str, Any]:
        value = self.execution_slice(context)
        validate_execution_slice(value, require_seal=True)
        if not verify_execution_slice_seal(value):
            raise ExecutionSliceError("ExecutionSlice content seal mismatch")
        capability = value["capability"]
        if capability["tool_name"] != tool_name:
            raise ExecutionSliceError("ExecutionSlice tool_name does not match executing tool")
        if capability["kind"] != projection.kind or capability["subject"] != projection.subject:
            raise ExecutionSliceError("ExecutionSlice capability projection does not match Process mapping")
        resolved_office = self.office(context)
        resolved_actor = self.actor(context)
        if str(resolved_office) != str(value["principal"]["office"]):
            raise ExecutionSliceError("ExecutionSlice office does not match ADK office resolver")
        if str(resolved_actor) != str(value["principal"]["actor"]):
            raise ExecutionSliceError("ExecutionSlice actor does not match ADK actor resolver")
        return dict(value)

    def _call_refs(self, context: Any, tool_name: str) -> _CallRefs:
        value = self.execution_slice(context)
        validate_execution_slice(value, require_seal=True)
        if not verify_execution_slice_seal(value):
            raise ExecutionSliceError("ExecutionSlice content seal mismatch")
        if value["capability"]["tool_name"] != tool_name:
            raise ExecutionSliceError("ExecutionSlice tool_name does not match executing tool")
        refs = execution_refs_from_slice(value)
        return _CallRefs(
            digest=refs.digest,
            run_ref=refs.run_ref,
            run_subject=refs.run_subject,
            intent_request_id=refs.intent_request_id,
            run_request_id=refs.run_request_id,
            resume_request_id=refs.resume_request_id,
            outcome_request_id=refs.outcome_request_id,
        )

    def _render_refusal(self, tool_name: str, reason: str, office: str, actor: str, projection: ActProjection | None) -> dict[str, Any]:
        fallback = projection or ActProjection(kind="tool.invoke.invalid", subject=f"tool:{kindify(tool_name)}")
        return self.refusal.render(reason=reason, office=office, actor=actor, projection=fallback, tool_name=tool_name)
