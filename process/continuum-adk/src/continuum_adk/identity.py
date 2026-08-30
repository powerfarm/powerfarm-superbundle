"""Who is acting, and under whose authority.

The hardest unsettled question in seating an institutional ledger under an
agent runtime is what an *office* means when the occupant is a process that
lives for ninety seconds. This module keeps that decision in the caller's
hands rather than baking one answer into the plugin.

Two resolvers are needed:

* ``OfficeResolver``  - which office is this act performed under?
* ``ActorResolver``   - which principal is performing it?

Continuum checks, at admission time, that the actor occupies the office and
that the office holds a grant covering the act. So the office must be a
*stable* institutional role that outlives any single agent process, and
occupancy must have been assigned by a prior admitted act. Resolvers that
invent an office per invocation will simply be refused, which is the correct
outcome rather than a bug.
"""

from __future__ import annotations

from typing import Any, Mapping, Protocol, runtime_checkable


@runtime_checkable
class OfficeResolver(Protocol):
    """Maps an ADK execution context to the office the act is performed under."""

    def __call__(self, context: Any) -> str: ...


@runtime_checkable
class ActorResolver(Protocol):
    """Maps an ADK execution context to the acting principal."""

    def __call__(self, context: Any) -> str: ...


class StaticOffice:
    """Every act from this runner is performed under one fixed office.

    Appropriate for a single-purpose deployment where the whole agent is the
    role. Occupancy must already have been assigned to the resolved actor.
    """

    def __init__(self, office: str) -> None:
        self.office = office

    def __call__(self, context: Any) -> str:  # noqa: D102
        return self.office


class OfficePerAgent:
    """Each ADK agent name maps to its own office.

    The usual shape for a multi-agent app: a `researcher` agent occupies the
    `research` office, a `deployer` agent occupies `ops`, and the grants
    differ. Unknown agent names fall back to ``default`` if one is given, and
    otherwise resolve to the agent name itself, which will be refused unless
    such an office actually exists.
    """

    def __init__(
        self,
        mapping: Mapping[str, str],
        *,
        default: str | None = None,
    ) -> None:
        self.mapping = dict(mapping)
        self.default = default

    def __call__(self, context: Any) -> str:  # noqa: D102
        agent_name = getattr(context, "agent_name", None) or "unknown"
        if agent_name in self.mapping:
            return self.mapping[agent_name]
        return self.default if self.default is not None else str(agent_name)


class StaticActor:
    """One fixed principal, e.g. a deployed agent identity."""

    def __init__(self, principal: str) -> None:
        self.principal = principal

    def __call__(self, context: Any) -> str:  # noqa: D102
        return self.principal


class ActorFromUser:
    """The end user is the principal; the agent acts in their name.

    Use when the agent is a tool wielded by a human and the institution should
    record the human as the actor. Note that this requires occupancy to have
    been assigned for each such user, which does not scale to open signup
    without an automated occupancy-assignment path.
    """

    def __init__(self, prefix: str = "user:") -> None:
        self.prefix = prefix

    def __call__(self, context: Any) -> str:  # noqa: D102
        user_id = getattr(context, "user_id", None) or "unknown"
        return f"{self.prefix}{user_id}"


class ActorFromAgent:
    """The agent itself is the principal, named by its ADK agent name."""

    def __init__(self, prefix: str = "agent:") -> None:
        self.prefix = prefix

    def __call__(self, context: Any) -> str:  # noqa: D102
        agent_name = getattr(context, "agent_name", None) or "unknown"
        return f"{self.prefix}{agent_name}"
