from __future__ import annotations

from typing import Any

from .merkle import merkle_root


def branch_merkle_roots(events: list[dict[str, Any]]) -> dict[str, str]:
    grouped: dict[str, list[tuple[int, str]]] = {}
    for event in events:
        grouped.setdefault(str(event["branch_id"]), []).append((int(event["branch_index"]), str(event["hash"])))
    return {
        branch: merkle_root([digest for _, digest in sorted(rows)])
        for branch, rows in sorted(grouped.items())
    }
