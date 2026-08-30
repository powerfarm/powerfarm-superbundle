# First Seam v1 ports

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Machine inventory:** `contracts/first-seam.v1.json`  
**Status:** permanent boundary contracts; live organ implementations not deployed in this repository

The controller is portable because it depends on small organ-owned ports rather than organ storage layouts.

## Cards: `powerfarm.cards.attention.v1`

```text
listCurrentAttention
compileWakePack
recordAttentionResponse
```

Cards owns attention, ranking rationale, WakePack compilation, species projections, response identity, expiry, and observed Card generation.

## Registry: `powerfarm.registry.occupancy.v1`

```text
resolveCurrentOccupancy
```

Registry owns Office/Occupancy continuity. The First Seam does not mint an Occupancy or infer one from the model name.

## Registry runtime token: `powerfarm.registry.runtime-token.v1`

```text
issueRuntimeToken
```

Registry owns the durable runtime Identity and token issuance policy. Heartime requests a short-lived access token for `pf.runtime.heartime`; it does not store an immortal user session or use the Supabase service-role key. The provider token is replaceable machinery and MUST identify the requested institutional subject.

## Process (Continuum + ADK): `powerfarm.process.authority-projection.v1`

```text
projectCardAffordances
```

The port is owned by Process, implemented by Continuum + its execution setting. It derives effective affordances from admitted authority. Receiving a Card never creates authority, and ADK never mints authority.

## Platform runs: `powerfarm.platform.attention-runs.v1`

```text
listCompletedAttentionAttempts
markAttentionAttemptRecorded
ensureAttentionAttempt
observeAttentionAttempt
```

This is a membrane over Platform's existing run machinery, not a new run database in Organism. The inspected Platform runtime already contains:

- an idempotent `RunStore` with create/get/transition;
- signed/verified Execution Envelopes carrying RunGrant and allowed Capabilities;
- an `EffectStore` with execute/replay/blocked decisions and explicit uncertain effects.

The production membrane MUST preserve those semantics. It may add a Platform-owned query/index needed to find attention attempts, but Organism MUST NOT create a shadow run or Effect Store.

A failed attempt may have a successor while preserving predecessor lineage. The adapter must not mistake the provider idempotency of one execution for the institutional identity of the unresolved attention obligation.

## Evidence: `powerfarm.evidence.recording.v1`

```text
recordEvidence
```

Telemetry is not Evidence. This port records the PowerFarm Evidence reference returned by the owning evidence surface.

## Heartime state: `powerfarm.heartime.state.v1`

An optional RPC abstraction for replacing the default PostgREST setting:

```text
nextWake
prepareCycle
finishCycle
deferFailure
```

The default setting currently lowers these operations onto the custom PostgreSQL `heartime` schema through authenticated PostgREST.

## Heartime control: `powerfarm.heartime.control.v1`

```text
arm
```

This is a private, versioned Service Binding surface used to reconstruct the
provider alarm from canonical Heartime state. The caller must present an
explicit institutional IdentityRef admitted by deployment configuration. The
control port does not accept a deadline or a Card payload from its caller.

## Attention reconciler: `powerfarm.first-seam.reconciler.v1`

```text
reconcile
```

Heartime calls this private RPC through a Service Binding. The input is only the versioned wake hint. The result is only a compact reconciliation summary.

## Compatibility law

Every RPC boundary carries an explicit `contract_version` and fails closed on mismatch. Backward compatibility, when introduced, must be deliberate and tested rather than inferred from similar fields.

---

Copyright © 2026 PowerFarm. All rights reserved.
