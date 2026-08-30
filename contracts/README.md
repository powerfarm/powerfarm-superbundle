# Contracts

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The small set of meanings that cross real organ boundaries.

## Canonical Card circulation

```text
pf.contract.card.v1
powerfarm.card.v1
powerfarm.card-patch.v1
powerfarm.card-transition.v1
```

Documents: `card.v1.json` and `card.md`. The older `powerfarm.cards.attention.v1` contract remains an attention projection over the canonical carrier.

This is not a shared framework and not a universal DTO library. Engines remain native. Contracts preserve stable identity, meaning, authority, evidence obligations, and the smallest information required by a seam.

## Engine-equivalent execution

```text
pf.contract.execution-slice.v3
pf.contract.card-recovery.v1
pf.contract.execution-receipt.v1
```

Current documents: `execution-slice.v3.json`, `recovery.v1.json`, `execution-receipt.v1.json`, and `execution-slice.md`. `execution-slice.v1.json` and `execution-slice.v2.json` remain historical and pinned. V3 carries the remaining resource budget while preserving the stable attempt/run identity introduced by v2.

## Epistemic continuity

```text
pf.contract.epistemic-continuity.v1
powerfarm.epistemic-record.v1
powerfarm.epistemic-wake-context.v1
```

Documents: `epistemic-continuity.v1.json` and `epistemic-continuity.md`. Memory owns durable epistemic records and evidence links; Heartime owns `epistemic.next_sample`. The contract explicitly excludes raw prompts, hidden chain-of-thought, transcripts, and private model session state from the Card.

## Attention seam

```text
pf.contract.first-seam.v1
powerfarm.heartime.cycle.v1
powerfarm.cards.attention.v1
powerfarm.registry.occupancy.v1
powerfarm.registry.runtime-token.v1
powerfarm.process.authority-projection.v1
powerfarm.platform.attention-runs.v1
powerfarm.evidence.recording.v1
powerfarm.heartime.state.v1
powerfarm.heartime.control.v1
powerfarm.first-seam.reconciler.v1
```

Documents:

```text
first-seam.v1.json
reconciliation.md
card-attention.md
first-seam-ports.md
```

## Capability-learning seam

```text
pf.contract.capability-learning.v1
powerfarm.registry.capability-learning.v1
powerfarm.evidence.capability-learning.v1
powerfarm.imagineering.capability-construction.v1
powerfarm.process.capability-succession.v1
powerfarm.sedimentation.reconciler.v1
powerfarm.heartime.state.v1
powerfarm.heartime.control.v1
```

Documents:

```text
capability-learning.v1.json
capability-learning.md
capability-learning-ports.md
```

## Shared boundary discipline

```text
refs.md       identity is not location
database.md   shared PostgreSQL boundary discipline
```

Admission rule: nothing enters this directory merely because systems could theoretically share it. A real boundary must require the meaning, a durable owner must be named, and a negative test must be able to break the contract.

- `energy-cost.v1.json` freezes Process-authorized energy/cost, Heartime consumption enforcement, Platform metering evidence, and Homeostasis pressure projection.

## Legacy removal

- `legacy-removal.v1.json` freezes the rule that production execution requires sealed Cards + ExecutionSlice, Registry-backed Continuum identity, and Card-bound Process persistence.
- `legacy-removal.md` explains which historical implementations remain test/internal only and which paths are no longer executable.

## Production circulation

- `production-circulation.v1.json` pins the Registry Directory, runtime-token, Process writer, Service Binding, and operational-trace production boundaries.
- `operational-trace.v1.json` defines the compact correlation spine. It is evidence/observability, not Authority.

---

Copyright © 2026 PowerFarm. All rights reserved.
