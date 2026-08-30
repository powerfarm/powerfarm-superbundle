# Legacy Removal

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Milestone 7 changes the new Cards + Heartime path from preferred to mandatory.

Production execution has one institutional route: a sealed Card produces a sealed ExecutionSlice, Process admits it, and only the Card-bound persistence writer may commit the already-admitted batch. Engine-local invocation/session/tool-call identifiers are provenance only. They cannot synthesize institutional identity or a run.

Writable Continuum requires Registry identity reality. The retired embedded identity directory remains available only through the explicit `embedded-test` profile for deterministic tests. The ADK public runtime no longer exports Office/Occupancy/grant bootstrap helpers.

The First Seam also stops accepting the historical attention-shaped object as a circulating source. `Cards.listCurrent()` must return sealed `powerfarm.card.v1`; WakePacks remain projections and are cryptographically bound to the exact Card snapshot they project.

The old PostgreSQL `admit_batch_v1` implementation remains as an internal transaction primitive so migration history and audited code remain intelligible, but authenticated callers cannot execute it. `admit_card_batch_v2` is the only authenticated act-persistence route.

This contract removes bypasses without changing the semantic bytes of Card v1.

---

Copyright © 2026 PowerFarm. All rights reserved.
