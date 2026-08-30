"""Authority scope reasoning independent from storage."""

from .model import AuthorityScope, Delegation
from .delegation import contains_scope, validate_delegation

__all__ = ["AuthorityScope", "Delegation", "contains_scope", "validate_delegation"]
