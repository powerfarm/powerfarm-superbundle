# First Seam v1 admission and operation

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Operations` · **OPERATIONS**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** permanent deployment procedure; no production step in this file has been executed by the repository build.

This runbook promotes the already-versioned First Seam foundation into a live organ edge. It does not create a separate production design.

## Admission law

A deployment is admitted only when all of the following remain true:

```text
Heartime supplies wake energy, not Card payload
PostgreSQL preserves obligation and open Beat recovery
attention reconciliation reads current organ state
WakePack remains a Cards-owned projection
Occupancy comes from Registry
Authority comes from Process
attempt/effect lifecycle remains Platform-owned
Evidence is written through its owning surface
events are optional acceleration
```

Provider names and bindings are settings. The permanent identities are the `pf.*` references and the contracts in `contracts/first-seam.v1.json`.

## Gate 0: local source admission

From a clean checkout:

```bash
npm run derive
npm run verify
npm run evidence
```

Required result:

```text
all deterministic tests pass
all structural migration checks pass
all permanent-foundation guards pass
verification.json says BUILT AND VERIFIED
production fields remain NOT RUN / NOT DEPLOYED
```

A local pass does not authorize production deployment.

## Gate 1: disposable PostgreSQL execution

Use a disposable PostgreSQL 17 database or an explicitly authorized Supabase development branch.

Do not use the production database for the first execution test.

Before applying the migrations, the target must provide the Registry dependencies already required by the existing PowerFarm database:

```text
public.identidade_atual()
public.eh_membro()
the authenticated role and identity mapping they depend on
```

Apply, in order:

```text
heartime/migrations/20260823000000_heartime_genesis.sql
heartime/migrations/20260823190000_heartime_first_seam.sql
```

Then prove:

1. the `heartime` schema exists;
2. all six Heartime/First Seam tables have RLS enabled;
3. anonymous access is absent;
4. named functions are executable only by the intended authenticated runtime role;
5. `next_reconciliation_wake_v1` returns `NULL` with no obligation;
6. an emitted open Beat is rediscovered after the client disappears;
7. duplicate `finish_cycle_v1` calls create one observation;
8. a superseded contract generation closes stale Beats without advancing current state;
9. an old-generation summary remains attributable but cannot update the new generation;
10. transaction rollback leaves no partial admission.

Persist the SQL transcript and database version as Evidence. Do not translate an unexecuted item into PASS.

## Gate 2: Supabase API exposure

The custom `heartime` schema must be deliberately added to the project's exposed API schemas.

Verify with the intended runtime identity, never with the service-role key:

```text
next_reconciliation_wake_v1
prepare_cycle_v1
finish_cycle_v1
defer_failure_v1
```

Prove that:

```text
missing identity fails
anon fails
wrong institutional identity fails by RLS/policy
short-lived authenticated Heartime identity succeeds
expired token refreshes once and then fails closed if still unauthorized
```

## Gate 3: Registry runtime identity

Deploy or expose the permanent Registry port:

```text
powerfarm.registry.runtime-token.v1
issueRuntimeToken
```

The port must mint a short-lived token whose subject is exactly:

```text
pf.runtime.heartime
```

The token must be suitable only for the declared audience and database role. Registry retains identity and issuance policy. Heartime stores no immortal user session and no service-role credential.

## Gate 4: organ-owned First Seam ports

Provide the exact v1 entrypoints declared by `contracts/first-seam.v1.json`:

```text
Cards      powerfarm.cards.attention.v1
Registry   powerfarm.registry.occupancy.v1
Process    powerfarm.process.authority-projection.v1
Platform   powerfarm.platform.attention-runs.v1
Evidence   powerfarm.evidence.recording.v1
```

Each implementation must fail closed on contract-version mismatch.

Do not create substitute state in Organism. If an owning organ lacks one query, add the smallest membrane at that organ boundary.

## Gate 5: deploy provider settings

Deploy the target organ port Workers first, then:

1. the private Attention Reconciler Worker;
2. the Heartime Worker and Durable Object class;
3. Service Bindings using provider-local names;
4. explicit expected Heartime identity and component values;
5. observability with no credentials or authority material in telemetry.

The public HTTP handler of both Workers must remain closed.

After deployment, call `HeartimeControl.arm()` only through the private control binding. The Durable Object reconstructs its alarm from PostgreSQL.

## Gate 6: admit one permanent Card flow

Choose one low-risk real Card whose identity and history are intended to survive.

The first Card is not sample data. It must have:

```text
canonical CardRef
current generation
recipient Office/scope
response contract
selection rationale
EvidenceRefs where applicable
expiry/freshness semantics
```

Create the corresponding active reconciliation contract. Preserve its ID and generation lineage.

## Gate 7: destructive First Seam conformance

Run all of these against the deployed slice:

```text
event acceleration disabled
same alarm delivered twice
worker killed before durable response
Card generation changed during work
Occupancy replaced during unresolved attention
Card projected to LLM, human and client
unauthorized affordance referenced by Card
UNKNOWN / abstention returned
Durable Object local state discarded
invalid/wrong caller identity
invalid/wrong component identity
hardcoded provider URL changed
```

Required properties:

```text
state sweep rediscovers work
duplicate wake creates no duplicate consequence
open attention survives worker death
stale response cannot satisfy current generation
successor Occupancy continues the obligation
all species resolve one Card identity
a Card never creates authority
UNKNOWN remains legal
alarm reconstructs from canonical state
private RPC fails closed on caller mismatch
provider address changes do not change institutional identity
```

## Gate 8: admission record

Record an admission artifact containing at least:

```text
First Seam contract digest
canon digest
migration digests
applied migration versions
PostgreSQL version
Worker deployment versions
Service Binding inventory
organ port contract versions
CardRef and generation
reconciliation contract ID and generation
failure-test results
trace references
Evidence references
operator identity and applicable authority
```

Only after this record exists may the Appendix and release metadata say that the live edge is deployed and verified.

## Roll-forward discipline

The v1 seam is permanent, not frozen.

Changes proceed by:

```text
new migration
new contract version when semantics change
compatibility window where required
replay/conformance against v1 behavior
explicit supersession
```

Never rewrite an applied migration. Never silently change the meaning of an existing `pf.*` identity. Never delete prior Beat, Card-generation, response, or admission lineage to make the current state look clean.

## Removal and engine succession

Cloudflare, PostgREST, or any target engine may be replaced.

Before replacement, prove that the successor can reconstruct or continue from:

```text
PostgreSQL Heartime state
versioned First Seam contracts
organ-owned Card/Occupancy/Authority/Run/Evidence state
canonical references
```

Replacing machinery is an occupancy change. It is not a new First Seam.

---

Copyright © 2026 PowerFarm. All rights reserved.
