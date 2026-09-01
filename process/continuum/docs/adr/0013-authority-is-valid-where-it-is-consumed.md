# ADR 0013: Authority is valid where it is consumed

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** accepted

## Decision

> **Authority is valid where it is consumed.**

Authority must hold at the boundary of the consequence it authorizes. It is not
sufficient for it to have held at `recorded_at`, and it is not required to hold
for the whole duration of a long-running operation.

The normative concept is the **consequential boundary** — the point at which the
institution commits to a consequence. "The external effect begins" is the common
implementation of that boundary, not its definition. Other boundaries exist and
each is its own consumption point.

## Two consequences, two boundaries

Creating a future obligation and causing a future effect are different
institutional consequences and consume Authority separately.

| Consequence | Authority must be valid |
| --- | --- |
| authorize the creation of a Commitment | when the Commitment is admitted |
| authorize the future effect the Commitment anticipates | at that future consequential boundary |

A grant valid today authorizes taking on a future obligation today. It does
**not** thereby pre-authorize the effect. When the effect reaches its own
consequential boundary, Process re-resolves and revalidates the Authority
applicable *at that time*.

## The case this closes

The defect being closed is a grant reaching forward through a future
`effective_at`:

```text
grant expires:      2090
event recorded:     2089   <- Authority validated here today
effect effective:   2099   <- and the effect inherits it
```

A `recorded_at` of 2089 is not a machine that carries Authority ten years
forward. Under this ADR the 2089 admission may create the obligation; the 2099
effect must find valid Authority in 2099.

The reverse direction was already correct: a grant that becomes effective in the
future does not authorize an act today.

## Consequences

**Expiry after a committed consequence does not undo it.** Once an irreversible
consequence has been legitimately committed under valid Authority, later
expiration or revocation does not retroactively invalidate it. Bitemporality
already carries this: what the institution knew and was permitted at the earlier
transaction time is not rewritten by a later fact.

**Expiry or revocation before the boundary blocks the effect and only the
effect.** The underlying obligation survives:

```text
Commitment  = still OPEN
Effect      = BLOCKED
Heartime    = keeps reconciling
```

A blocked effect is not a satisfied commitment, not a waiver and not a
cancellation. Losing Authority is not a way to discharge an obligation; ending an
obligation requires an admitted act of its own.

**A long-running effect is refused at its boundary, not midway.** This ADR does
not require the same Authority to be re-proved continuously during execution. It
requires it to be valid at each point where the institution commits to something.
A retry is a new consumption point and revalidates.

## Relationship to resource authorization

Resource authorization already works this way. `powerfarm.execution-slice.v4`
seals `resources.evaluated_at` and both authorization windows, and every engine
Setting revalidates them against its own clock immediately before the external
effect — see [ADR 0012](./0012-authorization-is-checked-at-the-effect-boundary.md).

This ADR extends the same shape from resources to institutional Authority. The
two are deliberately parallel so that one mental model covers both: an
authorization is checked where it is spent.

## Not yet implemented

Authority is still validated at `recorded_at` in the kernel. This ADR is
`accepted` as the decision; the code does not yet implement it.

## Promotion criteria

The implementation satisfies this ADR when all of the following hold:

1. Admitting a Commitment consumes Authority at the admission boundary only, and
   is recorded as having done so.
2. A consequential act with a future `effective_at` cannot inherit the Authority
   spent on the Commitment; it resolves Authority at its own boundary.
3. A grant valid until 2090 does not authorize a consequence at the 2099
   boundary. This is a negative control, not a comment.
4. Revocation between wake and the consequential boundary blocks the effect,
   leaves the Commitment `OPEN`, and leaves Heartime reconciling.
5. Expiry after a committed irreversible consequence leaves that consequence
   valid and does not rewrite it.
6. A retry revalidates Authority at the new consumption point.
7. Every engine Setting — AI SDK, ADK, MAF — produces the same decision for the
   same boundary, proved by a shared conformance suite.

---

Copyright © 2026 PowerFarm. All rights reserved.
