from __future__ import annotations

from collections import Counter
from typing import Any

from powerfarm.kernel import Kernel


def metrics(kernel: Kernel) -> dict[str, Any]:
    with kernel._read_snapshot():
        branches = kernel.branch_rows()
        rows = kernel.db.execute(
            "SELECT branch_id,kind,office,actor,recorded_at,effective_at FROM events ORDER BY seq"
        ).fetchall()
        kinds = Counter(str(row["kind"]) for row in rows)
        offices = Counter(str(row["office"]) for row in rows)
        actors = Counter(str(row["actor"]) for row in rows)
        max_local = kernel.db.execute(
            "SELECT coalesce(max(c),0) FROM (SELECT count(*) c FROM events GROUP BY branch_id)"
        ).fetchone()[0]
        signature_count = int(kernel.db.execute("SELECT count(*) FROM event_signatures").fetchone()[0])
        audit = kernel.audit()
        return {
            "institution_id": kernel._institution_id_locked(),
            "audit_ok": audit["ok"],
            "events": len(rows),
            "branches": len(branches),
            "event_signatures": signature_count,
            "signature_coverage": (signature_count / len(rows)) if rows else 0.0,
            "counterfactual_branches": sum(1 for row in branches if not row["canonical"]),
            "max_local_branch_events": int(max_local),
            "act_kinds": dict(kinds.most_common()),
            "offices": dict(offices.most_common()),
            "actors": dict(actors.most_common()),
            "first_recorded_at": str(rows[0]["recorded_at"]) if rows else None,
            "last_recorded_at": str(rows[-1]["recorded_at"]) if rows else None,
        }
