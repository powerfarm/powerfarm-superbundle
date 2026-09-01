# ADR 0015: Delegated Authority is a required incomplete capability

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** accepted

## Decision

Authority grant and revoke remain reserved to the root Office in the current
implementation. This is a **temporary safety envelope**, not the final v1
semantics, and the canon is **not** amended to remove delegation.

```text
CURRENT IMPLEMENTATION:  root-only
REQUIRED TARGET:         Authority may descend only by narrowing
CONFORMANCE:             NOT YET SATISFIED
```

Delegation is classified as a **required incomplete capability**, which is
distinct from both of the usual ways of deferring work:

| Class | Meaning |
| --- | --- |
| optional backlog | would be nice later |
| known debt | not ready yet |
| **required incomplete capability** | **the institution is not finished until this exists** |

Delegation is the third. It carries a named milestone, executable negative
controls, and a blocking readiness-gate line. It is not a `TODO` that survives
into an archaeological dig.

## Why the canon is not amended

The temptation is to make canon and implementation agree by deleting the harder
of the two. That would let a temporary implementation limitation rewrite the
theory.

If an institution's Offices are occupied by intelligences capable of holding
responsibility, and only root may ever grant Authority, the architecture is far
more centralised than the theory it claims to implement, and root becomes a
structural bottleneck. That consequence should be visible, not resolved by
editing the sentence that describes it.

## What must be built and proved

Delegation is satisfied only when all of the following are executable negative
controls, not prose:

1. **Strict subset / containment.** A grant may issue only a subset of what the
   granter holds, in action, subject and time.
2. **No privilege amplification.** No sequence of delegations yields authority the
   root chain never held.
3. **Complete delegation-chain provenance.** Every delegated grant resolves to
   root through a recorded chain.
4. **Ancestor revocation propagation.** Revoking a grant invalidates everything
   descended from it.
5. **Occupancy replacement invalidation.** Replacing the occupant of a delegating
   Office does not silently carry its delegations forward.
6. **Temporal validity across the chain.** A descendant's window cannot exceed its
   ancestor's, at any depth — consistent with
   [ADR 0013](./0013-authority-is-valid-where-it-is-consumed.md), authority is
   checked where it is consumed, along the whole chain.
7. **Recovery and replay preserve effective Authority.** Replaying the ledger
   reconstructs the same effective authority set, including revocations.
8. **Self-widening is refused.** A holder cannot grant itself more than it holds,
   directly or through an intermediary.
9. **A stale ancestor cannot authorize.** A grant whose ancestor has expired or
   been revoked authorizes nothing, even if the descendant's own window is open.

Containment logic exists in the repository and is tested in isolation. It is
**not** integrated into the kernel, and this ADR does not integrate it in the
current repair pass.

## Readiness gate

The following line is blocking:

```text
[ ] Delegated Authority descends and narrows,
    or an explicit constitutional decision has been made
    to reject that property permanently.
```

Rejecting the property permanently is a legitimate outcome. Forgetting the
question is not.

---

Copyright © 2026 PowerFarm. All rights reserved.
