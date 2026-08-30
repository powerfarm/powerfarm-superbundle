# POWERFARM FIRST SEAM

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Proposals` · **PROPOSAL**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

## Heartime + Cards + Reconciliation

**Status:** permanent v1 foundation implemented locally; organ bindings not deployed  
**Starting point:** `organism-main.zip`, inspected 2026-08-23  
**Normative language:** MUST, SHOULD, MAY  
**Relationship to canon:** this proposal is governed by *PowerFarm: Organism and Organization*. It does not become canon merely by existing.

---

## How to use this document

This document defines the permanent v1 foundation of the first real circulation seam and records the execution directive used to build it from the supplied `organism-main` repository. It is not a disposable implementation plan. Provider settings may be replaced; the seam semantics and conformance obligations are intended to persist.

The First Seam is permanent infrastructure, not a throwaway experiment. It is the first permanent boundary pattern that later seams must be able to copy without replacing its semantic identities. Provider settings may be replaced; the v1 contract and institutional lineage survive them.

The work has two ordered phases:

```text
PHASE A
make the starting repository truthful and internally consistent

PHASE B
build one complete vertical seam
```

Phase B MUST NOT begin while Phase A leaves the repository describing a different institution or a different implementation state from the one that actually exists.

The governing discipline is inherited from Document 1:

```text
what does not exist is named as not built
what was not run is named as not run
a claim enters only when it can fail
engines provide mechanism
PowerFarm retains meaning
```

## Current implementation account

The repair directive below records the state of the supplied ZIP at task entry.
It is retained as lineage, not as a claim about the repository after this work.

```text
BUILT AND VERIFIED LOCALLY
  complete Document 1 and derived release account
  permanent First Seam v1 machine contract
  portable level-triggered attention controller
  stale-generation, duplicate-wake and occupancy-succession behavior
  roster desired-state planner
  physical Heartime Durable Object setting
  PostgREST Heartime state adapter and Registry-owned runtime-token port
  private Service Binding settings
  two timestamped Heartime migrations with structural verification

BUILT, NOT DEPLOYED
  PostgreSQL First Seam state
  Cloudflare physical wake
  attention Worker setting

NOT RUN
  production migrations
  real Cards / Registry / Process / Platform / Evidence target ports
  deployed destructive failure suite
  whole-system test
```

---

# 0. Executive decision

The First Seam is:

```text
HEARTIME
    wakes a reconciler
        ↓
ATTENTION RECONCILER
    reads current durable state
        ↓
CARDS
    compile current attention as a WakePack
        ↓
OCCUPANCY
    human, LLM, or client-facing actor receives a projection
        ↓
RESPONSE / ABSTENTION / EVIDENCE
    is written durably
        ↓
RECONCILIATION
    observes the changed state
        ↓
HEARTIME
    derives when something must look again
```

The First Seam is **not**:

```text
Heartime sends Card payload
    ↓
consumer consumes message
    ↓
consumer replies on another channel
    ↓
next consumer receives reply
```

That would be a message bus wearing anatomical vocabulary.

The central laws are:

> **Heartime does not deliver work. Heartime causes the institution to reconcile itself.**

> **Cards are durable attention resources. They are not authoritative job messages.**

> **Events make reconciliation fast. Durable state makes reconciliation correct.**

> **If every event transport disappears, a Heartime sweep MUST reconstruct every unresolved obligation from durable state.**

This is Kubernetes-like in control-loop structure without requiring Kubernetes as a deployment substrate.

---

# PART I - REPAIR THE STARTING POINT

The statements in Part I describe the supplied starting snapshot. The repairs
are now represented by the repository history and verification evidence; this
section remains to explain why each permanent change exists.

# 1. Restore the complete Document 1

The repository copy at:

```text
canon/01-organism-and-organization.md
```

is 1,386 lines. The supplied complete source is 1,740 lines.

The repository copy omits constitutional material that the complete document explicitly says cannot be inferred or replaced downstream.

Before implementing the seam, restore the complete source, including:

- Part 0, *The Company*;
- the individual at the centre;
- the dual invariant of absence and return;
- removal of obligation without removal of agency;
- journalism as the work;
- revenue as undecided rather than silently assumed;
- the cost function;
- the Lab;
- the refusal to race general platforms with better-funded natural owners;
- Compression and Amplification;
- the second half of the whole-system test;
- negative controls 48 through 59;
- the corresponding Appendix entries.

The restored document MUST preserve this distinction:

```text
NOT REQUIRED of the individual
!=
NOT PERMITTED to the individual
```

The First Seam must make the company capable of operating during the individual's absence without making the individual an outsider when they return.

## 1.1 Resolve the `Card` terminology collision

Within this proposal and implementation:

```text
Card
=
PowerFarm Cards 1.0 attention object
```

A Card means that something may deserve another intelligence's notice.

It does not mean an executable implementation of an ISA instruction.

Any inherited Superstructure v0.3 language using `Card` for executable competence MUST be treated as stale terminology. Use a term such as:

```text
Capability Implementation
Instruction Implementation
Executable Competence
```

Do not alter Cards 1.0 to accommodate the older collision.

---

# 2. Make every repository account derived

At task entry, the repository contained stale authored facts:

- `canon/01.release.json` describes the 1,386-line version;
- `conformance/README.md` says Document 1 has 36 controls;
- the complete document has 59 controls;
- the Appendix says Heartime is not built even though its pure logic, migration, structural checks, and tests exist;
- release counts and hashes are manually recorded.

Create deterministic tooling that derives, at minimum:

```text
document lines
bytes
sha256
section count
subsection count
negative control count
executable negative control count
Heartime deterministic test count
Heartime migration structural check count
```

The generated release account MUST be reproducible from repository contents.

The final status vocabulary is:

```text
BUILT AND VERIFIED
BUILT, NOT DEPLOYED
DESIGNED, NOT BUILT
NOT RUN
FAILED
```

`NOT RUN` MUST never be translated into `PASS`.

The expected Heartime account at task entry, before this proposal was executed,
was approximately:

```text
pure scheduling logic         BUILT AND VERIFIED
migration                     BUILT AND STRUCTURALLY VERIFIED
production migration          NOT RUN
physical wake engine          DESIGNED, NOT BUILT
roster desired state          BUILT
roster reconciliation         DESIGNED, NOT BUILT
circulation                   DESIGNED, NOT BUILT
```

The current account is the derived release and implementation report, not this
historical block.

---

# 3. Make the roster truly desired state

The repository declares:

```text
roster/organs.json
=
desired state reviewed in Git
```

and:

```text
heartime.organs
=
observed/materialized state
```

But the Heartime genesis migration also contains a static copy of the roster.

That duplication MUST be removed as the ongoing source of membership.

Implement a deterministic roster reconciler:

```text
Git roster
    ↓
compare
    ↓
heartime observed roster
    ↓
create / update / retire
    ↓
record reconciliation evidence
```

Retirement MUST preserve lineage. It MUST NOT destructively erase historical membership or beats.

The genesis migration MAY create schema and bootstrap machinery. It MUST NOT require every future roster revision to be copied into SQL.

## 3.1 Remove hardcoded personal bootstrap

The current migration seeds `created_by` by locating one named person.

Remove this dependency.

Bootstrap MUST resolve an authenticated canonical IdentityRef through Registry semantics or through an explicit deployment input whose identity is recorded.

A display name MUST NOT be infrastructure identity.

## 3.2 Normalize canonical identifiers

The repository currently mixes identifier shapes such as:

```text
pf.organ.registry
pf://office/...
pf://capability/...
```

Before the First Seam persists cross-system references, identify the applicable canonical naming rule.

Do one of the following deliberately:

1. migrate to the canonical syntax with explicit aliases for legacy identifiers; or
2. preserve the current syntax temporarily and document the canonicalization boundary.

Do not create a third syntax.

A Cloudflare Worker name, preview URL, database primary key, or Service Binding name MUST NOT become the institutional identity.

---

# 4. Correct the meaning of cadence

The canon says the heart does not run at a fixed rate.

The current roster declares:

```text
cadence_minutes
```

and the implementation uses it as an upper bound combined with the freshness window.

Determine and document its real meaning.

If it means a freshness or maximum silence contract, rename it to something like:

```text
freshness_minutes
max_silence_minutes
health_slo_minutes
```

The roster declares a constraint.

Heartime derives the actual next wake from current evidence and deadlines.

Do not preserve vocabulary that makes a derived schedule look like a metronome.

---

# 5. Make the parallel-power account honest

The pure Heartime logic detects unattributed Effects conceptually.

The current SQL view mainly examines beats.

That is not yet the complete detector described in Document 1.

A real parallel actor is discovered from the traces it leaves while acting:

```text
Effect Store
runs
provider effects
database writes
credential use
created_by
run_id
BeatRef
OccupancyRef
GrantRef
```

Before claiming parallel-power detection as built:

1. inspect the actual public surfaces of Platform Effect Store, Process runs, and provenance;
2. implement a detector over real effects; or
3. label the current view explicitly as a partial Heartime-attribution check.

Do not claim that checking beats proves attribution of all action.

The governing law remains:

> **Not everything must be scheduled. Everything must be attributable.**

---

# 6. Remove the known-invalid edge

The repository records one existing edge:

```text
Platform -> Registry
hardcoded Vercel preview URL
```

This edge violates the repository's own naming rule.

Repair or remove it before adding the First Seam.

Preferred mechanism when both services are Cloudflare Workers:

```text
Cloudflare Service Binding
```

This avoids a publicly accessible preview URL and allows direct Worker-to-Worker invocation.

However:

```text
Service Binding name
!=
PowerFarm identity
```

The PowerFarm identity remains explicit above the provider binding.

Cloudflare Access context also MUST NOT be assumed to propagate across Service Bindings. The downstream call requires explicit PowerFarm identity and authority context.

If a Service Binding is not available for the actual deployment topology, resolve a stable endpoint through Registry or another existing canonical resolution mechanism.

A known-invalid preview URL MUST NOT remain merely because the replacement is not ready.

---

# PART II - DEFINE THE FIRST SEAM

# 7. The four participants

The seam has four participants with distinct ownership.

## 7.1 Heartime

Heartime is institutional perfusion.

It:

- derives when something must look again;
- writes deadlines on emission;
- wakes reconciliation machinery;
- verifies liveness;
- tightens under `UNKNOWN`;
- admits authenticated sympathetic signals;
- decays adrenaline;
- provides anti-entropy sweeps;
- records attributed beats.

Heartime MUST NOT carry the Card body, prompt, LLM context, or business operation payload.

A physical wake may identify only what is required to cause reconciliation, for example:

```text
BeatRef
ReconcilerRef
reason
deadline
optional resource hint
```

A resource hint is not authoritative state. The reconciler fetches current state after waking.

## 7.2 Cards

Cards preserve attention.

A canonical Card MAY be projected to:

- an LLM occupancy;
- the individual;
- another human;
- an Office;
- an external client.

The projection changes. The canonical Card identity does not.

A Card is not:

- Knowledge;
- Evidence;
- Authority;
- a Process Commit;
- a Capability;
- a workflow execution;
- a notification copy;
- a queue message.

Receiving a Card MUST NOT create authority.

## 7.3 WakePack

WakePack is the current read model for a waking recipient.

It is compiled from current attention under:

```text
recipient identity
Office / Occupancy
attention budget
ranking policy
current time
current Card state
```

It preserves:

- explicit budget;
- deterministic ranking;
- persisted selection rationale;
- the reason each Card was selected.

WakePack MUST NOT become a stale job package stored in a queue and consumed later as if it were current truth.

A historical WakePack MAY be retained as evidence of what was shown at a particular time.

## 7.4 Attention reconciler

The attention reconciler is the edge.

It is not a seventh organ.

It belongs in:

```text
circulation/attention/
```

or an equally explicit boundary location.

It MUST remain small and stateless enough that its durable meaning lives in the systems it connects.

It:

1. resolves the current recipient scope;
2. queries current Cards state;
3. compiles or requests a current WakePack;
4. observes whether an eligible Occupancy already has an active attempt;
5. starts the smallest lawful attempt when required;
6. observes durable response, abstention, or failure;
7. writes only through the public surfaces of owning systems;
8. derives when it must look again.

It MUST NOT:

- decide institutional truth;
- promote Knowledge;
- issue Grants;
- own Identity;
- become the agent runtime;
- become Cards;
- become Heartime;
- execute arbitrary Platform capabilities itself.

---

# 8. A reconciliation contract, not an envelope

The real cross-boundary contract is not a universal message.

It is a reconciliation contract that answers:

```text
what current state is observed?
what condition is declared?
who owns each side?
what is the smallest lawful correction?
what evidence proves the new observation?
when must the controller look again?
```

The first contract MAY be named:

```text
pf://reconciliation/attention
```

subject to the canonical naming decision in Phase A.

The contract SHOULD define, conceptually:

```text
ReconcilerRef
scope / recipient selector
Card query or attention-space reference
freshness / maximum silence
current generation or revision semantics
response observation semantics
idempotency key derivation
next-observation rule
failure disposition
```

Do not create a universal `PowerFarmMessage`, `OrganismEnvelope`, or `ReturnEnvelope`.

A provider-specific RPC request may exist as mechanism. It is not a new institutional primitive.

---

# 9. Desired and observed attention

The seam requires a distinction equivalent to Kubernetes `spec/status`, but it SHOULD map onto Cards 1.0 rather than replacing it.

Inspect the actual Cards SDK, CLI, OpenAPI, migrations, and tests before designing schema changes.

The implementation must be able to determine at least:

```text
CardRef
Card semantic revision / generation
attention target or eligible recipient scope
why it matters
ranking and rationale
whether any response is requested
response contract
expiry / freshness
current response state
EvidenceRefs
```

A response contract MAY include:

```text
none
acknowledge
answer
investigate
choose
abstain
act
```

Not every Card is a task.

Attention may be satisfied by reading, acknowledgement, an answer, an abstention, or a separate action whose authority comes from Process.

## 9.1 Observed generation

Every response MUST identify the Card generation or semantic revision it observed.

If a Card materially changes from generation `N` to `N+1` while an intelligence is working:

```text
response to N
remains attributable to N
but MUST NOT silently satisfy N+1
```

This may use a field named `observed_generation`, `observed_revision`, or an existing equivalent.

The name is secondary. The invariant is mandatory.

## 9.2 Retention boundaries

Preserve Document 1's separate lifecycles:

```text
ATTENTION
may expire

CONSEQUENCE
is append-only

KNOWLEDGE
is revised with lineage
```

A Card MAY expire without deleting the historical WakePack or response that proves it was once shown.

A Card response MUST NOT become a Process Commit merely because it exists.

A Card MUST NOT become Knowledge merely because it is persuasive.

---

# 10. The controller loop

The first attention controller operates as a level-triggered loop.

Conceptually:

```text
reconcile(scope)

1. resolve current scope, Office, and Occupancy
2. read current unresolved Cards
3. compile current WakePack
4. inspect durable attempt/run state
5. if no work is due:
       report healthy observation
       derive next look
       stop
6. if work is due and no eligible attempt exists:
       create one idempotently through Platform
       stop
7. if an attempt exists but is running:
       observe it
       derive next look
       stop
8. if the worker died and attention remains unresolved:
       make the obligation eligible for succession
       stop
9. if a durable response exists:
       attach it to the observed Card generation
       reference Evidence / Run / Occupancy
       derive the new attention condition
       stop
10. repeat on a later wake
```

The controller MUST NOT remain alive merely to preserve progress.

Every pass may end.

The next pass reconstructs current reality from durable state.

This is the seam's primary Kubernetes property.

## 10.1 Idempotency

The controller MUST derive stable idempotency keys from durable semantic inputs, such as:

```text
CardRef
Card generation
recipient scope
response contract
```

A duplicate wake MUST NOT create duplicate canonical responses, runs, effects, or Cards.

At-least-once physical execution is expected.

Exactly-once delivery MUST NOT be assumed.

## 10.2 Worker death

Seeing a Card is not consuming it.

Starting a run is not resolving it.

If a worker dies after WakePack compilation but before a durable response:

```text
the attention obligation remains unresolved
```

A later reconciliation may assign a successor Occupancy.

The Office, Card, response requirement, and history survive the original model session.

---

# 11. Authority and affordances

A Card may describe or expose possible affordances.

Effective affordances are derived from current institutional context.

Conceptually:

```text
Card
+
recipient Identity
+
Office / Occupancy
+
Responsibility
+
Grant
+
current policy / context when available
=
effective affordances
```

The First Seam does not need to build a universal policy engine.

It does need to fail closed.

If Process or Registry cannot currently prove authority, the projection MUST show the affordance as unavailable.

A machine-facing refusal SHOULD be resolvable when a lawful resolution exists:

```text
state: unavailable
reason: authority_required
missing: <requirement>
next: request_authorization | propose_responsibility | none
```

Do not confuse:

```text
DENY
not permitted

CHALLENGE
additional evidence or authentication may satisfy the boundary

ESCALATE
a different authority must decide

UNKNOWN
current information is insufficient
```

A Card's salience never grants permission.

---

# 12. Same Card, multiple species

The First Seam must prove that one Card can be resolved for different recipients without becoming different institutional objects.

At minimum, create projection contract tests for:

```text
LLM projection
human projection
external client projection
```

All three MUST expose:

```text
same CardRef
same semantic generation
same evidence spine
```

They MAY differ in:

- wording;
- layout;
- context depth;
- affordance presentation;
- explanation;
- language;
- client-specific relevance.

The canonical Card storage format does not need to be pleasant for humans.

Human readability is a projection property.

---

# PART III - USE EXISTING ENGINES

# 13. Physical Heartime engine

Use an existing engine for physical wake.

## 13.1 Preferred setting: Cloudflare Durable Object Alarm

The repository already identifies a Durable Object alarm as the missing physical Heartime mechanism.

This is a strong fit because:

- Heartime already computes the next deadline;
- a Durable Object can schedule a future wake programmatically;
- the alarm handler is executed at least once;
- failed alarm handlers are retried automatically;
- one alarm can be used to manage multiple due events by storing a schedule and selecting the next deadline.

Required boundary:

```text
PowerFarm owns
    Heartime semantics
    Beat identity
    deadlines
    roster
    reconciliation contracts
    evidence meaning

Cloudflare owns
    physical wake
    runtime placement
    retry mechanism
```

The Durable Object MUST NOT become canonical Heartime storage.

Canonical state remains in PostgreSQL.

The Durable Object may retain replaceable scheduling state, but a fresh instance MUST be able to reconstruct the next alarm from PostgreSQL.

The `alarm()` path is at-least-once. Therefore all downstream work MUST be idempotent.

The implementation must also account for the engine's finite automatic retry policy. A prolonged downstream outage MUST result in a new durably scheduled obligation rather than silent exhaustion of platform retries.

## 13.2 Logical physical-wake flow

```text
alarm fires
    ↓
load current Heartime state
    ↓
run level-triggered sweep
    ↓
record attributed Beat
    ↓
invoke due reconciler(s)
    ↓
observe durable results or due state
    ↓
recompute earliest next deadline
    ↓
set next alarm
    ↓
sleep
```

A fixed Cron Trigger MUST NOT become the primary heart.

A coarse cron MAY later serve as an emergency defibrillator that verifies the alarm machinery is still armed, but it is not the normal rhythm.

---

# 14. Internal service calls

## 14.1 Preferred setting: Cloudflare Service Bindings

For Worker-to-Worker calls within the same Cloudflare account, use Service Bindings when the actual deployment topology supports them.

They provide direct Worker-to-Worker calls without a publicly accessible URL and are suitable for independently deployed services.

Use them to replace preview URLs and public internal hops.

Do not adopt their binding names as institutional identity.

Do not assume caller authentication propagates automatically. PowerFarm IdentityRefs, OccupancyRefs, ResponsibilityRefs, and GrantRefs remain explicit.

## 14.2 Database connection setting: evaluate Hyperdrive

If the Heartime Worker or attention reconciler connects directly from Cloudflare Workers to Supabase PostgreSQL, evaluate Cloudflare Hyperdrive as a connection and pooling setting.

Adopt it only if it materially improves connection handling without taking semantic ownership.

State-critical reconciliation reads MUST NOT be served from unsafe stale caches. Disable or bypass query caching for reads whose freshness determines action.

PowerFarm continues to own:

```text
schema
transactions
RLS
created_by
idempotency
institutional meaning
```

Hyperdrive, if adopted, owns connection mechanism only.

## 14.3 Runtime Identity: Registry-issued, short-lived

Permanent Heartime MUST NOT depend on an immortal user session, a manually copied JWT, or the Supabase service-role key.

The default setting requests a short-lived access token from a Registry-owned Service Binding port:

```text
powerfarm.registry.runtime-token.v1
issueRuntimeToken
```

The request names:

```text
subject_ref = pf.runtime.heartime
audience    = powerfarm.supabase.postgrest
minimum TTL
```

Registry owns durable Identity and token policy. Cloudflare transports the RPC. Supabase validates the resulting access token and supplies RLS context.

The Worker caches the token only while safely fresh, invalidates it on HTTP 401 and refreshes once. A static bearer MAY exist only as an explicitly enabled local fallback. It MUST be disabled by default, expiry-aware and absent from production example configuration.

---

# 15. LLM work engine

Use the existing Platform and agent runtime before adopting another engine.

The repository reports that Platform already contains:

```text
workspace
gatekeepers
code mode
gadgets
blueprints
agent spawner
execution envelope
effect store
```

The attention reconciler should request a bounded Occupancy through the existing public Platform surface.

It MUST NOT implement its own agent orchestration.

If a response requires durable multi-step execution that the existing runtime cannot provide, evaluate Cloudflare Workflows as a subordinate operation engine.

Cloudflare Workflows may supply:

- durable steps;
- pauses;
- waiting for external events;
- retries;
- execution observability.

It MUST NOT become the source of:

- Card identity;
- institutional attention state;
- PowerFarm authority;
- Process Commit;
- Office continuity.

A workflow instance is machinery inside an attempt.

It is not the circulation model.

Do not introduce Temporal, another workflow engine, or a queue merely for theoretical completeness. Existing engines must be evaluated before duplication.

---

# 16. Event acceleration

The first correct implementation needs no event bus.

After the level-triggered path passes conformance, Supabase Realtime MAY be used as a fast wake hint:

```text
Card changed
    ↓
Realtime hint
    ↓
advance attention reconciliation wake
```

The event contains no authority and no canonical truth beyond the durable database change it points toward.

The reconciler always fetches current state.

Disable Realtime in a conformance test.

The seam MUST still converge.

Do not introduce Kafka, NATS, Redis Streams, Cloudflare Queues, or another broker as the authoritative substrate of the First Seam.

A broker may be evaluated later only for a measured throughput problem.

---

# 17. Observability

Instrument the seam with OpenTelemetry when practical.

Correlate at least:

```text
BeatRef
ReconcilerRef
CardRef
Card generation
recipient scope
OfficeRef
OccupancyRef
RunRef
EvidenceRef
```

A trace should make this path inspectable:

```text
physical wake
    ↓
Heartime sweep
    ↓
attention reconciliation
    ↓
WakePack compile
    ↓
Occupancy run
    ↓
durable response
```

Telemetry is not institutional Evidence.

OpenTelemetry Baggage MUST NOT carry credentials, Grants, or authoritative permission claims.

Tracing is a map of mechanism.

PowerFarm provenance remains the account of institutional meaning.

---

# PART IV - BUILD THE FIRST VERTICAL SEAM

# 18. First permanent operating slice

Admit one low-risk but real Card flow as the first permanently supported operating path. It is not a demo branch, temporary adapter, or disposable integration. Its semantic identities, migration lineage, compatibility rules, recovery behavior and conformance remain when later seams are added.

The first admitted flow uses a Card whose response contract requires interpretation, acknowledgement, or abstention, but no irreversible external effect. Low consequence limits initial blast radius; it does not lower engineering or durability requirements.

Required sequence:

1. A canonical Card exists in Cards 1.0.
2. Its current state indicates unresolved attention for a recipient scope.
3. No Card body is pushed into Heartime.
4. Heartime derives a due reconciliation contract.
5. The Durable Object alarm wakes.
6. Heartime records an attributed Beat.
7. Heartime invokes the attention reconciler.
8. The reconciler resolves current recipient Identity, Office, and Occupancy where available.
9. The reconciler queries current Cards state.
10. Cards compiles the current WakePack.
11. The reconciler observes whether a suitable run already exists.
12. If not, it starts one idempotently through Platform.
13. An LLM Occupancy receives the LLM projection.
14. The Occupancy reads and returns one of:

```text
response
abstention
UNKNOWN
Evidence candidate
action proposal
new Card
```

15. The result is persisted against the Card generation actually observed.
16. Any claim remains a response or Evidence candidate until the appropriate Process admits consequence.
17. The next reconciliation sees the changed attention state.
18. Heartime derives the next deadline and sleeps.
19. The same Card is resolved through human and client projection tests.

The seam succeeds only if no queue delivery record is required to remember that the attention remains unresolved.

---

# 19. Where durable state belongs

Do not create a shadow Card store in `organism-main`.

Durable ownership remains:

```text
Cards / attention schema
    Card identity
    attention state
    WakePack selection record
    response state if Cards already owns it

Registry
    Identity
    Office
    Occupancy
    canonical resolution

Process
    Responsibility
    Grant
    submission
    Commit

Platform
    run
    execution envelope
    Effect Store

Heartime
    Beat
    deadline
    liveness
    reconciliation schedule / observation

Memory
    durable Knowledge after lawful synthesis
```

The attention reconciler owns code, not institutional truth.

If Cards 1.0 lacks a required response or observed-generation primitive, extend Cards through its own public contract and schema with the smallest sufficient addition.

Do not create `circulation.cards` as a second Cards system.

---

# PART V - CONFORMANCE

# 20. Required failure tests

The permanent portable seam is not built until the following tests pass against
the closest faithful local environment. The live seam is not admitted until the
same properties pass against real organ bindings and deployed failure injection.
Local success MUST NOT be rewritten as deployed success.

## 20.1 Event loss

Disable every Realtime or event fast path.

Create unresolved attention.

Run Heartime sweep.

**Pass:** reconciliation rediscovers it from durable state.  
**Fail:** the system waits for a lost event.

## 20.2 Duplicate alarm

Run the same physical alarm path twice.

**Pass:** final state is correct and no canonical response, run, or effect is duplicated.  
**Fail:** at-least-once execution duplicates consequence.

## 20.3 Worker death

Terminate the Occupancy after WakePack resolution but before durable response.

**Pass:** attention remains unresolved and a later reconciliation can assign a successor.  
**Fail:** merely seeing a Card consumes it.

## 20.4 Stale response

Compile WakePack for Card generation `N`.

Materially revise the Card to `N+1`.

Return a response to `N`.

**Pass:** the response remains attributable to `N` and does not close `N+1`.  
**Fail:** stale work satisfies current attention.

## 20.5 Occupancy succession

Begin with Occupancy A and replace it with B.

**Pass:** B can continue from durable Office, Card, run, and evidence state.  
**Fail:** continuity depends on A's session.

## 20.6 Same Card, different species

Resolve one Card for LLM, human, and client.

**Pass:** all share CardRef and generation.  
**Fail:** three notification copies become three truths.

## 20.7 Attention is not authority

Expose a Card that references an unavailable action.

**Pass:** the Card is visible, the action is unavailable, and the reason is resolvable when possible.  
**Fail:** receipt of attention creates permission.

## 20.8 UNKNOWN and abstention

Make the requested judgment unsupported by sufficient evidence.

**Pass:** the Occupancy may return `UNKNOWN` or abstain.  
**Fail:** the system invents certainty to close attention.

## 20.9 Heartime engine evaporation

Discard all replaceable Durable Object scheduling state and recreate the runtime.

**Pass:** the next wake is reconstructed from PostgreSQL and declared contracts.  
**Fail:** Durable Object storage became canonical Heartime.

## 20.10 No-bus test

Delete event acceleration, queue state, and transient delivery hints.

**Pass:** a sweep reconstructs unresolved work.  
**Fail:** correctness depends on offsets, consumer positions, reply topics, or dead-letter replay.

## 20.11 Attribution

Complete one seam cycle.

**Pass:** the path can identify BeatRef, CardRef, observed generation, recipient, Occupancy, and response.  
**Fail:** work occurred with no institutional author or runtime attribution.

## 20.12 Hardcoded-address test

Change or recreate the provider deployment address.

**Pass:** canonical identity and Service Binding / resolver continue to work.  
**Fail:** a preview URL was persisted as identity.

## 20.13 Card is not Commit

Return a confident LLM answer.

**Pass:** it remains response/Evidence until Process admission.  
**Fail:** confidence promotes it automatically.

## 20.14 Expired attention

Expire a Card after it was included in a WakePack.

**Pass:** current attention disappears while historical selection and response lineage remain.  
**Fail:** expiry deletes the evidence that it circulated.

## 20.15 Production safety

Run verification without production authorization.

**Pass:** migrations and deployment plans are generated and validated, but no production database or Worker is changed.  
**Fail:** implementation convenience becomes authorization.

---

# 21. Whole-system relationship

The First Seam is not the whole-system test.

It is the first executable section of the circulation needed to make that test possible.

It must support both directions declared by Document 1:

```text
ABSENCE
nothing waits for the individual

RETURN
nothing forces the individual to reconstruct what the institution already knows
```

The LLM seam proves that an ephemeral intelligence can wake, receive current perspective, respond, and disappear.

The human projection tests begin proving that the individual can later enter the same institutional object without being given a parallel summary universe.

---

# PART VI - EXECUTION ORDER

# 22. Mandatory order of work

Perform the work in this order.

## A. Baseline

- inspect every repository file;
- run current Heartime verification;
- record exact results;
- do not infer external organ APIs that can be inspected.

## B. Repair truth

- restore complete Document 1;
- generate release metadata;
- fix conformance counts;
- update Appendix statuses;
- preserve `NOT RUN`.

## C. Repair identity and desired state

- remove hardcoded personal seed;
- reconcile canonical identifier syntax;
- make Git roster the true desired state;
- correct cadence/freshness vocabulary.

## D. Repair the invalid edge

- remove the preview URL;
- use Service Binding or stable canonical resolution;
- add a conformance test.

## E. Write boundary contracts

Create or update:

```text
proposals/first-seam.md
contracts/reconciliation.md
contracts/card-attention.md
contracts/engine-decisions.md
```

Only standardize fields required by this real seam.

## F. Build physical Heartime

- implement Durable Object alarm setting;
- connect to PostgreSQL through an appropriate setting;
- reconstruct alarms from canonical state;
- prove duplicate wake safety;
- do not deploy to production without authority.

## G. Build roster reconciliation

- load desired Git roster;
- compare with observed `heartime.organs`;
- create/update/retire idempotently;
- preserve lineage;
- record evidence.

## H. Build attention reconciliation

- inspect Cards 1.0 public surfaces;
- map onto current Card and WakePack semantics;
- add only the smallest missing primitive;
- implement controller loop;
- keep it outside Heartime and Cards.

## I. Integrate one Occupancy

- use existing Platform/agent runtime;
- resolve Office and Occupancy;
- start or observe a bounded run;
- persist response with observed generation and attribution.

## J. Add projections

- LLM projection;
- human contract projection;
- client contract projection;
- same identity and generation test.

## K. Add observability

- traces and correlations;
- no authority in telemetry;
- evidence remains separate.

## L. Add event acceleration last

- optionally enable Realtime hints;
- rerun with Realtime disabled;
- prove identical eventual result.

## M. Run conformance

- run existing 13 Heartime tests;
- run database policy checks;
- run all First Seam tests;
- generate evidence;
- update derived repository accounts.

---

# 23. Repository shape

Do not force these exact names if the existing code suggests a smaller arrangement, but the seam must be physically legible.

A plausible result is:

```text
canon/
  01-organism-and-organization.md
  01.release.json                 generated or verified

proposals/
  first-seam.md

contracts/
  reconciliation.md
  card-attention.md
  engine-decisions.md

heartime/
  lib/heartime/                   existing pure logic
  migrations/                    corrected schema
  worker/                        physical Durable Object setting
  tests/

roster/
  organs.json                    desired state
  reconcile/                     desired -> observed controller
  tests/

circulation/
  README.md
  EDGES.md
  attention/
    controller/
    cards-adapter/
    platform-adapter/
    projections/
    tests/

conformance/
  README.md
  first-seam/

evidence/
  generated baseline and test evidence
```

If the circulation implementation becomes larger than the systems it connects, stop and reassess.

---

# 24. Engine decision records

For each engine used, record:

```text
engine
role
mechanism supplied
PowerFarm meaning retained above it
public surface used
why a setting is sufficient
what survives if the engine evaporates
replacement class or candidate
currently unexposed engine capability
conformance test
```

The initial candidate decisions are:

## 24.1 Durable Object Alarm

```text
role
physical Heartime wake

engine owns
alarm scheduling, runtime wake, bounded retry

PowerFarm owns
Beat, deadline, roster, health meaning, reconciliation contract, evidence

survives evaporation
all PostgreSQL state, pure logic, tests, and contracts
```

## 24.2 Service Bindings

```text
role
private Worker-to-Worker invocation

engine owns
provider routing and invocation

PowerFarm owns
service identity, authority, request meaning, provenance

survives evaporation
canonical references and adapter contract
```

## 24.3 Hyperdrive, if adopted

```text
role
Worker-to-Postgres connection and pooling

engine owns
connection mechanism

PowerFarm owns
queries, transactions, RLS, freshness, idempotency, meaning
```

## 24.4 Existing Platform agent runtime

```text
role
instantiate and operate an Occupancy

engine owns
agent runtime mechanism

PowerFarm owns
Office, Occupancy, Responsibility, Grant, Card, response, Evidence
```

## 24.5 Cloudflare Workflows, only if required

```text
role
long-running durable operation beneath one reconciliation attempt

engine owns
step persistence, waits, retries

PowerFarm owns
why the operation exists and whether its result has institutional effect
```

## 24.6 Supabase Realtime, optional

```text
role
fast hint that durable state changed

engine owns
change notification

PowerFarm owns
current truth and whether reconciliation is due
```

## 24.7 OpenTelemetry

```text
role
mechanism trace

engine owns
telemetry representation and export

PowerFarm owns
institutional provenance and Evidence
```

---

# 25. Non-goals

Do not:

- connect all thirty organ edges;
- create a central event bus;
- create a seventh organ;
- install Kubernetes merely to imitate controllers;
- create a universal envelope;
- replace Cards 1.0;
- create a second attention database;
- replace Registry, Process, Platform, Memory, ACK, or Homeostasis;
- implement all contextual policy;
- implement Talent search;
- build the full Imagineering environment;
- build the GitHub for LLM-native software;
- solve the revenue model;
- move all existing `public` tables;
- fork external engines;
- claim production deployment without production evidence;
- treat a successful provider call as institutional Commit.

The First Seam should be small enough to understand completely and strong enough that later seams can copy its pattern.

---

# 26. Definition of done

The First Seam may be admitted as a live permanent edge only when the following statement is demonstrably true:

```text
A canonical Card exists.

Nobody sends that Card as an authoritative job message.

Heartime sleeps.

The appropriate deadline arrives.

A physical engine wakes Heartime.

Heartime records an attributed Beat and wakes a small reconciler.

The reconciler reads current durable state.

It discovers unresolved attention.

Cards compiles a current WakePack.

A current Occupancy receives the LLM projection.

The Occupancy responds, abstains, or returns UNKNOWN.

The response is durably attributable to the Card generation it observed.

The response does not automatically become truth, Knowledge, authority, or Commit.

A later reconciliation observes the changed state.

The same Card can be projected to a human and an external client.

Deleting every event hint does not lose the obligation.

Killing the original worker does not lose continuity.

Recreating the physical Heartime engine does not lose Heartime.

Firing the wake twice does not duplicate consequence.
```

Then all repository verification and First Seam conformance tests pass.

The final implementation report may use only:

```text
BUILT AND VERIFIED
BUILT, NOT DEPLOYED
DESIGNED, NOT BUILT
NOT RUN
FAILED
```

---

# 27. Final design test

Before declaring completion, answer:

1. If Realtime disappears, does reconciliation still converge?
2. If the alarm fires twice, is the result still singular and correct?
3. If the LLM session dies, can another Occupancy continue?
4. If a Card changes during work, can stale work close it?
5. Are LLM, human, and client seeing the same Card identity?
6. Does receiving a Card create authority anywhere?
7. Can `UNKNOWN` and abstention survive without being converted into prose certainty?
8. Can the Durable Object be replaced without loss of Heartime meaning or state?
9. Is any queue delivery record the only reason the system knows work remains?
10. Did an external engine define PowerFarm Identity, Authority, Delegation, Card semantics, or governance?
11. Did the implementation duplicate an engine already present?
12. Is any published number or status manually typed when it could be derived?
13. Can the seam be explained without queue offsets, consumer groups, reply topics, or dead-letter replay?
14. Can the individual return and enter the Card's subject without being trapped behind a summary-only surface?

If question 9 is yes, the system has become a bus.

If question 10 is yes, an engine has started becoming an organ.

If question 13 is no, simplify.

The intended final anatomy is:

```text
Heartime supplies perfusion.
Durable state preserves obligation.
Reconcilers supply convergence.
Cards carry attention.
WakePack supplies perspective.
Offices supply continuity.
Occupancies supply cognition.
Process supplies consequence.
Evidence returns.
Engines supply mechanism.
```

That is the First Seam.

---

# Engine references verified for this proposal

- Cloudflare Durable Objects Alarms: https://developers.cloudflare.com/durable-objects/api/alarms/
- Cloudflare Workers Service Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
- Cloudflare Workflows: https://developers.cloudflare.com/workflows/
- Cloudflare Hyperdrive: https://developers.cloudflare.com/hyperdrive/
- Supabase Realtime Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes
- OpenTelemetry Traces: https://opentelemetry.io/docs/concepts/signals/traces/
- OpenTelemetry Baggage: https://opentelemetry.io/docs/concepts/signals/baggage/

---

Copyright © 2026 PowerFarm. All rights reserved.
