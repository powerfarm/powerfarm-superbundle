# Cards + Heartime Hardening

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Operations` · **OPERATIONS**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** Milestones 1, 2, 3 and 4 implemented and locally verified. Production Card persistence, live Registry bindings and the PostgreSQL Process writer are not deployed.

## Mission

Cards are the canonical unit of institutional circulation. Heartime keeps Cards alive, bounded, observable, attributable and recoverable without becoming the owner of Identity, Authority, Capability, Evidence or institutional consequence.

LLMs are transient occupants. Durable Cards, Evidence and owner-organ state must let a later occupant reconstruct what happened without depending on hidden session memory. Epistemic continuity is the next hardening milestone.

## Milestone 1: Circulation kernel

Implemented:

```text
powerfarm.card.v1
powerfarm.card-patch.v1
powerfarm.card-transition.v1
content-addressed Card snapshots
semantic generation != circulating revision
per-organ mutation ownership
fail-closed lifecycle transitions
next_expected liveness invariant
CIRCULATE / DEFER / BLOCK / RECONCILE gate
Attention projection compatibility
Card/beat/attempt provenance through Process
pinned Card -> Heartime -> Continuum -> AI SDK -> Evidence golden
```

## Milestone 2: Engine equivalence

Implemented:

```text
engine-neutral ExecutionSlice
common institutional run identity
AI SDK and ADK consume the same Card-derived attempt
engine/provider/session/tool-call ids remain evidence only
normalized Continuum consequence is equivalent across engines
terminal replay guard before external effect
pinned cross-engine golden
```

## Milestone 3: Recovery

Implemented:

```text
powerfarm.execution-slice.v4
pf.contract.card-recovery.v1
attempt_ref = institutional attempt
beat_ref = one Heartime delivery
new beat preserves run_ref
same-beat duplicate fails closed
stale Occupancy -> orphaned -> reconciling
Process run.takeover for successor Occupancy
Registry-owned Card ref refresh
Heartime reissue with same attempt_ref
Process run.resume for the new beat
stable run_ref exposed as external idempotency key
AI SDK lost-receipt recovery golden
ADK takeover/resume recovery test
```

The critical recovery path is:

```text
external effect happened
        ↓
receipt lost
        ↓
same beat redelivery -> ALREADY_IN_FLIGHT
        ↓
Registry replaces Occupancy
        ↓
Heartime -> orphaned -> reconciling
        ↓
Process admits run.takeover
        ↓
Registry refreshes Card occupancy refs
        ↓
Heartime emits a new beat, same attempt
        ↓
Process admits run.resume
        ↓
external system receives the same run_ref idempotency key
        ↓
run.finish + Evidence + Card settlement
```

PowerFarm does not claim magical exactly-once side effects. It guarantees stable institutional identity, fail-closed duplicate circulation, and a stable idempotency key across recovery. The external tool or system of record must honor that key to deduplicate a physical effect.

## Milestone 4: Epistemic continuity

Implemented:

```text
pf.contract.epistemic-continuity.v1
powerfarm.epistemic-record.v1
OBSERVED / INFERRED / ASSUMED / REPORTED / UNKNOWN / CONTRADICTED
content-addressed epistemic record refs
Memory-owned evidence-linked epistemic records
Heartime-owned next_sample
stale-observation and due-sample wake enforcement
unresolved UNKNOWN cannot be deferred without next_sample
append-only resolution and contradiction lineage
powerfarm.epistemic-wake-context.v1
separate-process occupant A -> durable Card -> occupant B golden
```

The continuity golden deliberately shares no provider session, chat history, closure, or private model state between occupants. The later occupant receives only durable Card state and evidence references.

## Still not claimed

```text
production Card snapshot store
production transition ledger
live RegistryDirectory implementation
live Heartime runtime-token issuer/binding
PostgreSQL Continuum admission writer
energy and cost enforcement against real provider usage
live Homeostasis projections
```

## Release gate

Milestone 3 remains acceptable only while:

```text
Card contract passes
ExecutionSlice v2 contract passes
Recovery contract passes
Card ownership/state-machine tests pass
AI SDK and ADK Settings pass
all circulation goldens match pinned fixtures
old occupant cannot close after replacement
new occupant cannot resume without takeover
same-beat duplicate cannot execute again
new-beat recovery preserves run_ref and attempt_ref
full Super Bundle verify passes
upstream engine pins remain unchanged
```

Next: Energy and Cost. Process authorizes bounded operational energy; Heartime and Platform observe consumption and Homeostasis interprets pressure.

## Milestone 6: Production Circulation

Production-shaped boundaries now replace local-only assumptions while preserving all previous Card semantics: Registry-backed Office/Occupancy/key lookup, fixed-subject runtime credentials, transactional Process persistence, private Service Bindings, deterministic trace correlation, and Heartime circulation-pressure projections. Verification is local and deterministic; migration application and provider deployment remain separate operational acts.

---

Copyright © 2026 PowerFarm. All rights reserved.
