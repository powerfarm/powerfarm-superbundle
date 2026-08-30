# Epistemic Continuity Contract v1

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Contract:** `pf.contract.epistemic-continuity.v1`  
**Record wire:** `powerfarm.epistemic-record.v1`  
**Wake context:** `powerfarm.epistemic-wake-context.v1`

PowerFarm does not depend on an LLM, agent process, provider session, or chat transcript remaining alive. Each occupant leaves a compact, evidence-linked description of the world for occupants that have not yet awakened.

## Epistemic classes

```text
OBSERVED       directly sampled from the world and evidence-backed
INFERRED       derived from cited epistemic records
ASSUMED        explicit working assumption
REPORTED       attributed statement from a named source with evidence
UNKNOWN        unresolved question
CONTRADICTED   explicit durable conflict between records
```

Classification is not cosmetic. An inference MUST NOT silently become an observation merely because it survived several wakes.

## Custody

Memory owns observations, claims, uncertainties, conflicts, freshness projections, and evidence references. Heartime owns only `epistemic.next_sample` and the wake decision.

The Card contains concise institutional statements plus references. It is not a container for raw prompts, private model state, hidden chain-of-thought, or full conversation transcripts.

## Freshness and sleep

An observation may carry `fresh_until`. Heartime may wake a prepared/deferred Card when an observation becomes stale or when `next_sample` becomes due, even if ordinary `circulation.next_expected` is later.

A Card with unresolved `UNKNOWN` records cannot be deferred without a Heartime-owned sampling condition. Terminal Cards may preserve unresolved uncertainty as history without promising another wake.

## Resolution without rewriting

An `UNKNOWN` record remains append-only. A later evidence-backed claim resolves it by referencing its stable record ref. Contradictions are also appended rather than deleting the record that turned out to be wrong.

This lets a future occupant distinguish the history of knowledge from the current best view of the world.

## Golden boundary

The conformance golden runs occupant A and occupant B in separate operating-system processes. B receives only a serialized, sealed Card. The test passes only if B can recover what A observed, distinguish A's inference, see the unresolved question, detect staleness, sample the changed world, record contradiction, resolve the question, and leave another `next_sample`.

---

Copyright © 2026 PowerFarm. All rights reserved.
