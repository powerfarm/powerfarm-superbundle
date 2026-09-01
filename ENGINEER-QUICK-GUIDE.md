# PowerFarm Engineer Quick Guide

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle` · **README**  
> **Navigate:** [Super Bundle](./README.md) · [Documentation map](./DOCUMENTATION.md) · [Canon](./canon/README.md) · [Contracts](./contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Welcome to the engine room. ⚙️

If the Founder’s Guide explains why the organism exists, this file explains where the machinery is and which invariants are carrying the load.

> **PowerFarm is an institutional runtime for transient human and machine intelligence.**

Agents execute. Engines execute. Workers crash. Models and providers change. Institutional meaning must remain coherent.

## Global shape

PowerFarm ships as two bodies:

```text
powerfarm-registry
        +
powerfarm-superbundle
```

### Registry

Standalone identity/reference product. Owns Identity, Office, Occupancy, keys, OAuth, Brand, Store, Gadgets, manifest lineage, artifact provenance, runtime identities and Directory RPCs.

Registry answers who/what/which Occupancy/which key. It does **not** own institutional Authority.

### Super Bundle

Contains ACK, MEMORY, PROCESS, PLATFORM, HOMEOSTASIS, Cards, Heartime, Continuum, execution Settings, contracts, conformance, evidence and production adapters.

## Six organs + circulation

```text
REGISTRY      durable identity/reference reality
ACK           reception and acknowledgement
MEMORY        evidence and epistemic continuity
PROCESS       Authority, admission, Direction, consequence
PLATFORM      engines, tools, sandboxes, capabilities
HOMEOSTASIS   health, pressure, cost and energy interpretation

HEARTIME      circulation, not a seventh organ
CARD          canonical circulating carrier
```

Process decides `ALLOW / DENY / CHALLENGE / ESCALATE`.
Heartime decides `CIRCULATE / DEFER / BLOCK / RECONCILE`.

Do not merge those two decisions. They look friendly until they eat your authority model.

## Cards

`powerfarm.card.v1` is content-addressed and versioned. Semantic `generation` is separate from circulatory `revision`.

A Card binds stable references to institutional reality while keeping ownership distributed. Mutations happen via organ-attributed CardPatch operations. An organ writing outside its namespace fails closed.

Typical ownership:

```text
Registry     identity / Office / Occupancy refs
Process      Direction / Authority / Run semantics
Platform     execution/capability observations
Memory       epistemic records / evidence refs
Heartime     state / priority / deadline / next_expected / beats
Homeostasis  health projections
```

## Card lifecycle

```text
prepared -> emitted -> acknowledged -> executing -> evidence_pending -> settled
```

Side states include `deferred`, `blocked`, `challenged`, `orphaned`, `reconciling`, `failed`, `terminal`.

Every live Card needs `next_expected` or an explicit blocked reason. That makes liveness machine-checkable.

## Authority

```text
Company -> Office -> Responsibility -> Grant -> RunGrant -> ExecutionSlice -> Agent -> Subagent -> Capability
```

Downstream Authority never widens.

```text
credential != Authority
capability != Authority
occupancy != Authority
provider permission != Authority
```

## Process / Continuum

Process is **Continuum + execution Settings**. There is no phantom wrapper.

Continuum owns institutional admission and durable consequence. Production writable Continuum requires Registry-backed identity. Embedded identity is explicit `identity_mode="embedded-test"` only.

## ExecutionSlice v3

Engines receive a sealed `powerfarm.execution-slice.v4`, derived from an executing Card.

It binds:

```text
card_ref
run_ref
attempt_ref
beat_ref
Authority / Direction refs
ECS digest
remaining resource budget
exact capability mapping
```

Provider session IDs, invocation IDs, tool-call IDs and engine IDs are provenance, not institutional identity.

## Three first-class engine Settings

```text
process/continuum-adk/       -> Google ADK 2.8.0
process/continuum-ai-sdk/    -> Vercel AI SDK 7.0.84
process/continuum-maf/       -> Microsoft Agent Framework 1.16.0
```

The permanent rule is:

> **ENGINE theirs. ORGAN ours. SETTING ours.**

All three consume the same Process-owned ExecutionSlice validation and must produce the same institutional meaning for the same attempt.

### Google ADK

Uses the ADK tool callback boundary. The model may propose a call; the tool cannot execute until Continuum admission succeeds.

### Vercel AI SDK

PowerFarm wraps locally executable AI SDK tools. Provider-executed tools without a local interception/admission boundary fail closed.

### Microsoft Agent Framework

PowerFarm uses MAF function middleware as the enforcement point. The sealed slice arrives in runtime kwargs; PowerFarm injects `run_ref`, Card/beat/attempt refs and remaining resource budget into `FunctionInvocationContext.kwargs` before the actual function executes.

**Microsoft memory is not PowerFarm MEMORY.** `AgentSession`, ContextProviders, workflows and engine memory remain execution-local. PowerFarm MEMORY may project read-only epistemic context into MAF. There is no implicit write-back.

## Engine equivalence

A pinned golden executes one sealed ExecutionSlice through all three Settings:

```text
                 ┌-> Google ADK ----------------┐
Card -> Slice ---+-> Vercel AI SDK ------------+-> same normalized Continuum meaning
                 └-> Microsoft Agent Framework -┘
```

Same `run_ref`. Same institutional request identities. Same Card/Direction/ECS binding. Same external-effect semantics. Runtime-specific metadata remains evidence only.

## Replay and recovery

The nasty case is effect succeeded, receipt vanished, worker retried.

PowerFarm uses Heartime beat identity + Process run state + Setting replay guard + stable external idempotency identity.

Same open beat is `ALREADY_IN_FLIGHT`. Completed attempt is `ALREADY_COMPLETED`. A new Heartime beat may legitimately resume the same attempt.

On Occupancy replacement:

```text
same CardRef
same run_ref
same attempt_ref
new OccupancyRef
new beat_ref
```

Process admits `run.takeover` / `run.resume`; Heartime reissues the obligation.

## Epistemic continuity

Memory distinguishes:

```text
OBSERVED · INFERRED · ASSUMED · REPORTED · UNKNOWN · CONTRADICTED
```

Observed facts require evidence. Inferences preserve their support. Unknowns stay visible until resolved. A multi-process golden proves occupant B can continue from a sealed Card after occupant A has completely terminated, without shared session memory.

## Energy and cost

Process authorizes. Platform measures. Heartime aggregates/enforces. Homeostasis interprets.

Energy is a vector:

```text
beats · model_tokens · tool_calls · network_calls
compute_ms · sandbox_ms · wall_ms · human_attention_ms
```

Money uses integer micros. Every Heartime emission costs a beat, including recovery.

## Operational tracing

Trace identity is derived from stable institutional refs rather than being inserted into Card v1 hashing. That preserves historical Card hashes while allowing observability to evolve.

The intended correlation spine is:

```text
Direction -> Card -> Beat -> Attempt -> Engine -> Tool -> Evidence -> Consequence
```

Tracing is best-effort. Observability does not gain Authority merely because it can see the organism.

## Production boundaries

Registry exposes read-oriented Office/Occupancy/key resolution and short-lived runtime credentials such as:

```text
pf.runtime.heartime
pf.runtime.process-writer
```

The public Process persistence boundary is `admit_card_batch_v2`, bound to `card_ref + beat_ref + attempt_ref + execution_slice_sha256`. The generic v1 writer is internal only.

## Database rule

```text
one organ -> one schema
```

Migrations are timestamped. Durable tables use RLS and attribution. Database capability does not imply institutional Authority.

## First Seam

The minimum cross-organ path connects canonical Cards, Registry Occupancy/runtime identity, Process admission, Platform execution, Evidence and Heartime state.

`Cards.listCurrent()` accepts only sealed canonical Card v1 carriers in production. Historical attention-shaped objects exist only in explicit test/migration fixtures.

## No legacy execution path

Current fail-closed behavior:

```text
ADK without ExecutionSlice -> reject
AI SDK without ExecutionSlice -> reject
MAF without ExecutionSlice -> reject
Continuum production without Registry -> reject
unsealed Card in First Seam -> reject
generic authenticated Process writer -> reject
```

Tests can have explicit harnesses. Production does not inherit their shortcuts.

## Repository map

```text
canon/          normative institutional definitions
contracts/      executable architectural contracts
circulation/    Cards and cross-organ movement
heartime/       beats, scheduling, sweeps, liveness
process/        Continuum + execution Settings
engines/        pinned/vendored external engine material
conformance/    release and boundary tests
evidence/       verification evidence
operations/     operational guidance
roster/         desired institutional organ coverage
```

If you want to know what the system **actually guarantees**, inspect `contracts/` and the conformance tests, not just prose.

## Debug from the Card

Start with `card_ref`, then follow:

```text
Card state
next_expected
beat_ref
attempt_ref
run_ref
OccupancyRef
ExecutionSlice digest
engine invocation
external effect
Evidence
Process consequence
```

The system is deliberately designed so you can reconstruct this chain without reading a model’s private runtime state.

## Invariants worth memorizing

```text
Registry owns identity reality.
Process owns Authority.
Platform executes.
Heartime circulates.
Memory preserves institutional knowledge.
Homeostasis interprets pressure.
Card is the carrier.
Office persists; Occupancy is replaceable.
Authority only narrows downstream.
Engine IDs are provenance, not institutional identity.
Every live Card has a future expectation or explicit blockage.
Observation != inference.
Retries cost energy.
No sealed ExecutionSlice -> no engine execution.
No Card -> no institutional circulation.
```

## Where to start

Read, in order:

1. `FOUNDERS-GUIDE.md`
2. `README.md`
3. `DOCUMENTATION.md`
4. `ENGINEER-QUICK-GUIDE.md`
5. `contracts/`

Then run:

```bash
npm run verify
```

If an architectural test becomes unhappy, resist the ancient ritual of weakening it first. Find out what invariant it is protecting. 🧙

The design target is not complexity. It is **durable meaning under change**.

Welcome aboard. 🫀🃏⚙️

---

Copyright © 2026 PowerFarm. All rights reserved.
