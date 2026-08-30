# Cards

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Organism / Circulation / cards` · **README**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Cards are the canonical circulating carrier of the PowerFarm organism.

```text
organ-owned truth
      ↓ refs
     Card
      ↓
   Heartime
      ↓
Process / Platform / Memory / Homeostasis
      ↓
   CardPatch
```

`lib/card-v1.mjs` defines the versioned Card snapshot and content seal. `lib/patch.mjs` enforces per-organ mutation ownership. `lib/state-machine.mjs` owns circulation transitions. `lib/gate.mjs` answers whether a Card is locally due to circulate, defer, block, or reconcile.

This directory does not own Registry identity, Process Authority, Platform capabilities, Memory evidence, or Homeostasis health. It defines how those durable references can share one circulating object without acquiring each other's powers.

The existing attention Card contract remains a species/projection of this broader carrier. Semantic `generation` remains separate from circulating `revision` so Heartime motion cannot make attention responses stale by itself.

## ExecutionSlice

`lib/execution-slice.mjs` projects an `executing` Card into `powerfarm.execution-slice.v3`. The slice is sealed, contains no engine identity or raw tool data, and carries the exact Card, beat, attempt, institutional refs and capability mapping that Process must admit.

The institutional run identity is derived from Card semantic generation + attempt + capability mapping. `beat_ref` is deliberately excluded: it identifies one Heartime emission, while `attempt_ref` identifies the institutional attempt. `lib/recovery.mjs` moves stale/interrupted Cards through `orphaned -> reconciling`, refreshes Registry-owned occupancy refs, and lets Heartime reissue a new beat while preserving the same attempt and run.

## Epistemic continuity

`lib/epistemic-schema.mjs` defines evidence-linked, content-addressed epistemic records. `lib/epistemic.mjs` builds durable wake context, tracks unresolved UNKNOWN records, assesses observation freshness, and lets Heartime schedule `next_sample`.

```text
Memory:    OBSERVED / INFERRED / ASSUMED / REPORTED / UNKNOWN / CONTRADICTED
Heartime:  next_sample + wake when due/stale
```

The Card stores concise institutional statements and references, never hidden model reasoning or private session memory. A deferred Card with unresolved uncertainty must leave a future sampling condition.

## Energy and cost

`lib/resource-schema.mjs` and `lib/resources.mjs` implement `pf.contract.energy-cost.v1`. Process writes authorization; Platform emits evidence-backed resource observations; Heartime admits consumption and blocks exhausted circulation; Homeostasis derives pressure and circulatory debt. Every successful Heartime emission consumes one `beats` unit.

ExecutionSlice v3 carries the remaining resource budget to engine Settings without making that budget part of `run_ref`.

---

Copyright © 2026 PowerFarm. All rights reserved.
