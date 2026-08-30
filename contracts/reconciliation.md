# Attention Reconciliation Contract

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Contract identity:** `pf.contract.first-seam.v1`  
**Status:** permanent First Seam boundary contract

This contract governs the real boundary between Heartime, Cards, the current Occupancy, Platform run machinery, authority projection, and Evidence.

It is not a universal message format.

## Law

```text
Heartime causes a reconciler to look again.
The reconciler fetches current durable state.
The smallest lawful correction is attempted idempotently.
Observed state and Evidence are written durably.
A later pass reconstructs reality from those records.
```

Events may wake reconciliation early. Events are not the only record that work remains due.

## Wake hint

A physical Heartime wake MAY carry only:

```text
BeatRef
ReconcilerRef
reason
optional resource hint
```

It MUST NOT carry a Card body, WakePack, prompt, workflow dump, or business payload.

## Return to Heartime

The reconciler returns only references, counts, state, reason, and timestamps. It MUST NOT return Card bodies, WakePacks, prompts, response payloads, or workflow state to Heartime.

Physiologically, Evidence returns. In implementation, durable organ-owned state changes and Heartime receives a compact observation summary.

## Controller ownership

The attention reconciler owns no durable institutional concept. It calls organ-owned public surfaces for:

- current Cards and WakePack compilation;
- Office/Occupancy resolution;
- authority projection;
- run/attempt creation and observation;
- response and Evidence persistence.

Every pass may end. Continuity lives in durable state, not the controller process.

## Idempotency

An attempt key is derived from:

```text
contract version
CardRef
Card generation
attention obligation identity
recipient scope
response contract
```

At-least-once wake is expected. Duplicate wake MUST NOT duplicate canonical response, Effect, or consequence.

## Conformance

The contract fails if disabling all event acceleration prevents eventual reconciliation.

---

Copyright © 2026 PowerFarm. All rights reserved.
