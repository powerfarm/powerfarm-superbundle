# PowerFarm Engineer Quick Guide

**Copyright © 2026 PowerFarm. All rights reserved.**

Welcome to PowerFarm.

If the Founder’s Guide explains **why the organism exists**, this document explains **where the important machinery is and how it fits together**.

The short version:

> **PowerFarm is an institutional runtime for transient human and machine intelligence.**

Agents execute.

Engines execute.

Workers crash.

Models change.

Providers change.

The institutional state must remain coherent.

That coherence is enforced through six organs, Cards, Heartime, Process admission, durable evidence, explicit authority, recovery semantics and strict execution boundaries.

Let’s tour the machine.

---

# 1. Global Shape

PowerFarm currently ships as two major bodies:

```text
powerfarm-registry
        +
powerfarm-superbundle
```

## `powerfarm-registry`

Standalone product responsible for institutional reference reality.

Owns:

```text
Identity
Office
Occupancy
Keys
OAuth
Brand
Store
Gadgets
Manifest lineage
Artifact provenance
Runtime identities
Directory RPCs
```

Registry answers:

```text
Who is this?
What Office is this?
Who occupied it at time T?
Which key represented this identity?
What artifact belongs to this lineage?
```

Registry does **not** own institutional Authority.

---

## `powerfarm-superbundle`

Contains the organism and execution stack:

```text
ACK
MEMORY
PROCESS
PLATFORM
HOMEOSTASIS

Heartime
Cards

Continuum
ADK Setting
AI SDK Setting
contracts
conformance
circulation
evidence
engine boundaries
production adapters
```

The Super Bundle is where institutional work moves.

---

# 2. The Six Organs

PowerFarm models the institution as six organs.

```text
REGISTRY
ACK
MEMORY
PROCESS
PLATFORM
HOMEOSTASIS
```

Each organ owns a semantic domain.

That ownership matters.

We strongly avoid “shared mutable meaning.”

## Registry

Durable identity and reference truth.

Think:

```text
IdentityRef
OfficeRef
OccupancyRef
KeyRef
ManifestRef
```

---

## ACK

Reception and acknowledgement.

ACK closes loops.

It answers questions such as:

```text
Was this obligation received?
Was this signal acknowledged?
Did the expected receiver observe delivery?
```

ACK should not silently become a workflow engine.

---

## Memory

Durable knowledge and evidence context.

Memory distinguishes:

```text
OBSERVED
INFERRED
ASSUMED
REPORTED
UNKNOWN
CONTRADICTED
```

This is intentional.

A model inference is not automatically institutional truth.

---

## Process

Institutional admission and consequence.

Process owns things like:

```text
Direction
Responsibility
Authority
Grant
RunGrant
Run
admission
delegation
takeover
resume
finish
failure
consequence
```

Continuum lives here.

---

## Platform

Execution machinery.

Examples:

```text
LLM engines
tools
sandboxes
network capabilities
providers
ADK
AI SDK
future runtimes
```

Platform answers:

> How can this action be executed?

Not:

> Is the institution allowed to execute it?

---

## Homeostasis

System health and pressure.

Relevant projections include:

```text
cost burn
energy remaining
retry pressure
circulatory age
evidence latency
stale claims
blocked Cards
orphaned Cards
engine failures
deadline pressure
```

Homeostasis interprets.

It does not create Authority.

---

# 3. Heartime

Heartime is not a seventh organ.

Heartime is circulation.

It owns the mechanics that keep institutional work alive through time:

```text
priority
deadline
next_expected
next_sample
beat
retry
wake
defer
reconcile
liveness
preemption
circulatory pressure
```

The important split is:

```text
Process  → Is this institutionally admissible?
Heartime → Is this currently circulable?
```

Process outcomes:

```text
ALLOW
DENY
CHALLENGE
ESCALATE
```

Heartime outcomes:

```text
CIRCULATE
DEFER
BLOCK
RECONCILE
```

Do not merge these.

They look similar right up until they ruin your authority model. 🙂

---

# 4. Cards

Cards are the canonical unit of institutional circulation.

```text
powerfarm.card.v1
```

A Card is not just a task payload.

It binds together the references required for durable work:

```text
CardRef
OfficeRef
OccupancyRef
DirectionRef
AuthorityRef
RunRef
ECS digest
circulation state
evidence refs
epistemic state
energy budget
cost state
lineage
```

Cards are content-addressed.

Snapshots are immutable.

Changes happen through attributed patches.

---

# 5. Card Mutation Rules

An organ does not get to rewrite the whole Card.

It produces a `CardPatch`.

Conceptually:

```text
Card before
    +
organ identity
    +
CardPatch
    ↓
ownership validator
    ↓
Card after
```

Examples:

```text
Registry
  may update identity / occupancy refs

Process
  may update Authority / Run / Direction semantics

Platform
  may append execution evidence

Memory
  may append epistemic records

Heartime
  may update circulation state / next_expected / beats

Homeostasis
  may publish health projections
```

A subsystem writing outside its namespace fails closed.

That rule is doing a lot of architectural work.

---

# 6. Card Lifecycle

A simplified Card circulation lifecycle:

```text
prepared
   ↓
emitted
   ↓
acknowledged
   ↓
executing
   ↓
evidence_pending
   ↓
settled
```

Additional states include:

```text
deferred
blocked
challenged
orphaned
reconciling
failed
terminal
```

Transitions have deterministic identities.

Replay of the same transition must be idempotent.

Incompatible transitions fail closed.

---

# 7. `next_expected` Is a Liveness Invariant

Every live Card must either have:

```text
next_expected
```

or an explicit reason why normal future progression is impossible.

Heartime sweeps can therefore detect:

```text
live Card with no next expectation
emitted but unacknowledged
execution with no progress
evidence overdue
stale observation
orphaned occupancy
expired authority
budget exhaustion
terminal run still circulating
```

This makes liveness observable instead of philosophical.

---

# 8. Authority Model

Authority descends monotonically:

```text
Company
  ↓
Office
  ↓
Responsibility
  ↓
Grant
  ↓
RunGrant
  ↓
ExecutionSlice
  ↓
Agent
  ↓
Subagent
  ↓
Capability
```

The core rule:

> **Downstream Authority must never widen.**

Also:

```text
credential != Authority
capability != Authority
occupancy != Authority
provider permission != Authority
```

This distinction is non-negotiable.

---

# 9. Continuum

Continuum is the Process kernel.

It provides institutional admission and durable evidence around acts.

It handles concepts such as:

```text
institution
timeline
act
causal relation
signature
witness
checkpoint
receipt
run.start
run.resume
run.takeover
run.finish
run.fail
```

Production Continuum requires Registry-backed identity resolution.

Embedded identity exists only through an explicit test profile.

There is no silent “development fallback” in production mode.

---

# 10. ExecutionSlice

Engines do not receive loose institutional state.

They receive a sealed projection:

```text
ExecutionSlice
```

Current contract:

```text
ExecutionSlice v3
```

It contains the execution-relevant projection of the Card.

Typical fields include:

```text
card_ref
run_ref
attempt_ref
beat_ref
authority refs
Direction refs
ECS digest
remaining resource budget
execution provenance
```

The ExecutionSlice is engine-neutral.

That means:

```text
same Card
same institutional attempt
different engine
same run_ref
```

Provider invocation IDs do not define institutional identity.

Neither do:

```text
session IDs
tool-call IDs
model IDs
engine IDs
occupant IDs
```

Those are provenance.

Not identity.

---

# 11. Engines

Two execution Settings currently exist.

## ADK Setting

Google ADK integration.

Boundary rule:

> ADK spends Authority. ADK does not create Authority.

---

## AI SDK Setting

Vercel AI SDK integration.

The upstream SDK is treated as external engine code.

PowerFarm wraps it through an institutional boundary.

Upstream semantics are not allowed to leak upward and become constitutional semantics.

---

# 12. Engine Equivalence

We actively test this:

```text
Card
  ↓
ExecutionSlice
  ↓
 ┌───────────┐
 │           │
ADK       AI SDK
 │           │
 └─────┬─────┘
       ↓
same institutional transcript
```

The engines may have different internal telemetry.

They may have different providers.

They may structure tool execution differently.

But PowerFarm requires equivalence for:

```text
run identity
request identity
Card binding
Authority binding
Direction binding
attempt semantics
external-effect semantics
institutional consequence
```

---

# 13. Replay Protection

The ugly failure mode:

```text
external effect succeeds
        ↓
receipt gets lost
        ↓
worker retries
        ↓
external effect happens again 😬
```

PowerFarm defends against this at several layers:

```text
Heartime beat identity
Process run state
engine boundary replay guards
stable external idempotency key
```

Same beat:

```text
ALREADY_IN_FLIGHT / completed
```

New Heartime beat:

```text
legitimate reentry
```

These are intentionally different.

---

# 14. Recovery and Occupancy Takeover

Runs belong institutionally to the obligation and Office.

Not to the worker process.

Example:

```text
Office A
Occupancy X
    ↓
Card executing
    ↓
X disappears
    ↓
Registry now says Occupancy Y
```

Heartime detects stale occupancy.

The Card moves through:

```text
orphaned
   ↓
reconciling
```

Process may admit:

```text
run.takeover
run.resume
```

Then Heartime emits a new beat.

Important identities behave like this:

```text
same CardRef
same run_ref
same attempt_ref

new beat_ref
new OccupancyRef
```

That is intentional.

---

# 15. Epistemic Continuity

PowerFarm does not treat model context as institutional memory.

Epistemic records are explicit.

Examples:

```text
OBSERVED
  "supplier API returned delayed"
  evidence_ref: ...

INFERRED
  "shipment likely arrives tomorrow"
  based_on: [...]

UNKNOWN
  "customs clearance status"

CONTRADICTED
  previous_claim_ref: ...
  evidence_ref: ...
```

Records are content-addressed.

Observed facts require evidence.

Inferences require support.

Unknowns remain visible until explicitly resolved.

---

# 16. Cross-LLM Continuity

One of the important goldens literally uses separate processes:

```text
LLM A
  ↓
observe
record evidence
record uncertainty
next_sample
terminate

[process gone]

LLM B
  ↓
receives sealed Card
reconstructs epistemic state
observes world again
records delta
```

No shared closure.

No private session state.

No previous context window.

That is the target.

---

# 17. Energy and Cost

Cards can carry bounded resource authorization.

Energy is a vector:

```text
beats
model_tokens
tool_calls
network_calls
compute_ms
sandbox_ms
wall_ms
human_attention_ms
```

Money is tracked separately using integer micros.

Ownership:

```text
Process
  authorizes budget

Platform
  measures consumption

Heartime
  aggregates and blocks exhaustion

Homeostasis
  interprets pressure
```

Every Heartime emission costs one `beat`.

Recovery is not free.

Retries are not free.

That is deliberate.

---

# 18. Homeostatic Signals

Homeostasis can derive signals such as:

```text
burn_rate
energy_remaining
cost_remaining
circulatory_age
retry_pressure
stale_claim_count
evidence_latency
cost_per_progress
blocked_card_count
```

A particularly interesting signal is:

```text
circulatory_debt
```

Roughly:

> resources being consumed without proportional progress, knowledge or consequence.

Very useful when agents become impressively busy doing absolutely nothing. 🫠

---

# 19. Operational Tracing

Operational tracing is derived from stable institutional refs.

Conceptually:

```text
CardRef
  ↓
TraceRef
  ↓
BeatRef
  ↓
AttemptRef
  ↓
Engine invocation
  ↓
Tool
  ↓
Evidence
```

Tracing is not part of Card v1 hashing.

That was deliberate to keep historical Card hashes stable.

Instead:

```text
TraceRef = deterministic(CardRef)
```

Observability can evolve without rewriting institutional history.

---

# 20. Production Registry Boundary

Production Process uses real RegistryDirectory implementations.

Registry exposes read-oriented resolution for:

```text
Office
Occupancy
Keys
historical bindings
```

Runtime credentials are short-lived and subject-specific.

Examples:

```text
pf.runtime.heartime
pf.runtime.process-writer
```

Bindings are physically separated.

The caller does not choose arbitrary runtime identity in the payload.

That is a useful small security detail.

---

# 21. Process PostgreSQL Writer

Production persistence uses a dedicated Process writer.

Current public admission boundary:

```text
admit_card_batch_v2
```

It requires binding to:

```text
card_ref
beat_ref
attempt_ref
execution_slice_sha256
```

The older generic admission writer is internal only.

Authenticated callers cannot bypass Card circulation and write an “already admitted” batch directly.

That enforces:

> **No Card → no institutional circulation.**

---

# 22. Database Layout

PowerFarm follows:

```text
one organ
    ↓
one schema
```

Database migrations are timestamped.

Tables use RLS and attribution such as:

```text
created_by
```

Production writers are intentionally narrow.

Security-definer functions exist only where the boundary requires them.

A database capability does not imply institutional Authority.

Same rule, different layer.

---

# 23. First Seam

The First Seam is the minimum cross-organ execution path.

It connects things like:

```text
Cards
Registry Occupancy
Registry runtime identity
Process authority
Platform execution
Evidence
Heartime state
```

A key current invariant:

```text
Cards.listCurrent()
```

returns only sealed:

```text
powerfarm.card.v1
```

Legacy attention-shaped objects are not accepted in production.

WakePack is a projection.

It remains bound to the source Card hash.

---

# 24. No Legacy Execution Path

As of the current architecture:

```text
AI SDK without ExecutionSlice → reject
ADK without ExecutionSlice    → reject
Continuum production without Registry → reject
unsealed Card in First Seam   → reject
generic authenticated batch writer → reject
```

This is intentional.

Tests may use explicit test harnesses.

Production does not quietly inherit their shortcuts.

---

# 25. Repository Map

A rough Super Bundle map:

```text
canon/
    normative institutional definitions

contracts/
    executable architectural contracts

circulation/
    Card movement and cross-organ edges

heartime/
    scheduler, beats, sweeps, circulation control

process/
    Continuum and execution Settings

engines/
    vendored/pinned external engine code

conformance/
    release and boundary tests

evidence/
    verification evidence

operations/
    operational guidance

roster/
    desired institutional organ coverage
```

Registry is separate and has its own app, migrations, identity system, Store and brand surfaces.

---

# 26. Contracts Are Executable Architecture

If you are trying to understand what the system **actually guarantees**, look at:

```text
contracts/card.*
contracts/execution-slice.*
contracts/recovery.*
contracts/epistemic-continuity.*
contracts/energy-cost.*
contracts/production-circulation.*
contracts/legacy-removal.*
```

The Markdown explains intent.

The JSON/contracts/tests enforce it.

The conformance suite decides whether the release still means what the docs claim.

---

# 27. Goldens Matter

PowerFarm uses vertical goldens for important properties.

Current families cover:

```text
basic Card circulation
AI SDK execution
engine equivalence
recovery
cross-occupant continuity
energy/cost exhaustion
production circulation
```

When changing a boundary, do not update a golden fixture casually.

A golden mismatch may be telling you that you changed institutional meaning.

That has already caught real architectural mistakes.

---

# 28. The Fastest Way to Debug PowerFarm

When something fails, follow the references.

Start with:

```text
card_ref
```

Then ask:

```text
What is the current Card state?

What is next_expected?

What beat emitted it?

What attempt owns the work?

What run_ref did Process admit?

Which Occupancy was current?

What ExecutionSlice was sealed?

Which engine consumed it?

What external effect occurred?

What evidence returned?

What consequence did Process record?
```

PowerFarm is intentionally designed so this chain can eventually be reconstructed without reading a model’s hidden runtime state.

---

# 29. Engineer Invariants Worth Memorizing

```text
Registry owns identity reality.

Process owns Authority.

Platform executes.

Heartime circulates.

Memory preserves institutional knowledge.

Homeostasis interprets pressure.

Card is the circulating carrier.

Engine IDs are provenance, not institutional identity.

Office persists.

Occupancy is replaceable.

Authority only narrows downstream.

Every live Card has a future expectation or explicit blockage.

Every external effect belongs to a Card / run / attempt.

Same beat cannot produce the same external effect twice.

A new beat may resume the same institutional attempt.

Observation != inference.

Cost is bounded.

Retries cost energy.

No sealed ExecutionSlice → no engine execution.

No Card → no institutional circulation.
```

If a change violates one of these, expect an architectural conversation before a pull request. 🙂

---

# 30. Where to Start as a New Engineer

For architecture:

```text
FOUNDERS-GUIDE.md
README.md
DOCUMENTATION.md
contracts/
```

For circulation:

```text
circulation/
heartime/
contracts/card.*
```

For institutional execution:

```text
process/
process/continuum/
process/continuum-adk/
process/continuum-ai-sdk/
```

For identity:

```text
powerfarm-registry/
```

For “does this change violate something important?”:

```text
conformance/
```

And before merging anything structural:

```text
npm run verify
```

If that command becomes unhappy, resist the ancient engineering ritual of immediately weakening the test. 🧙

First figure out what invariant it is protecting.

---

# 31. Mental Model

If you remember nothing else, remember this pipeline:

```text
WORLD
  ↓
observation
  ↓
Card
  ↓
Heartime
  ↓
Process admission
  ↓
ExecutionSlice
  ↓
Platform / Engine
  ↓
external effect
  ↓
Evidence
  ↓
Process consequence
  ↓
Card update
  ↓
Heartime
  ↓
next_expected
  ↓
future occupant
```

And surrounding all of it:

```text
Registry
    provides identity reality

Memory
    preserves what was learned

Homeostasis
    watches whether the organism is healthy
```

That is the machine.

Everything else is implementation detail, until it proves it deserves to become architecture.

---

# 32. Welcome to the Engine Room

PowerFarm has a lot of moving parts, but the design goal is not complexity.

The design goal is **durable meaning under change**.

A worker can crash.

A model can be replaced.

An engine can be swapped.

An Occupancy can change.

A tool can retry.

A process can restart.

A claim can become stale.

A provider can disappear.

The institution should still know:

```text
what happened
why it happened
who was responsible
what was authorized
what remains unresolved
what it cost
what happens next
```

If your code helps preserve those answers, you are probably working in the right layer.

Welcome aboard. ⚙️🃏🫀