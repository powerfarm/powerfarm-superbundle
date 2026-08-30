# Changelog

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / ADK Setting` · **HISTORY**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

## 0.3.0

- Requires a sealed Cards + Heartime ExecutionSlice for every institutional tool execution.
- Removed engine-local invocation/session/tool-call identifiers from institutional run identity.
- Removed Office/Occupancy/grant bootstrap helpers from the public runtime package; retired embedded governance fixtures are test-only.
- Pairs with Registry-backed Continuum 0.4.x production identity mode.

## 0.2.0

- Fixed release layout to the declared `src/`, `tests/`, `examples/`, and `constraints/` structure.
- Made tool intent + `run.start` one atomic Continuum admission batch.
- Switched run closure to Continuum 0.3.1 continuation authority, so revocation blocks new work without erasing outcomes of already-admitted work.
- Removed authoritative in-memory `_open` state; outcome callbacks recover deterministic run state from the ledger.
- Replaced raw argument/result/error persistence with digest-only evidence by default.
- Added an allowlisted disclosure policy for explicitly safe fields.
- Made float/Decimal/bytes/unknown Python values deterministically digestible without violating Continuum's no-float institutional payload invariant.
- Qualified idempotency by invocation, function call, attempt, agent, session, and tool, then hashed the tuple before it reaches the ledger.
- Made subject-template values collision-resistant (`readable-prefix~digest`) instead of lossy truncation.
- Added strict production defaults: explicit mapping, concrete revision, fail-closed context validation, and no actor disclosure in refusals.

## 0.1.0

- Initial ADK admission plugin prototype.

---

Copyright © 2026 PowerFarm. All rights reserved.
