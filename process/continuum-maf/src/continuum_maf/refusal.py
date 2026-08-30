"""Model-visible refusal values for MAF function middleware."""

from __future__ import annotations


def refusal(*, code: str, reason: str, tool_name: str, office: str = "unknown") -> dict[str, str]:
    return {
        "status": "refused",
        "refused_by": "continuum",
        "code": code,
        "reason": reason,
        "tool": tool_name,
        "office": office,
    }
