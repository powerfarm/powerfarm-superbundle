"""Engine-neutral admission controller used by the MAF function middleware."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Mapping

from powerfarm.core.time import utcnow
from powerfarm.execution_slice import (
    ExecutionSliceError,
    execution_refs_from_slice,
    slice_provenance,
    validate_execution_slice,
    verify_execution_slice_seal,
)
from powerfarm.kernel import InstitutionalError, Kernel
from powerfarm.runtime.receipt import RuntimeReceipt, receipt_to_act
from powerfarm.validation import ValidationError

from .evidence import context_provenance, digest_summary
from .mapping import ActProjection, DottedToolPolicy, MappingError, MappingPolicy, kindify
from .refusal import refusal

logger = logging.getLogger("continuum_maf")
DEFAULT_RUNTIME = "microsoft-agent-framework"


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


def _arguments(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    if hasattr(value, "model_dump") and callable(value.model_dump):
        dumped = value.model_dump(mode="python")
        if isinstance(dumped, Mapping):
            return dumped
    raise ExecutionSliceError("MAF function arguments must be a mapping or Pydantic model")


class ContinuumFunctionController:
    """Owns institutional semantics while MAF owns function invocation mechanics."""

    def __init__(
        self,
        *,
        kernel: Kernel,
        policy: MappingPolicy | None = None,
        ledger_branch: str = "main",
        runtime_name: str = DEFAULT_RUNTIME,
        revision_ref: str,
        strict: bool = True,
    ) -> None:
        if strict and policy is None:
            raise ValueError("strict Microsoft Agent Framework Setting requires an explicit tool mapping policy")
        if strict and isinstance(policy, DottedToolPolicy) and not policy.strict:
            raise ValueError("strict Microsoft Agent Framework Setting requires DottedToolPolicy(strict=True)")
        if strict and (not revision_ref or revision_ref == "unspecified"):
            raise ValueError("strict Microsoft Agent Framework Setting requires a concrete revision_ref")
        self.kernel = kernel
        self.policy = policy or DottedToolPolicy(strict=False)
        self.ledger_branch = ledger_branch
        self.runtime_name = runtime_name
        self.revision_ref = revision_ref
        self.strict = strict

    def resolve(self, *, tool_name: str, tool_args: Any, execution_slice: Mapping[str, Any]) -> tuple[ActProjection, dict[str, Any]]:
        args = _arguments(tool_args)
        projection = self.policy.project(tool_name, args)
        validate_execution_slice(execution_slice, require_seal=True)
        if not verify_execution_slice_seal(execution_slice):
            raise ExecutionSliceError("ExecutionSlice content seal mismatch")
        capability = execution_slice["capability"]
        if capability["tool_name"] != tool_name:
            raise ExecutionSliceError("ExecutionSlice tool_name does not match executing MAF tool")
        if capability["kind"] != projection.kind or capability["subject"] != projection.subject:
            raise ExecutionSliceError("ExecutionSlice capability projection does not match Process mapping")
        return projection, dict(execution_slice)

    async def admit(self, *, tool_name: str, tool_args: Any, execution_slice: Mapping[str, Any], context: Any) -> dict[str, Any] | None:
        office = "unknown"
        actor = "unknown"
        projection: ActProjection | None = None
        try:
            projection, value = self.resolve(tool_name=tool_name, tool_args=tool_args, execution_slice=execution_slice)
            office = str(value["principal"]["office"])
            actor = str(value["principal"]["actor"])
            refs = execution_refs_from_slice(value)
            if await asyncio.to_thread(self._outcome_exists, refs.outcome_request_id):
                return refusal(code="POWERFARM_ALREADY_COMPLETED", reason="institutional run already completed", tool_name=tool_name, office=office)

            existing_run = await asyncio.to_thread(self._event_by_request, refs.run_request_id)
            if existing_run is not None:
                current_beat = value["circulation"]["beat_ref"]
                if str(existing_run.payload.get("beat_ref") or "") == str(current_beat):
                    return refusal(code="POWERFARM_ALREADY_IN_FLIGHT", reason="same Heartime beat is already admitted", tool_name=tool_name, office=office)
                anchor = await asyncio.to_thread(self._continuation_anchor, refs, actor, office)
                if anchor is None:
                    return refusal(code="POWERFARM_TAKEOVER_REQUIRED", reason="successor occupancy requires Process takeover", tool_name=tool_name, office=office)
                await asyncio.to_thread(
                    self.kernel.append,
                    branch=self.ledger_branch,
                    actor=actor,
                    office=office,
                    kind="run.resume",
                    subject=refs.run_subject,
                    payload={
                        "card_ref": value["card"]["ref"],
                        "beat_ref": value["circulation"]["beat_ref"],
                        "attempt_ref": value["circulation"]["attempt_ref"],
                        "execution_slice_sha256": value["slice_sha256"],
                    },
                    causes=[anchor.id],
                    request_id=refs.resume_request_id,
                )
                return None

            provenance = {**context_provenance(context), **slice_provenance(value)}
            intent_payload = {
                "tool": tool_name,
                "arguments": digest_summary(_arguments(tool_args)),
                "runtime": self.runtime_name,
                "revision_ref": self.revision_ref,
                "provenance": provenance,
            }
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
                            "tool": tool_name,
                            "owner_office": office,
                            "call_ref": refs.digest,
                            "direction_ref": value["institutional"].get("direction_ref"),
                            "effective_capability_set_sha256": value["institutional"].get("ecs_sha256"),
                            "card_ref": value["card"]["ref"],
                            "beat_ref": value["circulation"]["beat_ref"],
                            "attempt_ref": value["circulation"]["attempt_ref"],
                            "execution_slice_sha256": value["slice_sha256"],
                        },
                        "causes": ["@intent"],
                        "request_id": refs.run_request_id,
                    },
                ],
                branch=self.ledger_branch,
            )
            return None
        except (InstitutionalError, ValidationError, MappingError, ExecutionSliceError) as exc:
            logger.info("continuum refused MAF tool %s: %s", tool_name, exc)
            code = "POWERFARM_CONTEXT_INVALID" if isinstance(exc, (MappingError, ExecutionSliceError, ValidationError)) else "POWERFARM_DENIED"
            return refusal(code=code, reason=self._public_reason(exc), tool_name=tool_name, office=office)
        except Exception:
            logger.exception("continuum admission infrastructure failed for MAF tool %s", tool_name)
            return refusal(code="POWERFARM_ADMISSION_FAILED", reason="admission check failed", tool_name=tool_name, office=office)

    async def close(self, *, tool_name: str, execution_slice: Mapping[str, Any], context: Any, result: Any = None, error: Exception | None = None) -> None:
        try:
            validate_execution_slice(execution_slice, require_seal=True)
            if not verify_execution_slice_seal(execution_slice):
                raise ExecutionSliceError("ExecutionSlice content seal mismatch")
            refs = execution_refs_from_slice(execution_slice)
            if await asyncio.to_thread(self._outcome_exists, refs.outcome_request_id):
                return
            actor = str(execution_slice["principal"]["actor"])
            office = str(execution_slice["principal"]["office"])
            open_call = await asyncio.to_thread(self._recover_open_call, refs, actor, office)
            if open_call is None:
                logger.warning("continuum could not recover an admitted MAF run for %s", tool_name)
                return
            output_evidence = digest_summary(result) if error is None else None
            error_evidence = None if error is None else {
                "type": f"{type(error).__module__}.{type(error).__qualname__}",
                "message_sha256": __import__("hashlib").sha256(str(error).encode("utf-8", "replace")).hexdigest(),
            }
            provenance = {**context_provenance(context), **slice_provenance(execution_slice)}
            receipt = RuntimeReceipt(
                runtime=open_call.runtime,
                run_ref=open_call.run_ref,
                status="completed" if error is None else "failed",
                capability_ref=f"tool:{open_call.tool_name}",
                revision_ref=open_call.revision_ref,
                authority_ref=open_call.intent_authority_ref,
                started_at=open_call.started_at,
                finished_at=utcnow(),
                output=output_evidence,
                error=error_evidence,
                usage={},
                provenance=provenance,
            )
            act = receipt_to_act(receipt, subject=open_call.run_subject)
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
        except (InstitutionalError, ValidationError, ExecutionSliceError) as exc:
            logger.warning("continuum could not close MAF run for %s: %s", tool_name, exc)
        except Exception:
            logger.exception("continuum outcome recording failed for MAF tool %s", tool_name)

    def runtime_kwargs(self, execution_slice: Mapping[str, Any], authority_ref: str | None = None) -> dict[str, Any]:
        refs = execution_refs_from_slice(execution_slice)
        return {
            "powerfarm_run_ref": refs.run_ref,
            "powerfarm_authority_ref": authority_ref or execution_slice["institutional"].get("authority_ref"),
            "powerfarm_card_ref": execution_slice["card"]["ref"],
            "powerfarm_beat_ref": execution_slice["circulation"]["beat_ref"],
            "powerfarm_attempt_ref": execution_slice["circulation"]["attempt_ref"],
            "powerfarm_engine_revision_ref": self.revision_ref,
            "powerfarm_resource_budget": execution_slice["resources"],
        }

    def _event_by_request(self, request_id: str):
        return next((e for e in reversed(self.kernel.events(self.ledger_branch)) if e.request_id == request_id), None)

    def _outcome_exists(self, request_id: str) -> bool:
        return any(e.request_id == request_id for e in self.kernel.events(self.ledger_branch))

    def _continuation_anchor(self, refs: Any, actor: str, office: str):
        events = self.kernel.events(self.ledger_branch)
        run = next((e for e in reversed(events) if e.request_id == refs.run_request_id), None)
        if run is None:
            return None
        if run.actor == actor and run.office == office:
            return next((e for e in reversed(events) if e.subject == refs.run_subject and e.kind == "run.resume" and e.actor == actor and e.office == office), run)
        return next((e for e in reversed(events) if e.subject == refs.run_subject and e.kind == "run.takeover" and e.actor == actor and e.office == office), None)

    def _recover_open_call(self, refs: Any, actor: str, office: str) -> _OpenCall | None:
        events = self.kernel.events(self.ledger_branch)
        intent = next((e for e in reversed(events) if e.request_id == refs.intent_request_id), None)
        run = next((e for e in reversed(events) if e.request_id == refs.run_request_id), None)
        if intent is None or run is None or run.kind != "run.start" or run.subject != refs.run_subject or intent.id not in run.causes:
            return None
        continuation = next((e for e in reversed(events) if e.request_id == refs.resume_request_id and e.subject == refs.run_subject and e.actor == actor and e.office == office), None)
        if continuation is None and (actor != run.actor or office != run.office):
            continuation = next((e for e in reversed(events) if e.subject == refs.run_subject and e.kind == "run.takeover" and e.actor == actor and e.office == office), None)
        if continuation is None and (actor != run.actor or office != run.office):
            return None
        cause = continuation or run
        return _OpenCall(
            intent_event_id=intent.id,
            intent_authority_ref=intent.authority_ref,
            run_event_id=cause.id,
            run_subject=run.subject,
            run_ref=refs.run_ref,
            started_at=run.recorded_at,
            actor=actor,
            office=office,
            runtime=str(run.payload.get("runtime") or self.runtime_name),
            revision_ref=str(run.payload.get("revision_ref") or self.revision_ref),
            tool_name=str(run.payload.get("tool") or intent.payload.get("tool") or "unknown"),
        )

    def _public_reason(self, exc: Exception) -> str:
        if isinstance(exc, MappingError):
            return str(exc)
        if isinstance(exc, ExecutionSliceError):
            return str(exc)
        if isinstance(exc, ValidationError):
            return "institutional request was invalid"
        return "institutional authority denied"


__all__ = ["ContinuumFunctionController", "DEFAULT_RUNTIME"]
