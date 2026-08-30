from __future__ import annotations

from typing import Any

from powerfarm.runtime.receipt import RuntimeReceipt


def run_row_to_receipt(row: dict[str, Any], *, runtime: str = "supabase/adk") -> RuntimeReceipt:
    """Normalize an existing Powerfarm `runs` row into a runtime receipt.

    This is intentionally a read-side adapter. It does not grant legitimacy to
    the row; Continuum admission still requires an authorized institutional act.
    """
    status = str(row["status"])
    mapped = "completed" if status in {"completed", "succeeded"} else status
    if mapped not in {"created", "running", "waiting_input", "completed", "failed", "cancelled"}:
        raise ValueError(f"unknown Powerfarm run status {status}")
    return RuntimeReceipt(
        runtime=runtime,
        run_ref=str(row["id"]),
        status="running" if mapped == "created" else mapped,
        capability_ref=str(row.get("capability_ref") or "unbound"),
        revision_ref=f"{row.get('gadget_id') or 'unknown'}@{row.get('gadget_version') or 'unknown'}",
        authority_ref=str(row.get("run_grant_id") or "unbound"),
        started_at=str(row["started_at"]),
        finished_at=str(row["ended_at"]) if row.get("ended_at") is not None else None,
        output=row.get("result") if isinstance(row.get("result"), dict) else None,
        error=row.get("error") if isinstance(row.get("error"), dict) else None,
        usage={},
        provenance={
            "workspace_id": row.get("workspace_id"),
            "engine": row.get("engine"),
            "engine_ref": row.get("engine_ref"),
            "definition_hash": row.get("definition_hash"),
            "authority_version": row.get("authority_version"),
        },
    )
