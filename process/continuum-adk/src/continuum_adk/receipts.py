"""Runtime receipts whose contents are already privacy-reduced evidence."""

from __future__ import annotations

from typing import Any

from powerfarm.core.time import utcnow
from powerfarm.runtime.receipt import RuntimeReceipt, receipt_to_act

COMPLETED = "completed"
FAILED = "failed"


def build_receipt(
    *,
    runtime: str,
    revision_ref: str,
    run_ref: str,
    status: str,
    tool_name: str,
    authority_ref: str,
    started_at: str,
    output_evidence: dict[str, Any] | None = None,
    error_evidence: dict[str, Any] | None = None,
    provenance: dict[str, Any] | None = None,
) -> RuntimeReceipt:
    return RuntimeReceipt(
        runtime=runtime,
        run_ref=run_ref,
        status=status,
        capability_ref=f"tool:{tool_name}",
        revision_ref=revision_ref,
        authority_ref=authority_ref,
        started_at=started_at,
        finished_at=utcnow(),
        output=output_evidence,
        error=error_evidence,
        usage={},
        provenance=provenance or {},
    )


def outcome_act(receipt: RuntimeReceipt, *, run_subject: str) -> dict[str, Any]:
    return receipt_to_act(receipt, subject=run_subject)
