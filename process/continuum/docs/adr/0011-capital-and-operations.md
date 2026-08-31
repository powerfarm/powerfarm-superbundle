# ADR 0011: Capital and Operations

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** accepted

## Decision

Deployment has two domains and one workbench, above the organs and orthogonal to them.

```text
Capital      institutional state that must survive
Operations   execution that may be replaced
Workbench    where the work is made, and never a party to attestation
```

**No irreplaceable institutional truth may exist exclusively in Operations.**

The organs are not renamed. Registry stays Registry, Process stays Process, Heartime stays Heartime. Capital and Operations sit above them as placement domains, and nothing in the implementation is named after them.

## Why this belongs here

A name enters the repository when changing it changes what can happen to the system. Capital and Operations decide placement, backup, restore, failure domains and what may disappear without destroying PowerFarm. Renaming them would change all of that, so they are canon rather than vocabulary.

Workbench qualifies by the same test, and for a reason that is easy to lose: the machine where the work is made is deliberately outside the mutual attestation. If the Director's workbench were one of the witnessing parties, the person holding the institution would also be one of the organs that keep each other honest. A witness may not be hosted there.

Terms that describe rather than decide stay out. *Child Card* is the human name for `card.lineage.parent_card_ref != null` and needs no new species. Root and Leaf are UI derivations. Metabolism, enzyme and shoreline are narrative and belong to canon prose, not to placement.

## Consequences

Capital holds identity, offices, occupancy, keys, evidence, lineage, durable Heartime state and durable Process state. Operations holds engines, workers, Settings, reconcilers and effect adapters. Operations may be destroyed and rebuilt from a release without institutional loss; Capital may not.

Deployment contracts name the domain, not the machine. A domain may move hosts without the contract changing.

The invariant needs a guard rather than good intentions, in the shape of `check-engine-boundaries.mjs`: every durable store declared by a deployed component must resolve to Capital, and a component that persists anywhere else fails the check by name.

## The placement that is not settled

The Continuum kernel writes its ledger to SQLite, beside the runtime. A Postgres path exists — `process/migrations/` carries the core schema, the admission writer and the Card-only admission, and `process/worker` persists already-admitted batches through a port that checks its caller.

That path persists what has been admitted. It does not make the kernel's own store live in Capital. Until the writer is deployed and the relationship between the two is decided — whether the local store is a working copy of a Capital ledger, or the ledger with Capital holding a projection — a Continuum running in Operations holds irreplaceable truth exclusively there, and this ADR's invariant is violated by the current arrangement rather than by a mistake.

Two readings are available and neither is chosen here. Deployment must not choose it by accident: moving Process durable state to Capital because the topology looks better, without the code knowing how to persist there, hides an architectural migration inside an installation.

Until it is settled, Operations may run Continuum only where the loss of that machine is an accepted loss.

---

Copyright © 2026 PowerFarm. All rights reserved.
