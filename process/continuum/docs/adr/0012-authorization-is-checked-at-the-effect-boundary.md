# ADR 0012: Resource authorization is checked at the effect boundary

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** accepted

## Decision

The energy and cost authorization of an ExecutionSlice is evaluated at an
explicitly supplied instant, and is revalidated against the executing clock
immediately before the external effect. It is never inferred from Card state.

`deriveExecutionSlice()` requires `evaluatedAt`. There is no default, and no
fallback to `Card.updated_at` or to an implicit wall clock inside the derivation
function. `powerfarm.execution-slice.v4` seals `resources.evaluated_at` and both
authorization windows, and the AI SDK, ADK and Microsoft Agent Framework Settings
each call the shared temporal assertion against an injectable clock before the
tool runs.

Authorization windows use an inclusive `effective_at` and an **exclusive**
`expires_at`. At exactly `expires_at` the authorization is already gone.

## Context

Before v4, `deriveExecutionSlice()` evaluated the resource budget at
`card.updated_at`. A historical Card update time is not the authorization instant
for a future external effect. A Card last updated while its authorization was
valid could therefore be projected into an executable, sealed slice long after
that authorization had expired — and the seal made the stale budget look
authoritative.

## Consequences

Three separate instants now exist and mean different things:

| Instant | Meaning |
| --- | --- |
| `Card.updated_at` | when the Card document last changed |
| `resources.evaluated_at` | when the resource budget and windows were read |
| the Setting's clock | when the external effect is about to begin |

An execution long enough to cross its own expiry is refused at the boundary, not
midway. A clock that has been rewound behind `evaluated_at` is refused too: a
budget cannot have been evaluated after the moment it is being spent.

The window is sealed, so it is not forgeable — but the seal is what makes it
unforgeable, and the temporal assertion alone does not verify the seal. Every
Setting therefore verifies the slice seal *before* revalidating the window. The
negative controls state this division explicitly rather than letting a passing
temporal check imply a check that did not happen.

The window travels with the slice and is not re-opened by anything about the
executor: a successor occupant re-sealing the slice, a fresh engine invocation,
a new ADK function-call id or a new MAF session all leave an expired window
expired.

## Evidence

Executable negative controls, at three layers:

- `circulation/cards/tests/execution-window.test.mjs` — derivation and the shared
  temporal assertion, including the B04 regression: a Card whose `updated_at` sits
  inside the window still cannot yield a slice evaluated after expiry.
- `process/continuum-ai-sdk/tests/adapter.test.mjs` — the AI SDK Setting refuses
  with `POWERFARM_RESOURCE_WINDOW_INVALID` and closes the admitted run as a
  failure rather than abandoning it.
- `process/continuum-adk/tests/test_execution_window.py` and
  `process/continuum-maf/tests/test_execution_window.py` — the ADK and MAF
  Settings refuse before any ledger effect is admitted.

`scripts/validate-execution-slice.mjs` runs the same properties as contract
checks rather than reading them out of source.

## What this ADR does not decide

This is about *resource* authorization only, and it is the implementation of one
consumption point rather than a general rule about Authority.

The general rule was decided separately in
[ADR 0013](./0013-authority-is-valid-where-it-is-consumed.md): Authority is valid
where it is consumed, at the consequential boundary. "The external effect begins"
— the boundary this ADR implements for resources — is the common case of that
boundary, not its definition. Institutional Authority itself is still validated at
`recorded_at` in the kernel and has not yet been moved.

---

Copyright © 2026 PowerFarm. All rights reserved.
