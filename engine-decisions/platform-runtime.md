# ENGINE_DECISION: existing PowerFarm Platform runtime

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Engine decisions` · **ENGINE DECISION**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** selected as the execution engine; First Seam membrane specified, not deployed

## Source inspected

Private repository `powerfarm/powerfarm-platform`, main tree observed during First Seam construction.

Relevant existing machinery:

```text
packages/powerfarm-engine/src/runtime/run-store.ts
packages/powerfarm-engine/src/runtime/execution-envelope.ts
packages/powerfarm-engine/src/runtime/effect-store.ts
packages/gatekeeper-identity/src/powerfarm-authority.ts
```

## Mechanism supplied

- idempotent run creation and state transitions;
- RunGrant-bound Execution Envelopes;
- allowed-Capability verification;
- Effect execute/replay/blocked semantics;
- explicit uncertain effects;
- Registry-backed authority lowering.

## Decision

The First Seam MUST use this machinery through the `powerfarm.platform.attention-runs.v1` membrane. It MUST NOT build a second run table, effect store, workflow engine, or agent runtime inside Organism.

## Gap

The inspected runtime does not yet expose the exact attention queries required by the v1 port, particularly completed-unrecorded discovery and successor-aware attention attempts. That adaptation belongs to Platform or a thin Platform setting. It remains `NOT DEPLOYED` here rather than being faked with a new canonical store.

## What survives removal

Card attention obligation, Office continuity, Process authority, Heartime beats, Evidence, and the First Seam contract. A successor execution engine can occupy the same port.

---

Copyright © 2026 PowerFarm. All rights reserved.
