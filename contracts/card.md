# Canonical Card Contract v1

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Contract:** `pf.contract.card.v1`  
**Wire version:** `powerfarm.card.v1`

A Card is PowerFarm's canonical unit of institutional circulation. Cards are not a seventh organ and do not become a second system of record. They carry durable references between organ-owned truths while Heartime keeps the obligation alive in time.

## Identity versus motion

`ref` identifies the Card. `generation` identifies its semantic generation. `revision` identifies a concrete circulating snapshot.

A Heartime beat, acknowledgement, retry, cost observation, or evidence reference advances `revision`; it MUST NOT silently advance `generation`. This preserves the existing First Seam rule that a response to semantic generation N remains attributable to N.

Every admitted snapshot is content-addressed by `content_sha256`.

## Organ ownership

Card mutation is expressed as `powerfarm.card-patch.v1`. Each patch declares the organ responsible for it and is rejected if it writes outside that organ's namespace.

```text
Registry      identity / office / occupancy refs
Process       direction / responsibility / authority / run / ECS / authorized budgets
Platform      execution observations
Memory        evidence and epistemic records
Heartime      circulation, wake timing, consumption accounting, transition lineage
Homeostasis   health projections
```

Receiving or mutating a Card never creates Authority. Heartime may refuse to circulate a Card but cannot make an inadmissible act admissible.

## Liveness

Every non-terminal Card MUST carry `circulation.next_expected` unless it is explicitly `blocked` with a machine-readable reason. The timestamp is written on emission, not after a response arrives.

## Epistemic surface

The Card carries evidence-linked epistemic records under `epistemic.*`. Memory owns observations, claims, uncertainties, conflicts, freshness, and evidence refs. Heartime owns `epistemic.next_sample`. The semantic classes and sleep/wake rules are frozen by `pf.contract.epistemic-continuity.v1`.

Private model state, hidden reasoning, raw prompts, and full transcripts are not Card fields.

## Lineage

Circulation changes append content-addressed transition references. Existing transition lineage cannot be rewritten through a CardPatch.

The durable transition store is a later persistence seam; v1 freezes the semantic contract and deterministic transition identity first.

---

Copyright © 2026 PowerFarm. All rights reserved.
