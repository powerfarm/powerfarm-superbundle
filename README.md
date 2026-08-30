# PowerFarm Super Bundle

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle` · **README**  
> **Navigate:** [Super Bundle](./README.md) · [Documentation map](./DOCUMENTATION.md) · [Canon](./canon/README.md) · [Contracts](./contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Organism + Process + replaceable execution engines in one permanent body.**

This repository is the permanent PowerFarm body outside Registry. The standalone
Registry remains separate and owns Identity, Office/Occupancy, Brand, Store, Gadgets
and exact artifact lineage. Process lives here as Continuum plus pinned execution
Settings for Google ADK and Vercel AI SDK.

```text
REGISTRY (separate)
  identity · office · occupancy · brand · store · gadget lineage
                     │
                     ▼
POWERFARM SUPER BUNDLE
  Process
    Continuum · authority · admission · runs · consequence · proof
      ├─ continuum-adk    → Google ADK 2.8.0
      └─ continuum-ai-sdk → Vercel AI SDK 7.0.84 (vendored + content-pinned)
                     │
  Organism
    Cards · Heartime · roster · homeostatic circulation · learning/sedimentation
```

There is deliberately no empty wrapper service named Process. Continuum and its
engine Settings are the Process body. Engines can be replaced without moving
identity, authority or consequence out of PowerFarm.

## Layout

```text
process/       Process: Continuum + ADK and AI SDK Settings
heartime/      temporal circulation and wake enforcement
circulation/   canonical Cards plus stateless reconcilers
roster/        desired organ coverage
contracts/     organ boundaries, including Registry ↔ Process
canon/         organism/organization canon
```

---

## Organism source

## Canonical circulation

`powerfarm.card.v1` is now the canonical circulating carrier. `generation` remains semantic; `revision` advances with admitted circulation and organ-owned patches. Heartime owns circulation fields and refuses illegal lifecycle transitions, but it still cannot create Authority or institutional consequence. The existing Attention Card is a projection of this carrier rather than a second Card system.

### Cards + Heartime hardening

```text
Card snapshot (content-addressed)
  ↓
Heartime circulation gate
  ↓
organ-owned CardPatch
  ↓
append-only transition lineage
  ↓
next_expected or explicit blocked/terminal state
```

Pinned circulation goldens now cover the basic vertical path, engine equivalence, and recovery after lost receipts and Occupancy replacement. Durable Card/transition persistence remains a later production seam; the current milestones freeze and verify the semantic kernel first.

## Engine-equivalent execution

`powerfarm.execution-slice.v3` is the engine-neutral executable projection of an executing Card. `attempt_ref` identifies the institutional attempt; `beat_ref` identifies one Heartime delivery. Recovery may issue a new beat while preserving the same attempt and `run_ref`.

```text
executing Card
  ↓
sealed ExecutionSlice
  ├─ continuum-adk
  └─ continuum-ai-sdk
       ↓
same run_ref / stable attempt identity
       ↓
Continuum RuntimeReceipt
```

Engine-local invocation, tool-call, session, model and provider identifiers are evidence only. They cannot redefine the institutional run. A pinned golden executes the same attempt through both Settings and requires identical normalized institutional consequence. Recovery goldens additionally require same-beat duplicate refusal and new-beat `run.resume` under the same `run_ref`.

## Epistemic continuity

Cards now preserve a compact, evidence-linked view of the world between transient occupants. `OBSERVED`, `INFERRED`, `ASSUMED`, `REPORTED`, `UNKNOWN`, and `CONTRADICTED` remain distinct durable classes. Memory owns those records; Heartime owns only when the world must be sampled again through `epistemic.next_sample`.

A pinned multi-process golden terminates occupant A completely and starts occupant B with only a serialized Card. B must reconstruct what A observed, distinguish inference from observation, see unresolved uncertainty, detect staleness, sample the changed world, preserve contradiction, resolve the UNKNOWN by reference, and leave another sampling condition. No provider session, chat transcript, or private model memory crosses that boundary.

## Permanent seams

### 1. Attention

```text
Heartime wakes the attention reconciler
  ↓
current Cards state is read
  ↓
WakePack projects current attention
  ↓
an Occupancy responds or abstains
  ↓
response and Evidence persist
  ↓
later reconciliation observes changed reality
```

Events may accelerate the loop. Durable state guarantees it. Heartime carries references and wake energy, never Card, WakePack, prompt, or response bodies.

### 2. Capability learning and sedimentation

```text
Heartime wakes the sedimentation reconciler
  ↓
Registry resolves the durable capability and current implementation occupancy
  ↓
Evidence profiles the exact capability × work-class pairing
  ↓
Imagineering receives construction or independent-evaluation responsibility
  ↓
Process receives an attributable hardening or softening proposal
  ↓
Registry changes occupancy only after normal promotion
```

The learning controller cannot activate, promote, rewrite, or delete an implementation. It notices, validates, and ensures idempotent institutional obligations through versioned owner ports.

The substrates are entirely digital:

```text
inference       meaning reconstructed through model cognition
configuration   cognition compiled into editable durable structure
fixed           deterministic implementation for settled competence
```

Capability identity survives substrate succession. A semantic, authority, work-class, or evidence-contract change is a new capability revision, not sedimentation.

## Permanent architecture

```text
PostgreSQL Heartime contracts   durable obligation and open-beat recovery
Cloudflare Durable Object       physical wake only
reconciler router               selects a versioned seam by canonical ReconcilerRef
private Service Bindings        provider-local transport, not institutional identity
portable controllers            stateless level-triggered convergence
organ-owned ports               all institutional state remains with its owner
Process promotion               the only route from proposal to institutional change
```

No queue, consumer offset, reply topic, universal event envelope, model provider, or physical accelerator is canonical.

## Current truth

```text
canon/01 organism/organization        revised canon candidate; release derived
canon/02 capability learning          permanent protocol; release derived
First Seam v1 contract                BUILT AND VERIFIED LOCALLY
Capability Learning v1 contract       BUILT AND VERIFIED LOCALLY
Canonical Card v1 + patch ownership    BUILT AND VERIFIED LOCALLY
Card ↔ Heartime ↔ AI SDK golden          BUILT AND VERIFIED LOCALLY
Epistemic cross-occupant golden           BUILT AND VERIFIED LOCALLY
Heartime pure logic                    BUILT AND VERIFIED LOCALLY
Heartime migrations                    STRUCTURALLY VERIFIED; NOT APPLIED
physical Heartime setting              BUILT AND VERIFIED LOCALLY; NOT DEPLOYED
multi-reconciler routing               BUILT AND VERIFIED LOCALLY
roster desired state and planner       BUILT AND VERIFIED LOCALLY; NOT LIVE-BOUND
attention controller and setting       BUILT AND VERIFIED LOCALLY; NOT DEPLOYED
sedimentation controller and setting   BUILT AND VERIFIED LOCALLY; NOT DEPLOYED
vertical attention seam                BUILT AND VERIFIED IN MEMORY
vertical harden/soften lifecycle       BUILT AND VERIFIED IN MEMORY
live owner-organ ports                 NOT DEPLOYED
real capability substrate transition   NOT RUN
whole-system test                      NOT RUN
```

This is permanent source and contract work, not a disposable experiment. Deployment claims remain conservative because no production migration, Worker deployment, live organ binding, or real capability promotion was performed in this build.

## Verification

Run the full deterministic verification suite, including organism seams, Continuum,
ADK Setting, AI SDK golden integrations, exact upstream source pins, migration checks,
contract checks, and engine-boundary guards:

```bash
npm run verify
```

Generate a content-addressed local verification record with command logs:

```bash
npm run evidence
```

The verification record may say **BUILT AND VERIFIED** for local source behavior. Production fields remain **NOT RUN** or **NOT DEPLOYED** until external evidence exists.

## Admission

Permanent deployment procedures are defined in:

```text
operations/first-seam-admission.md
operations/capability-learning-admission.md
```

Admission requires real owner-organ ports, disposable-database execution, destructive failure tests, exact contract digests, authority, independent evidence, and an admission artifact. Provider settings may be replaced. Institutional identity and lineage survive them.

## Legacy removal

Milestone 7 makes the Cards + Heartime route mandatory rather than preferential. Writable Continuum cannot silently fall back to an embedded identity directory. ADK and AI SDK cannot derive institutional run identity from engine-local IDs. Public runtime packages expose no governance bootstrap helpers. The First Seam cannot circulate a historical attention-shaped object as if it were a canonical Card. Authenticated Process persistence cannot commit an admitted batch unless it is bound to `card_ref`, `beat_ref`, `attempt_ref`, and the exact ExecutionSlice digest.

The legacy implementations retained for migration history and deterministic tests are explicit and non-production: `identity_mode="embedded-test"` and the internal PostgreSQL v1 transaction routine.

## Production circulation boundary

Milestone 6 added production-shaped circulation without changing institutional ownership. Milestone 7 closes the legacy persistence bypass: `PostgrestRegistryDirectory` resolves Office/Occupancy/key reality from Registry; Heartime obtains short-lived `pf.runtime.heartime` credentials from a private Registry binding; the dedicated Process writer obtains `pf.runtime.process-writer` and persists only Card-bound, already-admitted Continuum batches through `continuum.admit_card_batch_v2`. The older `admit_batch_v1` function remains internal and is revoked from authenticated callers.

Operational correlation uses one deterministic trace derived from stable `CardRef`, deterministic W3C `traceparent`, and compact Heartime trace events. Trace persistence is deliberately non-authoritative: a trace outage cannot stop liveness. These adapters and migrations are built and verified locally, not deployed by this repository.

---

Copyright © 2026 PowerFarm. All rights reserved.
