from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AuthorityScope:
    action: str
    subject: str


@dataclass(frozen=True)
class Delegation:
    grant_ref: str
    grantor_office: str
    grantee_office: str
    scope: AuthorityScope
    valid_from: str
    valid_until: str | None = None
    parent_grant_ref: str | None = None
