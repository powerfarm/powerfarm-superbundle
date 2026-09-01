"""Engine-neutral PowerFarm Card execution projection for Google ADK.

The execution slice is produced from a canonical Card before an engine is
selected. Engine-local invocation/session identifiers are provenance only and
must never become the institutional identity of the run.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, Mapping, Protocol, runtime_checkable

from powerfarm.core.time import parse_utc

EXECUTION_SLICE_CONTRACT_VERSION = "powerfarm.execution-slice.v4"
_PF_REF = re.compile(r"^pf(?:\.[a-z0-9][a-z0-9-]*)+$")


class ExecutionSliceError(ValueError):
    """An execution slice is malformed, stale, or inconsistent."""


@runtime_checkable
class ExecutionSliceResolver(Protocol):
    def __call__(
        self,
        context: Any,
        *,
        tool_name: str,
        kind: str,
        subject: str,
    ) -> Mapping[str, Any]: ...


class ExecutionSliceFromContext:
    """Read a canonical slice from invocation metadata or a legacy context attribute.

    Google ADK exposes ``RunConfig.custom_metadata`` on every ToolContext. That
    is the production transport: it is scoped to one Runner invocation rather
    than stored as engine session state. The attribute fallback keeps direct
    adapter/conformance contexts usable without pretending ADK mints identity.
    """

    def __init__(self, attribute: str = "powerfarm_execution_slice") -> None:
        self.attribute = attribute

    def __call__(
        self,
        context: Any,
        *,
        tool_name: str,
        kind: str,
        subject: str,
    ) -> Mapping[str, Any]:
        metadata = getattr(context, "custom_metadata", None)
        value = metadata.get(self.attribute) if isinstance(metadata, Mapping) else None
        if value is None:
            value = getattr(context, self.attribute, None)
        if not isinstance(value, Mapping):
            raise ExecutionSliceError(
                f"ADK invocation metadata is missing {self.attribute}"
            )
        validate_execution_slice(value, require_seal=True)
        if not verify_execution_slice_seal(value):
            raise ExecutionSliceError("ExecutionSlice content seal mismatch")
        capability = value["capability"]
        if (
            capability["tool_name"] != tool_name
            or capability["kind"] != kind
            or capability["subject"] != subject
        ):
            raise ExecutionSliceError(
                "ExecutionSlice capability does not match requested Process act"
            )
        return value


@dataclass(frozen=True)
class ExecutionRefs:
    digest: str
    run_ref: str
    run_subject: str
    intent_request_id: str
    run_request_id: str
    resume_request_id: str
    outcome_request_id: str


def _plain(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ExecutionSliceError(f"{label} must be an object")
    return value


def _exact(value: Any, allowed: set[str], label: str) -> Mapping[str, Any]:
    obj = _plain(value, label)
    unknown = set(obj) - allowed
    if unknown:
        raise ExecutionSliceError(f"{label} contains unsupported field: {sorted(unknown)[0]}")
    return obj


def _nonempty(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ExecutionSliceError(f"{label} must be a non-empty string")
    return value


def _pf_ref(value: Any, label: str) -> str:
    text = _nonempty(value, label)
    if not _PF_REF.fullmatch(text):
        raise ExecutionSliceError(f"{label} must be a pf.* reference")
    return text


def _sha(value: Any, label: str) -> str:
    text = _nonempty(value, label)
    if not text.startswith("sha256:") or len(text) != 71 or any(c not in "0123456789abcdef" for c in text[7:]):
        raise ExecutionSliceError(f"{label} must be a sha256: reference")
    return text


def _timestamp(value: Any, label: str):
    text = _nonempty(value, label)
    try:
        return parse_utc(text)
    except (TypeError, ValueError) as exc:
        raise ExecutionSliceError(f"{label} must be an ISO timestamp with timezone") from exc


def _authorization_window(value: Any, label: str) -> Mapping[str, Any]:
    window = _exact(value, {"authorization_ref", "effective_at", "expires_at"}, label)
    _nonempty(window.get("authorization_ref"), f"{label}.authorization_ref")
    effective = _timestamp(window.get("effective_at"), f"{label}.effective_at")
    expires_value = window.get("expires_at")
    if expires_value is not None:
        expires = _timestamp(expires_value, f"{label}.expires_at")
        if expires <= effective:
            raise ExecutionSliceError(f"{label}.expires_at must follow effective_at")
    return window


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _unsealed(value: Mapping[str, Any]) -> dict[str, Any]:
    out = json.loads(_canonical(value))
    out.pop("slice_sha256", None)
    return out


def validate_execution_slice(slice_value: Mapping[str, Any], *, require_seal: bool = False) -> Mapping[str, Any]:
    root = _exact(slice_value, {
        "contract_version", "card", "principal", "institutional", "circulation", "capability", "resources", "slice_sha256"
    }, "ExecutionSlice")
    if root.get("contract_version") != EXECUTION_SLICE_CONTRACT_VERSION:
        raise ExecutionSliceError(f"unsupported ExecutionSlice contract: {root.get('contract_version')}")

    card = _exact(root.get("card"), {"ref", "generation", "revision", "content_sha256"}, "ExecutionSlice.card")
    _pf_ref(card.get("ref"), "ExecutionSlice.card.ref")
    for field in ("generation", "revision"):
        value = card.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise ExecutionSliceError(f"ExecutionSlice.card.{field} must be positive")
    _sha(card.get("content_sha256"), "ExecutionSlice.card.content_sha256")

    principal = _exact(root.get("principal"), {"actor", "office"}, "ExecutionSlice.principal")
    _nonempty(principal.get("actor"), "ExecutionSlice.principal.actor")
    _nonempty(principal.get("office"), "ExecutionSlice.principal.office")

    institutional = _exact(root.get("institutional"), {
        "identity_ref", "office_ref", "occupancy_ref", "direction_ref", "responsibility_ref",
        "authority_ref", "run_ref", "run_grant_ref", "ecs_sha256",
    }, "ExecutionSlice.institutional")
    for field in ("identity_ref", "office_ref", "occupancy_ref"):
        _pf_ref(institutional.get(field), f"ExecutionSlice.institutional.{field}")
    for field in ("direction_ref", "responsibility_ref"):
        if institutional.get(field) is not None:
            _pf_ref(institutional.get(field), f"ExecutionSlice.institutional.{field}")
    for field in ("authority_ref", "run_ref", "run_grant_ref"):
        if institutional.get(field) is not None:
            _nonempty(institutional.get(field), f"ExecutionSlice.institutional.{field}")
    ecs = institutional.get("ecs_sha256")
    if ecs is not None:
        text = _nonempty(ecs, "ExecutionSlice.institutional.ecs_sha256")
        bare = text[7:] if text.startswith("sha256:") else text
        if len(bare) != 64 or any(c not in "0123456789abcdef" for c in bare):
            raise ExecutionSliceError("ExecutionSlice.institutional.ecs_sha256 must be a SHA-256 digest")

    circulation = _exact(root.get("circulation"), {"beat_ref", "attempt_ref"}, "ExecutionSlice.circulation")
    _pf_ref(circulation.get("beat_ref"), "ExecutionSlice.circulation.beat_ref")
    _pf_ref(circulation.get("attempt_ref"), "ExecutionSlice.circulation.attempt_ref")

    capability = _exact(root.get("capability"), {"tool_name", "kind", "subject"}, "ExecutionSlice.capability")
    for field in ("tool_name", "kind", "subject"):
        _nonempty(capability.get(field), f"ExecutionSlice.capability.{field}")

    resources = _exact(root.get("resources"), {"evaluated_at", "authorization_window", "energy_remaining", "cost"}, "ExecutionSlice.resources")
    _timestamp(resources.get("evaluated_at"), "ExecutionSlice.resources.evaluated_at")
    windows = _exact(resources.get("authorization_window"), {"energy", "cost"}, "ExecutionSlice.resources.authorization_window")
    _authorization_window(windows.get("energy"), "ExecutionSlice.resources.authorization_window.energy")
    _authorization_window(windows.get("cost"), "ExecutionSlice.resources.authorization_window.cost")
    meters = {"beats", "model_tokens", "tool_calls", "network_calls", "compute_ms", "sandbox_ms", "wall_ms", "human_attention_ms"}
    energy = _exact(resources.get("energy_remaining"), meters, "ExecutionSlice.resources.energy_remaining")
    for field in meters:
        value = energy.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ExecutionSliceError(f"ExecutionSlice.resources.energy_remaining.{field} must be a non-negative integer")
    cost = _exact(resources.get("cost"), {"currency", "remaining_micros"}, "ExecutionSlice.resources.cost")
    currency = cost.get("currency")
    if not isinstance(currency, str) or len(currency) != 3 or currency.upper() != currency:
        raise ExecutionSliceError("ExecutionSlice.resources.cost.currency must be a three-letter uppercase code")
    remaining = cost.get("remaining_micros")
    if not isinstance(remaining, int) or isinstance(remaining, bool) or remaining < 0:
        raise ExecutionSliceError("ExecutionSlice.resources.cost.remaining_micros must be a non-negative integer")

    if root.get("slice_sha256") is not None:
        _sha(root.get("slice_sha256"), "ExecutionSlice.slice_sha256")
    if require_seal and root.get("slice_sha256") is None:
        raise ExecutionSliceError("ExecutionSlice must be content-addressed")
    return slice_value


def verify_execution_slice_seal(slice_value: Mapping[str, Any]) -> bool:
    validate_execution_slice(slice_value, require_seal=True)
    digest = hashlib.sha256(_canonical(_unsealed(slice_value)).encode("utf-8")).hexdigest()
    return slice_value["slice_sha256"] == f"sha256:{digest}"


def assert_execution_slice_temporally_executable(
    slice_value: Mapping[str, Any], *, at: str
) -> Mapping[str, Any]:
    validate_execution_slice(slice_value, require_seal=True)
    current = _timestamp(at, "ExecutionSlice execution at")
    evaluated = _timestamp(
        slice_value["resources"]["evaluated_at"],
        "ExecutionSlice.resources.evaluated_at",
    )
    if current < evaluated:
        raise ExecutionSliceError(
            "ExecutionSlice resource budget was evaluated after execution time"
        )
    for resource in ("energy", "cost"):
        window = slice_value["resources"]["authorization_window"][resource]
        effective = _timestamp(window["effective_at"], f"{resource} authorization effective_at")
        if current < effective:
            raise ExecutionSliceError(
                f"{resource} authorization is not effective at execution time"
            )
        expires_value = window.get("expires_at")
        if expires_value is not None and current >= _timestamp(
            expires_value, f"{resource} authorization expires_at"
        ):
            raise ExecutionSliceError(f"{resource} authorization expired before execution")
    return slice_value


def execution_refs_from_slice(slice_value: Mapping[str, Any]) -> ExecutionRefs:
    validate_execution_slice(slice_value, require_seal=True)
    if not verify_execution_slice_seal(slice_value):
        raise ExecutionSliceError("ExecutionSlice content seal mismatch")
    material = {
        "v": 2,
        "card_ref": slice_value["card"]["ref"],
        "card_generation": slice_value["card"]["generation"],
        "attempt_ref": slice_value["circulation"]["attempt_ref"],
        "tool_name": slice_value["capability"]["tool_name"],
        "kind": slice_value["capability"]["kind"],
        "subject": slice_value["capability"]["subject"],
    }
    digest = hashlib.sha256(_canonical(material).encode("utf-8")).hexdigest()
    derived_run_ref = f"pfx-{digest[:32]}"
    supplied = slice_value["institutional"].get("run_ref")
    if supplied is not None and supplied != derived_run_ref:
        raise ExecutionSliceError(
            f"ExecutionSlice run_ref {supplied} does not match engine-neutral execution identity {derived_run_ref}"
        )
    prefix = f"pfx2-{digest}"
    resume_material = {
        "v": 1,
        "run_ref": derived_run_ref,
        "beat_ref": slice_value["circulation"]["beat_ref"],
        "attempt_ref": slice_value["circulation"]["attempt_ref"],
    }
    resume_digest = hashlib.sha256(_canonical(resume_material).encode("utf-8")).hexdigest()
    return ExecutionRefs(
        digest=digest,
        run_ref=derived_run_ref,
        run_subject=f"run:{derived_run_ref}",
        intent_request_id=f"{prefix}-intent",
        run_request_id=f"{prefix}-run",
        resume_request_id=f"pfxr1-{resume_digest}",
        outcome_request_id=f"{prefix}-outcome",
    )


def slice_provenance(slice_value: Mapping[str, Any]) -> dict[str, Any]:
    validate_execution_slice(slice_value, require_seal=True)
    return {
        "card_ref": slice_value["card"]["ref"],
        "beat_ref": slice_value["circulation"]["beat_ref"],
        "attempt_ref": slice_value["circulation"]["attempt_ref"],
        "direction_ref": slice_value["institutional"].get("direction_ref"),
        "effective_capability_set_sha256": slice_value["institutional"].get("ecs_sha256"),
        "execution_slice_sha256": slice_value["slice_sha256"],
    }


__all__ = [
    "EXECUTION_SLICE_CONTRACT_VERSION", "ExecutionSliceError", "ExecutionSliceResolver",
    "ExecutionSliceFromContext", "ExecutionRefs", "validate_execution_slice",
    "verify_execution_slice_seal", "assert_execution_slice_temporally_executable",
    "execution_refs_from_slice", "slice_provenance",
]
