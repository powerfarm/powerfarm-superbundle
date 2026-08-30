from __future__ import annotations

from typing import Any


def validate_branch_graph(branches: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    by_id = {str(item.get("id")): item for item in branches}
    if len(by_id) != len(branches):
        errors.append("duplicate branch id")
    if "main" not in by_id:
        errors.append("main branch missing")
    for branch_id, branch in by_id.items():
        parent = branch.get("parent_id")
        if parent is not None and str(parent) not in by_id:
            errors.append(f"{branch_id}: parent does not exist")
        if parent == branch_id:
            errors.append(f"{branch_id}: self-parent")
    for start in by_id:
        seen: set[str] = set()
        cursor: str | None = start
        while cursor is not None:
            if cursor in seen:
                errors.append(f"branch cycle includes {cursor}")
                break
            seen.add(cursor)
            row = by_id.get(cursor)
            if row is None:
                break
            parent = row.get("parent_id")
            cursor = str(parent) if parent is not None else None
    return sorted(set(errors))


def branch_order(branches: list[dict[str, Any]]) -> list[str]:
    errors = validate_branch_graph(branches)
    if errors:
        raise ValueError("; ".join(errors))
    by_id = {str(item["id"]): item for item in branches}
    depth: dict[str, int] = {}

    def get_depth(branch_id: str) -> int:
        if branch_id in depth:
            return depth[branch_id]
        parent = by_id[branch_id].get("parent_id")
        depth[branch_id] = 0 if parent is None else get_depth(str(parent)) + 1
        return depth[branch_id]

    return sorted(by_id, key=lambda bid: (get_depth(bid), bid))
