from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_HEX64 = set("0123456789abcdef")


def _hash(value: str, name: str) -> str:
    if len(value) != 64 or any(ch not in _HEX64 for ch in value):
        raise ValueError(f"{name} must be lowercase sha256 hex")
    return value


@dataclass(frozen=True)
class ExecutionEnvelope:
    version: str
    principal_ref: str
    workspace_ref: str
    capability_ref: str
    revision_ref: str
    revision_hash: str
    definition_hash: str
    operation: str
    run_grant_ref: str
    authority_version: int
    input: dict[str, Any]

    def public(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "principal_ref": self.principal_ref,
            "workspace_ref": self.workspace_ref,
            "capability_ref": self.capability_ref,
            "revision_ref": self.revision_ref,
            "revision_hash": self.revision_hash,
            "definition_hash": self.definition_hash,
            "operation": self.operation,
            "run_grant_ref": self.run_grant_ref,
            "authority_version": self.authority_version,
            "input": self.input,
        }


def validate_execution_envelope(value: dict[str, Any]) -> ExecutionEnvelope:
    version = str(value.get("envelope_version") or value.get("version") or "")
    if not version.startswith("powerfarm.execution/"):
        raise ValueError("unsupported execution envelope")
    authority_version = int(value.get("authority_version", 0))
    if authority_version < 1:
        raise ValueError("authority_version must be positive")
    input_value = value.get("input", {})
    if not isinstance(input_value, dict):
        raise ValueError("envelope input must be an object")
    return ExecutionEnvelope(
        version=version,
        principal_ref=str(value["principal_ref"]),
        workspace_ref=str(value["workspace_ref"]),
        capability_ref=str(value["capability_ref"]),
        revision_ref=f"{value['gadget_ref']}@{value['gadget_revision']}",
        revision_hash=_hash(str(value["gadget_revision_hash"]), "revision_hash"),
        definition_hash=_hash(str(value["gadget_definition_hash"]), "definition_hash"),
        operation=str(value["operation"]),
        run_grant_ref=str(value["run_grant_ref"]),
        authority_version=authority_version,
        input=input_value,
    )
