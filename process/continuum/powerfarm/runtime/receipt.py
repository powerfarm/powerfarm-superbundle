from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from powerfarm.core.canonical import sha256_json
from powerfarm.core.time import utcnow

RECEIPT_FORMAT = "powerfarm.runtime-receipt/v1"


@dataclass(frozen=True)
class RuntimeReceipt:
    runtime: str
    run_ref: str
    status: str
    capability_ref: str
    revision_ref: str
    authority_ref: str
    started_at: str
    finished_at: str | None
    output: dict[str, Any] | None
    error: dict[str, Any] | None
    usage: dict[str, Any]
    provenance: dict[str, Any]

    def statement(self) -> dict[str, Any]:
        return {
            "format": RECEIPT_FORMAT,
            "runtime": self.runtime,
            "run_ref": self.run_ref,
            "status": self.status,
            "capability_ref": self.capability_ref,
            "revision_ref": self.revision_ref,
            "authority_ref": self.authority_ref,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "output": self.output,
            "error": self.error,
            "usage": self.usage,
            "provenance": self.provenance,
        }

    def digest(self) -> str:
        return sha256_json(self.statement())


def receipt_to_act(receipt: RuntimeReceipt, *, subject: str | None = None) -> dict[str, Any]:
    if receipt.status not in {"completed", "failed", "cancelled", "waiting_input", "running"}:
        raise ValueError("unsupported runtime status")
    if receipt.status == "completed":
        kind = "run.finish"
    elif receipt.status == "failed":
        kind = "run.fail"
    else:
        kind = "runtime.report"
    return {
        "kind": kind,
        "subject": subject or f"run:{receipt.run_ref}",
        "payload": {
            "receipt_format": RECEIPT_FORMAT,
            "receipt_digest": receipt.digest(),
            "runtime": receipt.runtime,
            "status": receipt.status,
            "capability_ref": receipt.capability_ref,
            "revision_ref": receipt.revision_ref,
            "output": receipt.output,
            "error": receipt.error,
            "usage": receipt.usage,
            "provenance": receipt.provenance,
        },
    }
