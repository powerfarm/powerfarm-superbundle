from __future__ import annotations

from powerfarm.projection import parse_time
from powerfarm.validation import scope_contains

from .model import AuthorityScope, Delegation


def contains_scope(parent: AuthorityScope, child: AuthorityScope) -> bool:
    return scope_contains(parent.action, child.action) and scope_contains(parent.subject, child.subject)


def validate_delegation(parent: Delegation, child: Delegation) -> list[str]:
    """Check containment needed before non-root delegation can ever be admitted."""
    errors: list[str] = []
    if child.parent_grant_ref != parent.grant_ref:
        errors.append("child does not cite the parent grant")
    if child.grantor_office != parent.grantee_office:
        errors.append("delegator does not hold the parent grant")
    if not contains_scope(parent.scope, child.scope):
        errors.append("child scope exceeds parent scope")
    if parse_time(child.valid_from) < parse_time(parent.valid_from):
        errors.append("child begins before parent authority")
    if parent.valid_until is not None:
        if child.valid_until is None:
            errors.append("child outlives bounded parent authority")
        elif parse_time(child.valid_until) > parse_time(parent.valid_until):
            errors.append("child outlives parent authority")
    if child.valid_until is not None and parse_time(child.valid_until) <= parse_time(child.valid_from):
        errors.append("child authority has a non-positive validity interval")
    return errors
