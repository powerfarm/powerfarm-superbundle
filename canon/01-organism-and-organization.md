# PowerFarm: Organism and Organization

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Canon` · **CANON**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Document 1**

**Status:** canon candidate
**Supersedes:** nothing. This is the first document.
**Relates to:** PowerFarm Superstructure v0.3 (architecture study), PowerFarm Cards 1.0
**Normative language:** MUST, SHOULD, MAY.

---

## How to read this

Every claim in this document is written so it can be **broken**. Where a section
states a property, Part III names the observation that would prove it false.

A concept does not enter this document because it is elegant. It enters because
something in the system either implements it or fails without it. Where a
mechanism does not exist yet, the appendix says so by name.

Part 0 is different in kind from the rest. It is not derived from anything and
cannot be: what the company does, and who it is for, are declarations by the
person who made them. Parts I and II may not infer them, contradict them, or
quietly replace them with something the architecture finds more convenient.

This is deliberately short. A constitution can be long because it is judged by
internal coherence. This document is judged by whether the thing runs.

---

# PART 0 — THE COMPANY

Parts I and II describe how the company stays alive and how it stays
accountable. Neither says what it is for, or who it is for. Both are decisions,
not derivations: they are declared here by the person who made them, and nothing
downstream may infer them from the architecture.

## 0.1 The individual is the centre

PowerFarm is **enterprise infrastructure built around one individual**. Not a
company that serves a user. Not an autonomous institution with a human sponsor
at the edge. The individual is inside it, and everything else is arranged
around them.

```text
                        WORLD
                          │
        ┌─────────────────┴─────────────────┐
        │            POWERFARM              │
        │                                   │
        │   observers          researchers  │
        │            ┌───────────┐          │
        │            │    ONE    │          │
        │  memory    │ INDIVIDUAL│  offices │
        │            └───────────┘          │
        │   execution           machines    │
        │                                   │
        └─────────────────┬─────────────────┘
                          │
                        WORLD
```

The question the company is an answer to is not *how do we remove the human*.
It is:

> **What can one individual do with the institutional capacity of an entire
> company behind them?**

### The invariant

> **Centrality MUST NOT imply operational dependency.**

### Autonomy and Direction

Autonomy means **operational independence from the individual's continuous
attention**. It does not mean independence from human Direction, institutional
purpose, or legitimate governance.

Direction is not an empirical claim. It may originate in human preference,
curiosity, taste or conviction. Claims about reality, feasibility, performance,
markets and consequences remain subject to evidence.

The individual may declare *what PowerFarm is for* without proving that the
preference is optimal. The institution may not turn that declaration into a
factual claim about the world without evidence.

Two tests, and both MUST hold:

```text
IF THE INDIVIDUAL DISAPPEARS   the company continues. Nothing waits, nothing
                               degrades, nothing accumulates as a queue for
                               their return.

IF THE INDIVIDUAL RETURNS      the company recognises them, puts them in
                               context without replay, and lets them work on
                               anything without first rebuilding it.
```

The first test alone builds a company that dismisses its creator once it is
finished. The second alone describes what already exists: a system that runs on
one person's attention. Only both together describe PowerFarm.

### What is removed is obligation, never agency

An earlier reading of this document made the individual a `Principal` at the
edge — sets Direction, then leaves. That reading is wrong, and wrong in a
specific way: it removes obligation and agency in the same gesture. Only the
first may be removed.

```text
REMOVED     holding context · remembering decisions · coordinating agents ·
            keeping processes alive · connecting systems · carrying
            conversation between machines · watching runs · being the
            fallback when automation fails

KEPT        curiosity · judgment · taste · invention · investigation ·
            writing · deciding what matters · changing course · entering
            any part of the company at any depth
```

> **PowerFarm MUST NOT require the individual's attention. It MUST reward it
> whenever it arrives.**

### The only legitimate human-in-the-loop is the plug

The individual is not the recovery path. An escalation that resolves as *ask
the owner* is a defect in the system, and §11.4 governs it: absence of talent
is an input to construction, not a notification.

There is exactly one human interrupt this document endorses, and it is
physical: the individual may unplug the machines. Everything else that reaches
them is either their own interest, or a decision that specifically requires
human legitimacy (§11).

## 0.2 What the company does

**Journalism.**

Not a technology company that might apply itself to journalism. The work the
company performs is journalism, at a scale one person cannot reach alone.

> **A Reuters inside a Mac mini.**

Two reasons, both structural rather than sentimental:

**It is the work the individual wants to do.** The company exists to enlarge one
person's practice. A practice they do not want to perform is not enlarged by
any amount of infrastructure — it is merely operated. This is the constraint
that decides the domain, and it is not negotiable downstream.

**The trend is the beat.** Pointing at where the field is going is work that
never runs out, and it converts the market's innovations from a threat into
material. A company positioned on the north stays on top of it instead of
chasing it — which is also the difference between finding the next release
useful and finding it demoralising.

And the fit is not incidental. Take the indispensable skills of a good
journalist — sourcing, verification, reconstructing a timeline, holding
contradictory accounts open, compressing without distorting, keeping a question
alive across weeks — and a population of intelligences fits them considerably
better than it fits the word *agent*.

### What is declared here, and what is not

```text
DECLARED       the work                    journalism
               the shape                   enterprise capacity around one
                                           individual
               the floor                   it MUST at minimum build a real
                                           brand
               the ambition                it SHOULD profit and grow its own
                                           capacity

NOT DECLARED   who pays · for what · on what terms
               which artifact or service proves most sellable
```

The revenue mechanism is **not** in this document, because it has not been
decided. It MUST NOT be invented here, and no section below may assume one. The
company is therefore run so that not having decided is survivable — which is
what §0.3 exists to guarantee.

## 0.3 What it costs to run

The cost function is a constitutional constraint, not an operating detail. A
constitution without one authorises work the company cannot pay for.

The governing law is structural:

> **Recurring frontier inference for work whose competence has become stable and
> sedimentable is evidence of unfinished construction.**

Frontier inference remains legitimate for novelty, exploration, adjudication,
temporary gaps, and work whose uncertainty still justifies it. The defect is not
that expensive inference ever occurs. The defect is that settled competence keeps
being purchased as if nothing can be retained.

### The question asked per card

> **Automation Max moment: do we need frontier for this? Or for 33% of it?**

This is asked **per card, at evaluation time, by the card's own eval** — not
once at design time by whoever wrote it. A card that never re-asks the question
has fixed its cost at the most expensive answer available on the day it was
written.

### The ladder

```text
v0    expensive and fast      buy the answer; learn the shape
v1    medium and medium
v2    medium and slow         the shape is known; the cost comes out
```

Descending it is the normal life of a card, and §9.4 is the mechanism.

Published model cards select candidates. **Delivery in the Lab, on the actual
subject, decides.** A benchmark that measures anything else is measuring
someone else's problem.

## 0.4 The Lab

The Lab exists to discover how much useful institutional work can be performed
without paying permanent frontier cost. Its hardware inventory, resident models,
rotation, and other transient operating facts belong to operational state, not to
this document.

Its doctrine is demonstrated competence per work class.

> **An implementation MAY be admitted only for work classes in which it has
> demonstrated sufficient reliability.**

Limited models SHOULD begin with constrained answer spaces; broader output
requires stronger evidence of competence for that class. Fluency is not evidence
of reliability, and published benchmarks do not substitute for delivery on the
actual work the institution needs done.

The experiment the Lab is running is the company itself: **making a company
happen at marginal cost near zero without pretending uncertainty has vanished.**

## 0.5 What we refuse to build

> **PowerFarm SHOULD NOT build a capability merely because it can.**

Build when the capability is institution-specific, not adequately available, or
when dependence on an external implementation would surrender semantics,
authority, evidence, continuity, or another property PowerFarm must own.

```text
BUILD        institution-specific meaning or capability the institution must own

ADOPT        mechanism that is adequately available and does not take ownership
             of PowerFarm's semantics
```

PowerFarm owns semantics. Engines own mechanism. A dependency is acceptable when
it can be replaced without replacing what the institution means, who may act, why
an act was legitimate, or what the institution remembers having done.

This clause belongs here because it decides where scarce construction capacity
goes. Publishing, observing, and keeping the beat remain legitimate work under
§0.2; implementation is not the measure of seriousness.

## 0.6 The two halves

PowerFarm is one system with two properties that are usually built separately
and then never meet.

```text
ORGANISM                          ORGANIZATION
what keeps it alive               what makes it a company

heartbeat                         identity
wake and sleep                    office and occupancy
observation                       authority and evidence
reconciliation                    promotion
adrenaline                        direction
circulation                       lineage
```

Neither half is sufficient.

An **organization without an organism** is a beautifully governed fossil: it
knows who may decide what, and nothing ever wakes up to check whether any of it
is still true.

An **organism without an organization** is automation that runs forever with no
account of who authorized it, no memory of why, and no way to tell a legitimate
actor from a parallel one.

> **The organism keeps the company true. The organization keeps the company
> accountable.**

Everything below is one or the other.

---

# PART I — ORGANISM

## 1. Heartime

### 1.1 The heart is required by contract, not by preference

The health contract already states:

```json
"evidenceFreshnessMinutes": 15
```

and

> `UNKNOWN` must never be rendered as healthy.

Together these are not configuration. They are a **beat requirement**. Evidence
older than the freshness window stops counting as current, so a system with no
pulse decays to `UNKNOWN` by definition — not through failure, but through the
passage of time.

> **A company with no heartbeat is not healthy. It is unobserved.**

### 1.2 The rate is variable and derived

The heart MUST NOT run at a fixed period.

```text
next_beat = min(all scheduled deadlines)
```

This is the **logical reconciliation model**, not a requirement for one physical
synchronous clock or one process loop.

The heart sleeps until the earliest obligation, wakes, discharges it, and
re-derives. An idle heart costs nothing. A fixed interval must be set to the
tightest period anything requires, and then pays that cost permanently, mostly
to discover there was nothing to do.

### 1.3 Observability sets the rate

The period is not configured. It is **written by the returning pulse**.

```text
HEALTHY      relax toward the contract's freshness window
UNHEALTHY    tighten; this state has somewhere to escalate
UNKNOWN      tighten hard — this is the state the heart exists to eliminate,
             and its freshness window is already expired by definition
```

The system therefore samples fastest exactly when it knows least. This is
adaptive sampling driven by epistemic state, and it needs no new vocabulary:
the three values already exist in the health contract.

### 1.4 The deadline is written on emission

A deadline MUST be recorded when the pulse is **sent**, never only when a
response arrives.

An organ that is asleep, dead, or unreachable never answers, and therefore never
schedules its own next check. A queue fed only by responses goes quiet precisely
when silence is the symptom.

A response MAY shorten the next deadline. It MUST NOT be the only thing that
creates one.

### 1.5 Level-triggered, not edge-triggered

The heart MUST sweep, not react.

```text
edge-triggered   "what became due?"      loses whatever was missed
level-triggered  "what is not as declared?"  recovers on the next sweep
```

A sweep that finds everything already correct costs almost nothing. A missed
event is repaired on the following pass without anyone noticing it was missed.
This is the property that makes the system anti-entropic rather than merely
automated, and it is why the Kubernetes controller loop is the correct
reference implementation to study — not as a dependency, as a proven design.

A cadence step that selects only *due* checks is edge-triggered and MUST be
replaced.

### 1.6 The roster is the coverage contract

The heart can only test what is declared. The register of organs is therefore
not bookkeeping — it is the boundary of what the company is able to know about
itself.

> **An organ that is not registered receives no heartbeat, and nothing that
> receives no heartbeat may be reported as HEALTHY.**

Registration is how a component becomes observable. It is not a formality that
precedes work; it is the thing that makes the work legible.

### 1.7 Idle is a state, and it must be verified

In a serverless organism, *not running* is the normal and correct state of most
organs. Health therefore cannot be inferred from activity. It must be provoked.

> **Absence of work is not evidence of death. Absence of response is not
> evidence of life.**

Two questions have very different costs and MUST be separated:

```text
"are you there?"   answerable from durable state, without waking the organ
"are you well?"    requires the organ to execute
```

Presence SHOULD be established by reading a durable record — each organ writes
`last_seen` and `next_expected` on every real wake — and a full wake SHOULD be
provoked only when `now > next_expected + grace`. Cheap always; expensive only
on suspicion.

The registered states are:

```text
registered · present · nothing due · recently verified   idle, healthy
registered · present · executing                          working
registered · no current evidence of presence              UNKNOWN
registered · provoked · did not answer                    absent
not registered                                            invisible, never HEALTHY
```

The third line is the trap. **Idle is correct; unverified-idle is not the same
as verified-idle.** Without a heartbeat, a company of sleeping offices reads as
healthy until the day one is needed.

The failure this catches is concrete: an office whose runtime was deleted, whose
code no longer deploys, or whose alarm was never re-armed. It has no work, so
nothing notices. The heartbeat turns a three-month latent failure into a
fifteen-minute one.

### 1.8 Two branches: parasympathetic and sympathetic

The heart has one nervous system with two modes, over the same organs, the same
roster and the same ledger.

```text
PARASYMPATHETIC          scheduled beats. the default. maintenance, cadence,
                         liveness, reconciliation. internally generated.

SYMPATHETIC              external signals. webhooks, email, SMS, fire, an
                         earthquake. adrenaline. generated by the world.
```

An adrenaline beat is still a beat, with an author, in the same book.

**Sympathetic is not faster parasympathetic.** Under adrenaline a body suppresses
digestion. The queue MUST therefore support **preemption and deferral**, not only
insertion: an incident pushes scheduled maintenance back. If adrenaline only
adds, the first serious event drowns the cadence and both are lost.

**Adrenaline MUST decay automatically.** No organism sustains sympathetic state;
it exhausts. An incident nobody closes MUST NOT leave the company in permanent
high frequency — that is expensive and, worse, desensitizing. Return to baseline
carries a deadline and does not depend on anyone remembering to switch it off.

### 1.9 The sympathetic branch is the attack surface

```text
parasympathetic   fires from a roster you control    closed channel
sympathetic       fires from the outside world       open channel
```

Anyone able to send a webhook or an email can **spend the company's adrenaline**.
This is cheap for the sender and expensive for the organism.

External signals therefore require admission control that scheduled beats do
not: the source MUST be authenticated, not merely declared; trust and severity
MUST be graded; and a sender-declared timestamp MUST NOT be trusted as the time
of the event. Without this, an earthquake and a spam message arrive through the
same door with the same force.

### 1.10 Silence inverts between the branches

```text
parasympathetic   silence is suspicious   the organ may be dead
sympathetic       silence is normal       there was no earthquake
```

The emergency path cannot be monitored by absence, because absence is its
healthy state. This is why fire alarms are tested monthly.

> **The adrenaline path requires a parasympathetic check.** A scheduled beat MUST
> fire a synthetic signal end-to-end and confirm that something still wakes.

Otherwise the webhook is discovered dead on the day of the fire — the same
failure mode as the sleeping office, in the one channel that can least afford it.

### 1.11 Parallel power

The worst organ is neither dead nor idle. It is **working, unregistered and
unscheduled** — something is commanding it that is not the heart.

A dead organ fails safe: it does nothing. A parallel organ acts in the world,
with real effects, that nobody authorized, nobody sees, and nobody knows how to
stop.

It cannot be found from the roster; its address is unknown. It is found from the
**trace**, because to work at all it must touch things that *are* registered — it
consumes credentials, writes to the database, calls providers, produces effects,
alters state.

> **The parallel organ is invisible in the roster and visible in the drift.**

Reconciliation therefore has two readings, and today only the first is
implemented:

```text
drift means   "something needs repair"
drift means   "something has hands here"
```

This gives the second law of the pulse:

```text
1.  everything registered MUST answer            catches the dead
2.  everything that acts MUST be attributable    catches the parallel
```

The rule is deliberately not "everything must be scheduled". A human triggers
work by hand; a webhook arrives; an incident overrides cadence. A law requiring
universal scheduling would be routed around, and the workaround becomes the
parallel power.

> **Not everything must be scheduled. Everything must be attributable.**

Detection is not containment. Parallel power is not contained if an unattributed
or no-longer-authorized actor can continue creating new external consequence
merely because its existence has been detected. Whatever the implementation,
containment MUST remove its ability to create further consequence until effective
authority is established again.

Unscheduled but attributed is an **extraordinary beat** — off-cadence, with an
author, in the same ledger, visible to the same sweep. The alarm is not the
missing schedule. It is the missing author.

Two existing invariants are the detector, and were written before the heart
existed to use them:

> Nothing writes with the service key at runtime. Only migrations. Every
> application write carries a user, and RLS decides.

> Attribution is mandatory. Every table carries `created_by`, and `run_id` where
> it makes sense.

The first closes the door through which a parallel organ would write without
identity. The second guarantees that whatever enters leaves a fingerprint. What
is missing is the thing that reads them.

---

## 2. Multiple clocks

The company does not live on one clock.

```text
runtime effects        seconds
LLM work               seconds / minutes
workspace activity     minutes / hours
grants                 minutes / hours
responsibilities       hours / days
processes              hours / weeks
operations             days / weeks
mandates               months / years
knowledge              months / years
identity / lineage     persistent
```

This does **not** forbid a heartbeat. It forbids a **metronome**.

A single scheduler over heterogeneous deadlines is not one clock — it is one
mechanism serving many. Each organ keeps its own period; the heart only
guarantees it wakes at whichever obligation falls due first. The prohibition
worth keeping is against forcing all institutional reality through one
*synchronous* loop, and a priority queue is precisely how that is avoided.

**The heart's range is seconds to months.** Below that, engines keep their own
time: a request loop is the engine's business, and fast loops are self-evidencing
— they run constantly and fail loudly and immediately.

> **The heart is needed precisely where the frequency is lowest**, because that
> is where silence and health are indistinguishable. A weekly check that died six
> weeks ago looks exactly like a weekly check that keeps passing.

---

## 3. The company must be able to not know

`UNKNOWN` is a first-class, permanent, legal state. It is not a gap to be closed
by inference.

```text
health           HEALTHY · UNHEALTHY · UNKNOWN
epistemic        unknown · observed · inferred · hypothesis ·
                 evidenced · verified · contradicted
```

These two vocabularies already exist on both sides of the system and already
agree. `unknown` and `contradicted` are legal values that nothing obliges anyone
to resolve.

The system MUST NOT convert absence into a plausible guess. Where sources
disagree, the contradiction is preserved rather than averaged or silently
overwritten. Where an external effect may or may not have happened, the effect is
`unknown` and MUST NOT be blindly retried.

> **A serious autonomous company needs a capacity for abstention as good as its
> capacity for action.**

---

## 4. The organs and the circulation

Six organs. The set is deliberate: remove any one and the system stops being
alive in a specific, nameable way.

```text
REGISTRY        identity, office, occupancy, lineage, provenance
                remove it → actions have no author

ACK             signal, belief, uncertainty, temporal context
                remove it → only certainty or silence; no judgment

MEMORY          knowledge, grounding, contradiction
                remove it → every cycle starts from zero; no learning

PROCESS         responsibility, grant, submission, commit
                remove it → executing becomes deciding

PLATFORM        capability surface, gadget, blueprint
                remove it → nothing touches the world

HOMEOSTASIS     desired vs observed, reconciliation, cadence
                remove it → open loop; no return; no life
```

They close a circuit:

```text
HEARTIME  systole
  sweeps scheduled contracts, wakes the organs
       ↓
  HOMEOSTASIS observes  →  ACK forms belief under uncertainty
       ↓
  MEMORY confronts it with what is already known
       ↓
  REGISTRY says who holds the office to decide
       ↓
  PROCESS grants authority and commits
       ↓
  PLATFORM exercises the capability
       ↓
HEARTIME  diastole
  observation returns  →  Card (observed | unknown | contradicted)
       ↓
  WakePack compiles it for whoever wakes next
       ↓
  the office wakes already knowing what happened while it slept
```

> **The heart is not one organ. The heart is the circuit.**

---

## 5. Engines are set, not merged

An organ is a **mount**. An engine is a **stone set into it**.

```text
ORGAN      ours.   identity, mandate, history, lineage — what persists.
SETTING    ours.   adaptation to our substrate, identity mapping, authority
                   translation, evidence extraction. small, and expected to
                   be the fragile part.
ENGINE     theirs. never forked, never patched, never reimplemented.
```

A setting is shaped to receive the stone. The stone is never cut down to fit
the setting, and it can be removed and re-set without being damaged.

An organ MAY be composed of **several engines**. The relation is one organ to
many engines. It is never one engine to one organ, because that is how an organ
quietly becomes a vendor.

These are professional engines built by companies that will keep building them.
Using them heavily is a strategic advantage, not a dependency to be apologized
for or hidden behind a thin wrapper.

### 5.1 An engine MUST NOT be an organ

The organ is what survives engine succession. This is §7 applied to machinery:
the organ is the office, the engine is the occupancy.

The test is a single question:

> **Name what the organ retains when the engine is removed.**

If the answer is nothing, there is no organ — only an engine wearing a label.
Identity, mandate, history, lineage and accumulated evidence belong to the
organ, and MUST be representable without the engine present.

### 5.2 An engine MUST NOT be modified

A forked engine stops being professional machinery and becomes maintenance. The
cost is permanent, compounding and invisible: every future upstream improvement
is forfeited, and nobody ever books the loss.

Where an engine does not fit the substrate, the answer is a **membrane**, not a
fork — a small adaptation layer that lets the engine run unchanged.

The honest cost of this rule: a membrane sometimes has to reach for things that
are not public contract, and it will break on upgrades. That is the correct
trade. A fragile membrane you own is far cheaper than a large fork you own, and
it fails loudly at a known place instead of silently everywhere.

An upstream project going unmaintained does not license a fork. It means the
occupancy is ending, and succession — not adoption — is the response.

### 5.3 The setting MUST NOT narrow the stone

"Use them to the maximum" is a rule with teeth.

If the abstraction over an engine exposes materially less than the engine
offers, the company is paying for a diamond and wearing glass. The usual cause
is an abstraction written against an old version and never revisited.

> A scheduled reconciliation SHOULD report **engine capability drift**: material
> changes in what an admitted engine can do, cannot do, or requires, when those
> changes make the institution's assumptions stale.

This is a parasympathetic check. It catches both surplus capability the setting
no longer reaches and changed constraints that make an old admission unsafe or
false. The failure is stale institutional belief, not any vendor-specific version
change.

### 5.4 Adoption criteria

An engine is adopted against criteria, never against enthusiasm.

```text
ADOPT WHEN

  it provides mechanism, not meaning — nothing about PowerFarm's identity
    lives inside it
  someone else maintains it, and will continue to without us
  it can be set rather than forked: stable public surface
  removing it later replaces an occupancy, not an organ
  it does substantially more than we would build, and we intend to reach
    that surplus

REFUSE WHEN

  it requires a fork to fit
  it would become an organ — remove it and nothing of ours remains
  the operational burden it introduces exceeds the mechanism it provides
  it duplicates an engine already set, without displacing it
```

The fourth refusal is the one most often skipped. Two engines occupying the same
role is not redundancy; it is an unowned decision, and it will be settled later
by whichever one someone happens to reach for.

### 5.5 Meaning arrives as convenience

The first adoption criterion — *mechanism, not meaning* — is easy to state and
hard to apply, because meaning does not arrive as a proposal. It arrives as a
working feature, well documented, well supported, already integrated, and free.

> **The dangerous engine is not the one that arrives with an API. It is the one
> that arrives with an ontology.**

An engine that offers transport, isolation, routing or storage takes nothing
from the organ. An engine that offers **identity, delegation, authority,
approval or governance** is offering to define concepts PowerFarm exists to own,
and it will offer them as the path of least resistance: one configuration line
instead of a component to build.

Adoption is therefore split at the boundary, not at the vendor:

```text
same engine, two answers

  transport, tools, discovery, isolation, routing   →  adopt, use heavily
  identity, delegation, authority, governance       →  refuse; lower onto it
```

*Lowering* means the concept is defined in PowerFarm terms and then expressed in
the engine's terms at the boundary. The engine carries the delegation; it does
not define what delegation is. When the engine is replaced, the concept survives
the swap — which is exactly the §5.1 test.

The signal to watch for is a protocol expanding its scope upward. A tool
protocol that begins specifying agent identity has not added a feature; it has
started competing for an organ. The correct response is neither refusal of the
protocol nor adoption of its ontology, but a binding: keep it as the wire, keep
the meaning above it.

---

# PART II — ORGANIZATION

## 6. Identity is the connective tissue

PowerFarm does not own the engines. It owns the **identity of the things that
cross them**.

```text
pf://office/...          pf://capability/...
pf://responsibility/...  pf://gadget/...
pf://run/...             pf://artifact/...
pf://knowledge/...       pf://deployment/...
```

The engines need not share an implementation, a language, or a database. They
must share **addressing and meaning**. A single representation is not required;
a single identity across representations is.

This is why there is no central kernel. A kernel would recreate a platform in
the middle of platforms that are already excellent. Identity is the smaller and
stronger claim.

## 7. Office endures, occupancy is replaceable

```text
OFFICE       durable institutional identity, mandate, key
OCCUPANCY    the ephemeral thing currently sitting in the chair
```

The office continues when the model changes, the run ends, the worker dies, the
provider fails, or a different intelligence takes the seat.

**This generalizes to vendors.** A provider does not define a layer; it currently
occupies one.

```text
pf://engine/knowledge              occupied by  a knowledge engine
pf://engine/agentic-runtime        occupied by  an agent runtime
pf://engine/compute                occupied by  an isolation fabric
pf://engine/durable-operations     occupied by  a durable workflow engine
```

> **PowerFarm owns capabilities. Vendors occupy them.**

Succession applies to technology exactly as it applies to people. Replacing an
engine is replacing an occupant, not amending the constitution.

## 8. Authority descends, evidence returns

```text
AUTHORITY ↓                          EVIDENCE ↑

company                              provider receipt
   office                               effect store
      responsibility                       observation
         grant                                evidence
            run grant                           commit
               execution envelope                  provenance
                  agent                              knowledge
                     subagent
                        capability
```

Authority MUST narrow monotonically as it descends. Each level may receive less
power than the one above it, never more. This is what makes recursive delegation
safe without depending on good behaviour: the constraint lives in the topology
of capabilities, not in the intentions of the actor.

Context SHOULD narrow with it. An office sees its domain; a responsibility sees a
bounded problem; a subagent sees the minimum task context.

**Credential and capability do not create authority. Occupancy does not create
authority.** Authentication establishes who is asking. It does not establish what
they may do.

### 8.1 Effective capability is contextual

Declared Capability is not equivalent to available Capability. What an actor may
actually do is contextual and derived at the point of action. Conceptually:

```text
Registered Capability
+ Identity
+ Office / Occupancy
+ Responsibility
+ Grant
+ Resource
+ Rights
+ Policy
+ Context
= Effective Capability
```

This is a derivation, not another sacred institutional object. A consequential
act MUST be attributable to an effective-capability evaluation sufficient to
reconstruct why that act was available at that time. Whether an implementation
retains a digest, a materialized set, an Evidence object, or a replayable decision
record belongs to the derived specification.

### 8.2 Refusal is a navigable policy result

Policy must be able to distinguish four semantic outcomes:

```text
ALLOW       the act may proceed
DENY        the act may not proceed
CHALLENGE   the act may proceed if a resolvable condition is satisfied
ESCALATE    another legitimate authority must decide
```

**CHALLENGE is not DENY.** When lawful resolution exists, a machine-facing
refusal SHOULD expose enough structure to navigate toward it: what failed, why,
whether it is resolvable, what condition or authority is missing, and what lawful
next action exists. These are institutional semantics; a policy engine need not
serialize these exact words.

## 9. Promotion

The same movement appears throughout the system and is one primitive:

```text
CANDIDATE
   ↓ evidence + identity + lineage + authority
PROMOTION
   ↓
INSTITUTIONAL ASSET
```

The asset may be knowledge, software, a process, a policy, infrastructure, an
artifact, or a capability.

Execution is not commit. Producing something does not make it canonical.
Provisional work may function fully inside its own context and still not be part
of the company until promoted, and a new version never erases its predecessor —
it changes its state.

This is what lets the organism experiment aggressively without every experiment
becoming policy.

### 9.1 Evidence may not be authored by its subject

A check written by the thing being checked is not evidence. It is the thing
restating itself in a format that resembles proof.

The failure is easy to build and hard to see, because every step looks like
diligence:

```text
the agent writes the specification
the agent writes the validator for it
the agent runs the validator
the agent reports that it passed
```

Nothing in that loop is false, and the loop proves nothing. It is the reason a
hand-made harness can pass its own tests for months while describing a system
that does not exist.

> **A test authored by the actor it tests measures authorship, not behaviour.**

Promotion therefore requires that acceptance be bound to something the proposing
actor did not produce: an independent reviewer, a contract written before the
work, a deterministic check the actor cannot edit, or an observation from
outside the run. The process kernel already carries this primitive — terminal
evidence can be required to bind a reviewer different from the proposing actor.
It MUST apply to the machinery the company builds for itself, not only to the
work that machinery performs.

### 9.2 Description is not evidence

Where a system publishes an account of itself — a summary, a portfolio, a status
page, a document — every quantitative claim in it MUST be **derived**, and the
derivation MUST be from the same artifact the claim describes.

```text
derived    "18 capabilities"        counted from the graph
           "284 passing, 3 open"    read from a run
           "92% reuse"              measured by the build

authored   "well tested"            prose
           "production ready"       prose
```

A published account whose numbers are typed rather than computed is the most
convincing artifact a system can produce about itself, and the least reliable.
It reads as evidence while being narration.

Qualitative claims — design decisions, constraints, intent — cannot be counted,
and MUST NOT therefore be exempt. A stated decision SHOULD resolve to the
constraint that enforces it. If "closure requires verification" is real, there is
a precondition on closure and the account points at it. If there is no such
precondition, the sentence is an aspiration and MUST be marked as one.

### 9.3 Institutional signature and speech

> **Intelligence may generate candidate speech. Only effective institutional
> authority may commit an artifact as PowerFarm speech.**

```text
generation
   ↓
candidate
   ↓ evidence / policy / authority
commit
   ↓
institutional signature
```

Model output is not automatically PowerFarm speech. A signature applies to an
exact artifact revision, declares the class of assertion being made, and may be
made only by effective authority within its scope. Any subsequent change creates
a new revision. Correction, withdrawal and supersession are themselves
attributable institutional acts.

Provenance of how an artifact was produced MUST remain available without making
the producing model the institutional author. Assertion classes may be defined in
derived specifications; the constitutional requirement is that the class and the
authority to make it are explicit.

**Institutional signature is governance. Cryptographic signature is mechanism.**
No cryptographic scheme, key format or certificate system is constitutional here.

### 9.4 Sedimentation: capability moves between substrates

Promotion admits a capability. It does not say what the capability should be
*made of*, and that question does not have one permanent answer.

There are three substrates, and the correct analogy is hardware:

```text
INFERENCE        a CPU interpreting. maximally flexible, maximally expensive,
                 forgets everything between instructions.

CONFIGURATION    an FPGA. structure compiled from cognition, running without
                 it. cheap, fast, and still reprogrammable.

FIXED            an ASIC. settled, nearly free to run, and rigid. changing it
                 means fabricating again.
```

Most systems have only the first and the last: an intelligence that reasons
everything from scratch every time, and hard automation that cannot be changed
without a project. The middle is the interesting one, and it is the one usually
missing.

> **A capability SHOULD be held in the cheapest substrate that still permits the
> change it actually undergoes.**

Four properties of the FPGA are load-bearing here, not decorative.

**Configuration outlives computation.** A CPU forgets between instructions; an
FPGA *is* the program while it is loaded. This is the same property as office
over occupancy and graph over context window, expressed in silicon. What the
company wants from repeated cognition is exactly this: the work stops
evaporating and becomes structure.

**Reconfiguration is partial.** A region can be reprogrammed while the rest of
the device keeps running. A company needs precisely this — changing one office's
behaviour without stopping the company — and it is what a revision replacing a
region, with the surrounding state intact, already means.

**The configuration is content-addressed.** A bitstream is a blob with a digest,
resolved and loaded. The lifecycle of `revision → root digest → resolve →
materialize` is not a new idea being invented; it is forty years old and
industrial.

**Synthesis is slow and execution is fast, and that asymmetry is correct.**
Compilation takes minutes; the result then runs at hardware speed indefinitely.
This is the same shape as compiling knowledge once and retrieving it cheaply
many times. It reframes cost honestly:

> The goal is not to make inference cheap. It is to make inference **rare per
> unit of running capability**.

### 9.5 The warning FPGAs give by counter-example

FPGAs also have a famous failure: **the toolchain becomes the work**. Synthesis
is slow and opaque, timing closure is brutal, and engineers routinely spend more
effort fighting place-and-route than designing the circuit. The abstraction
leaks, constantly, downward.

This is the exact risk of a semantic compiler. If the path from intent to
running capability has a step that is slow, opaque, and occasionally fails for
reasons the builder cannot see in its own vocabulary, then the builder stops
composing meaning and starts appeasing the compiler. That is the hand-made
harness again, wearing better clothes.

> **A compilation failure MUST be expressed in the builder's vocabulary, never
> in the substrate's.**

"This action can be reached in a state where its precondition cannot hold" is a
usable failure. "Placement failed" is not. The builder must never be required to
reason in the terms of the machine it is not programming.

### 9.6 The heart is what moves things between substrates

Sedimentation needs a clock, because nothing else notices that something has
stopped changing.

```text
ran identically many times, no exceptions        → propose hardening
hardened, and now failing or being worked around → propose softening
```

Both directions matter. A capability promoted into fixed form and then quietly
routed around is worse than one that was never hardened: it is dead structure
that still reports as present, which is §1.7 in a different costume.

This closes the circuit between the two halves of this document. The heartbeat is
not only how the company stays alive. It is how the company gets **cheaper at
what it already knows how to do**, without losing the ability to change its mind.

## 10. Direction

The human input is `Direction`: horizon, objectives, priorities, constraints,
budgets, risk appetite, and what is protected. It is a versioned artifact
committed under effective human authority and institutionally signed.

> **The human decides where the company is going, the limits it may operate
> within, and what counts as success. The organization decides how to get there.**

The individual is not obliged to follow runs, choose models, compose agent
teams, approve routine deploys, read logs, decide retries, or keep intelligences
informed. None of that may be required of them, and none of it may sit waiting
for them.

It does not follow that any of it is closed to them. By §0.1 the individual may
enter any part of the company, at any depth, at any time. The distinction the
whole document turns on:

```text
NOT REQUIRED of the individual     all of the above
NOT PERMITTED to the individual    nothing
```

Direction is the instrument for steering without being present. It is not the
only door, and a company that treats it as the only door has built the
`Principal` at the edge that §0.1 rejects.

The distinction in §0.1 applies here without exception: Direction may declare
preference; claims about the world remain subject to evidence.

### 10.1 A Direction that cannot refuse anything is decoration

The test of a Direction is not whether it is inspiring. It is whether some
action the company might plausibly take is refused by it.

> **If nothing can hit it, there is no Direction — only a mood.**

Constraints MUST be evaluable **at the point of action**, by the mechanism that
authorizes it, and not read afterwards by someone assessing whether the spirit
was honoured. "Preserve cash runway" is a mood. "No commitment above X without
human signature" is a constraint: something reaches it and stops.

Objectives may be qualitative. **Constraints, budgets and what is protected may
not.**

### 10.2 Every consequential act names the Direction it was under

§1.11 requires that everything which acts be attributable to an author.
Direction extends that upward: an act is attributable to the **version of
Direction** in force when its authority was granted.

This makes *is the company on course?* answerable by selection rather than by
opinion, and it makes a change of Direction legible afterwards — work done under
the previous one is not wrong, it is **older**.

### 10.3 A change of Direction does not cancel work in flight

A new Direction is a new version, and §9 holds without exception: a new version
never erases its predecessor.

Responsibilities already granted are **re-evaluated, not voided**. Three
outcomes, and the system MUST be able to represent all three:

```text
still within Direction      continues, now attributed to the new version
outside the new Direction   authority withdrawn; work already done keeps its
                            evidence and its provenance
newly required              the change created an obligation nothing covers
```

The third is the one usually forgotten, and it is why a change of Direction is
an **event the organism observes**, not a document someone replaces.

## 11. Talent

Work is decomposed by **talent required**, not by task list.

```text
PROBLEM
   ↓  what capability does this need?
TALENT REQUIREMENTS
   ↓  who or what has it — internally and externally
CANDIDATES
   ↓  composition
CAST
   ↓
EXECUTION
```

A talent requirement describes the capability needed, never the identity that
will fill it. Humans, models, machines, internal offices and external agents are
all candidates for the same requirement, and the choice accumulates evidence:
outcomes feed back into what the company believes each talent is good at.

This has a direct consequence for human attention:

> **An interrupt does not imply a human.**

When something is missing, the first question is *what talent is required*, not
*who do we notify*. The human is reached only when the requirement is
specifically human — legitimacy, relationship, statutory authority, or direction.

### 11.1 A requirement is a structure, not a sentence

"We need someone good at legal analysis" cannot be searched, cannot be priced
and cannot be evidenced. A talent requirement MUST carry enough to be matched
and to be paid for:

```text
capability        what must be done, in the same vocabulary the store uses
bounds            what it may touch, and what it may not
evidence          what would count as having done it
ceiling           cost, latency and attention it may consume
deadline          after which not having it is itself a fact
```

Without a ceiling, selection is unbounded and the best available talent is
always the most expensive one. Without declared evidence, §9.1 cannot be
satisfied — the actor would judge its own work.

### 11.2 Evidence accumulates per pairing, never per talent

The company learns *this talent, for this kind of requirement*, not *this talent
is good*. A model excellent at one class of work carries no earned claim on
another, and a general ranking is precisely the shape that erases that
distinction.

### 11.3 The exploitation trap

Selection by accumulated evidence has a failure that arrives quietly: evidence
favours whatever has already been used, and what has never been chosen never
earns any. Given long enough, the company converges on its earliest habits and
calls the convergence experience.

> **A share of selection MUST go to candidates the evidence does not yet
> favour**, and their outcomes MUST count the same as any other.

This costs money on purpose. It is the price of not becoming a company that
knows only what it knew at the start.

### 11.4 When nothing satisfies the requirement

Absence is a result, not an error. A requirement that no candidate meets — inside
or outside — produces a **talent gap**, and a talent gap is an input to §14, not
a notification to a human.

```text
requirement → search → absent → talent gap
                              ├→ acquire externally
                              ├→ construct internally
                              └→ abstain
```

Deferral is abstention for now; it does not require another institutional state.
A gap that can be lawfully filled outside the institution need not become a build
project.

This is where the two halves of Part II join: talent selection consumes the
institutional repertoire, and its failures are what tell the company what to
build next. A gap that only ever becomes an alert is a gap the company will have
again.

## 12. Park, Backstage, Imagineering

```text
PARK            what the human sees. direction, outcomes, decisions that matter.
BACKSTAGE       offices, cards, responsibilities, talent, machines, LLMs at work.
IMAGINEERING    the part that builds new capability for the other two.
```

> **Backstage cognition is abundant. Human attention is scarce.**

The system MUST NOT optimize for fewest tokens, fewest calls, or fewest agents.
It optimizes for outcome per Direction, quality of evidence, and **minimum
human attention required**. Required is the operative word, and §12.4 is why. An important question may justify several independent analyses, an
adversarial reviewer, a quantitative model and a synthesis — and the human still
receives a recommendation, a reason, a confidence, and whether direction needs to
change.

Complexity in the backstage may grow aggressively. Complexity presented to the
human must shrink. That asymmetry is the product: it is what puts enterprise
leverage in the hands of one person.

### 12.1 The boundary is a projection, and it runs one way

The Park is not a filtered view of the Backstage. It is a **different
representation of the same reality**, compiled for a reader with different
needs, and the compilation is one-directional.

What MUST NOT cross into the Park:

```text
mechanism        which engine, which model, which runtime
retries          attempts, backoff, queue depth
accounting       token counts, context sizes, call graphs
configuration    prompts, harnesses, tool schemas, orchestration
```

None of that is secret. It is simply not the human's work, and putting it in
front of them does not inform — it recruits.

"One-directional" means backstage mechanism does not leak upward into the Park
representation. It does **not** mean the individual may never descend into
evidence or underlying work. Amplification (§12.4) is the lawful return path: the
human follows the subject downward without being conscripted into operating the
machinery.

### 12.2 The failure has a name

When mechanism leaks upward, the human stops directing the company and starts
operating the agent's own systems: tuning the harness, maintaining the prompts,
reading the logs to find out what happened, writing the configuration that the
system should have derived.

> **The human becomes the operator of the machinery instead of the director of
> the company.**

This does not feel like failure while it is happening. It feels like being
close to the work, and it is rewarded socially — a sophisticated harness reads
as competence. It is nonetheless the exact inversion of the design: the scarce
resource spending itself on the abundant one.

The test is a single question:

> **Could the human do their job without knowing which engine ran?**

If not, the boundary has already been crossed, whatever the interface looks
like.

### 12.3 Imagineering is a third place, not a mode of the other two

Building new capability MUST NOT happen in the Park, because it would put
construction in front of the human. It MUST NOT happen invisibly in the
Backstage either, because what it produces becomes institutional and §9 governs
that.

It is its own place, with its own machinery, described in §14. Its inputs are
talent gaps (§11.4) and repeated work (§9.6); its outputs are candidates, and
candidates are promoted or they are not.

Authority obtained for operating the institution MUST NOT silently confer
authority to alter the capabilities by which the institution operates. Crossing
from operation into capability construction requires explicit authority
appropriate to that work. The mechanism may be a different grant, responsibility,
occupancy, run, or something not yet invented; the security property is the
boundary, not the mechanism.

### 12.4 Compression is the default, not the only mode

Minimum required attention describes the company running **without** the
individual. It does not describe the individual **working**. The Park MUST
support both, and they run in opposite directions.

```text
COMPRESSION     default. Thousands of cards, hundreds of runs and dozens of
                analyses arrive as: what changed, what needs you, what we
                recommend. The individual is absent, and nothing waits.

AMPLIFICATION   on demand. The individual takes an interest — "what is
                actually going on here?" — and the company reorganises around
                that attention: research offices wake, history is recovered,
                sources are pulled, contradictions are surfaced, specialists
                are cast, and the individual stays in it as deep and as long
                as they want.
```

Amplification is not an escalation and not an exception. Under §0.2 it is the
individual doing the work the company exists to enlarge — the journalism
itself.

> **In compression the backstage grows so that what reaches the individual
> shrinks. In amplification the backstage grows so that what the individual can
> reach expands.** The same asymmetry, pointed the other way.

The switch between them is the individual's interest, expressed in the ordinary
way — a question — and MUST NOT require a mode, a role change, or a different
surface.

A Park that can only compress turns its creator into the recipient of summaries
about their own company. That is §12.2 in mirror image: not the human dragged
down into the machinery, but the human held above their own work.

## 13. Attention, knowledge, and consequence are different systems

```text
CARDS      preserve ATTENTION      what may deserve another intelligence's notice
MEMORY     preserves KNOWLEDGE     what the company continues to know
PROCESS    preserves CONSEQUENCE   what actually came to be true
```

They connect. They MUST NOT impersonate one another.

A Card is not a fact. A memory page is not an authorization. A commit is not a
notification. Systems that collapse these end up with one undifferentiated
stream in which everything is equally urgent and nothing is provable.

The compiled perspective for a waking intelligence — the WakePack — is a
selection over attention, under an explicit budget and a recorded ranking, and it
MUST carry the reason each item was selected. Explainability is produced by the
selection, not requested from a model afterwards.

### 13.1 They connect in one direction only

Saying they must not impersonate one another is not enough, because the pressure
is always toward collapse: it is genuinely convenient to treat a well-argued
card as a fact.

The permitted path is promotion, and promotion runs one way:

```text
ATTENTION  →  something may deserve notice
              a card is a proposal about what matters. It is never evidence
              of anything except that an intelligence thought so.
    ↓ evidence, authority, §9
CONSEQUENCE → what actually came to be true
              a commit is a fact, with an author and a mandate behind it.
    ↓ synthesis
KNOWLEDGE  →  what the company continues to know
              compiled from what was committed and from sources, with
              provenance and contradictions preserved.
```

And the refusals:

```text
a card MUST NOT become a commit without passing §9
knowledge MUST NOT authorize anything — it has no mandate
a commit MUST NOT be produced in order to justify a card
```

A card may **reference** a commit. A commit may not be **created by** a card.
The difference is the whole of §8: authority descends from mandate, not from
salience.

### 13.2 What each one is allowed to lose

They also differ in what may be forgotten, and this is a design property rather
than an accident of retention policy:

```text
ATTENTION    expires. A card that no longer deserves notice SHOULD disappear,
             and the WakePack that used it remains as the record that it did.
CONSEQUENCE  never. Append-only. A commit that could be deleted was never a
             fact about the institution.
KNOWLEDGE    is revised, and keeps its lineage. Superseded knowledge changes
             state; it does not vanish, or the company loses the ability to
             say what it used to believe and why it stopped.
```

A system that gives all three the same retention has already collapsed them,
whatever its schema says.

### 13.3 Signed revisions are historical facts

A signed artifact revision is historical fact. Later state MUST NOT rewrite what
was signed. New evidence creates a new revision, which may supersede, correct, or
withdraw the earlier one without altering it.

```text
artifact@17  SIGNED
    ↓ new evidence
artifact@18  SIGNED · SUPERSEDES @17
```

Current state may change. Attributable institutional history only grows.

---

## 14. Where capability comes from

Section 9 says how a candidate becomes an institutional asset. It does not say
where candidates come from, and that is not a detail: **capability does not
arrive, it is constructed**, and the environment in which it is constructed
decides what can be built at all.

### 14.1 Coordination occurs through institutional capabilities

No institutional process SHOULD require one transient intelligence to recognize,
contact, trust, or continue another transient intelligence. Coordination SHOULD
occur through durable institutional state and stable institutional capabilities.

A stable institutional capability MAY itself use one or more intelligences
internally. Their identities are implementation provenance, not a dependency of
the caller. The caller invokes the institutional capability and relies on its
contract; which model, ensemble, challenger, or non-model mechanism fulfills it is
an occupancy decision behind the boundary.

This is the social corollary of §7: continuity belongs to the institution, not to
the transient intelligence sitting in a chair.

### 14.2 Construction happens in the operational ontology

A builder does not write code that will later be run. It manipulates the same
things the operator will meet.

```text
HUMAN SOFTWARE          AGENT SOFTWARE

page / screen           context / resource
button                  capability / affordance
text box                input / semantic slot
link                    relation
click                   invoke / traverse
disabled button         unavailable capability, with its reason
form                    structured intent
navigation              traversal
onClick                 effect / transition
validation              precondition / policy
loading                 running operation
success message         evidence / result
error message           failure state + recovery affordance
```

The builder says *add an action called Publish; make it available once
conformance passes; when it succeeds, expose Verify.* It does not say *create a
vertex and an edge* — that is implementation vocabulary, and asking for it is
the same mistake as asking a human designer to write the DOM.

> **What you operate is what you build.**

The compiler produces the canonical structure. The builder never has to know
how it is stored, any more than a designer needs to know how a button is
represented inside the tool.

### 14.3 Construction is durable and incremental

The unit of construction is a change to a persistent object, not a generated
output.

```text
call 1 → Δ₁     call 2 → Δ₂     ...     call n → Δₙ

Software(n) = Software(0) + Σ Δᵢ
```

This is the property that matters most, and it is arithmetic rather than
optimism: work stops evaporating at the end of each call. Call 183 does not
have to hold the previous 182 in mind. It opens the region it needs and works
there.

The consequence is that **the context window stops being the unit of software
size**. A simple program can cost one call; a large one costs many small ones,
and neither requires a single monstrous act of generation.

There is a cost this creates, and it must be paid deliberately: each call must
now **locate** where to work. The window is no longer the limit on storage, but
navigation becomes the limit on progress. This is precisely why §14.5 matters —
the account of a program is not documentation, it is the index that makes
navigation cheap. Without it, call 183 wanders, and the sum stops closing.

### 14.4 Reuse is by content, not by regeneration

The builder manipulates meaning. The build system manipulates exact content.

```text
without content addressing        with content addressing

call 1 → produces A               A = digest AAA
call 2 → may regenerate A         B = digest BBB, depends on AAA
call 3 → reinterprets A and B     C = digest CCC, depends on AAA + BBB
```

"Use Approval" MUST resolve to an exact prior artifact, not to an instruction to
write Approval again. Without this, accumulation is an illusion: each call
quietly re-decides what earlier calls already settled, and the program drifts
while appearing to grow.

### 14.5 The repository is not the running program

Entering a program's repository is not the same as using the program. A file
tree is a poor projection for either species of operator; the useful projection
is an **account of the program**:

```text
what it is                what it depends on
why it exists             how it was tested
how it is structured      how it changed
how it behaves            how to materialize it
what was decided, and why
```

Materialization happens on **preview**: the revision is resolved, its closure is
built from content, and a real environment comes up. Until then, the operator is
reading about the program, not running it — and that distinction MUST be visible,
because a description that behaves like a demo is the most misleading artifact
available.

Everything quantitative in that account falls under §9.2: counted, measured, or
read from a run. Never typed.

### 14.6 The builder may take the operator's seat

The builder SHOULD be able to enter its own creation as the operator will meet
it, invoke it against a real sandbox, and return with what actually happened.

```text
build → preview as operator → invoke → observe → return with evidence
```

This is the agentic equivalent of clicking your own button, and it is the most
valuable feedback in the environment — because what returns is *behaviour*, not
an assertion.

It is not, however, exempt from §9.1. Observing your creation behave is evidence
of behaviour. Declaring it correct is still authorship. The distinction is
narrow and load-bearing: the sandbox may report `Publish produced state ACTIVE
and Verify was not exposed`; only something the builder did not write may
conclude that this is acceptable.

### 14.7 Everything constructed is provisional

Construction is where the organism SHOULD experiment aggressively, and provisional
work SHOULD be fully functional — otherwise experiments are not real and prove
nothing.

What provisional work MUST NOT be is quietly institutional. It carries no
mandate, appears in no roster as a live organ, and receives no heartbeat until
promoted. The gate is §9, and the failure to guard it has a specific shape worth
naming: an experiment that works, gets used because it works, and is depended on
by three other things before anyone notices it was never admitted.

That is how parallel power is born from good intentions rather than bad ones.

---

# PART III — CONFORMANCE

A claim that cannot fail is not a claim. Each property below names the
observation that refutes it.

## 15. Negative controls

| # | Property | Refuted by |
|---|---|---|
| 1 | The heart is required | Freshness window passes with no beat and the system still reports HEALTHY |
| 2 | The rate is variable | Beat interval is constant while epistemic state changes |
| 3 | Observability sets the rate | A scope goes UNKNOWN and the next beat is not brought forward |
| 4 | Deadlines are written on emission | An organ that never answers is never provoked again |
| 5 | Level-triggered | A missed event is not repaired on the following sweep |
| 6 | Roster is the coverage contract | An unregistered component is reported HEALTHY |
| 7 | Idle is verified | An office whose runtime was deleted reads healthy for a week |
| 8 | Cheap liveness | Every liveness pass fully wakes every organ |
| 9 | Adrenaline preempts | An incident does not defer scheduled maintenance |
| 10 | Adrenaline decays | An unclosed incident leaves the system at high frequency indefinitely |
| 11 | Emergency path is tested | The signal ingress is dead and no scheduled check notices |
| 12 | Signals are admitted, not trusted | An unauthenticated sender sets `occurred_at` and it is believed |
| 13 | Everything that acts is attributable | An effect exists with no author, no run, and no beat |
| 14 | Drift reads as agency | A provider resource absent from desired state is reported only as repair |
| 15 | Abstention works | A contradiction is averaged, or an uncertain effect is auto-retried |
| 16 | Authority narrows | A subagent obtains a capability its parent did not hold |
| 17 | Execution is not commit | Producing an artifact makes it canonical without promotion |
| 18 | Office outlives occupancy | Replacing a model loses the office's history or authority |
| 19 | Human attention is scarce | The human is notified of something no talent search attempted first |
| 20 | Selection is explainable | A WakePack cannot say why an item was included |
| 21 | An engine is not an organ | The organ cannot name what it retains if the engine is removed |
| 22 | An engine is not modified | A fork of an engine exists in the tree |
| 23 | Engine assumptions are reconciled | An admitted engine materially changes its capabilities or constraints and no reconciliation detects that the institution's assumptions are stale |
| 24 | Engines do not double up | Two engines occupy the same role and neither is scheduled to displace the other |
| 25 | Meaning is not adopted | An engine defines identity, delegation, authority or approval on PowerFarm's behalf |
| 26 | Lowering is real | A PowerFarm concept cannot be expressed without the engine present |
| 27 | Evidence is independent | A check was authored by the actor it checks |
| 28 | Accounts are derived | A published figure about the system was typed rather than computed |
| 29 | Decisions are enforced | A stated design decision resolves to no constraint, and is not marked as intent |
| 30 | Substrate is chosen | A capability that never changes is still re-reasoned on every run |
| 31 | Hardening is reversible | A fixed capability is being routed around and nothing proposes softening it |
| 32 | Failures speak upward | A compilation error can only be understood in the substrate's terms |
| 33 | Building uses the operating ontology | The builder is required to author implementation structures directly |
| 34 | Accumulation is real | A later call regenerates what an earlier call already produced |
| 35 | Preview is distinguishable | A description of a program is presented as if it were running |
| 36 | Provisional stays provisional | Unpromoted work is depended on by admitted work |
| 37 | Direction can refuse | No plausible action is forbidden by the current Direction |
| 38 | Constraints are evaluable | A constraint is assessed after the act instead of at it |
| 39 | Acts name their Direction | A consequential act cannot say which Direction version it was under |
| 40 | Direction change is observed | A new Direction silently voids work in flight, or creates no obligation |
| 41 | Requirements are priced | A talent requirement carries no ceiling and selection is unbounded |
| 42 | Evidence is per pairing | A talent carries a general ranking across unrelated work |
| 43 | Exploration is reserved | Selection only ever chooses candidates the evidence already favours |
| 44 | Gaps feed construction | A talent gap becomes a notification instead of an input to §14 |
| 45 | Mechanism does not leak | The human must know which engine ran in order to do their job |
| 46 | Promotion runs one way | A card becomes a commit without passing §9, or knowledge authorizes an act |
| 47 | Retention differs | Attention, consequence and knowledge are kept under the same policy |
| 48 | The individual may vanish | Any process waits on the individual in order to continue |
| 49 | The individual may return | Re-entering a subject requires replaying history the company already holds |
| 50 | Nothing is closed to them | A part of the company is unreachable by the individual because they are not its operator |
| 51 | Escalation is not a fallback | A failure resolves as "ask the owner" with no talent search behind it |
| 52 | Amplification exists | Interest cannot expand into investigation; the Park only compresses |
| 53 | The work is named | The company cannot say what it does without describing its own architecture |
| 54 | Revenue is undecided, not assumed | Any plan depends on a revenue mechanism §0.2 does not declare |
| 55 | Cost is asked per card | Frontier is chosen at design time and never re-asked at eval |
| 56 | Stable competence sedimentates | Recurring frontier inference continues for a stable, sedimentable work class and triggers no construction or reconciliation |
| 57 | Admission is per work class | An implementation is admitted to a work class without sufficient evidence of reliability for that class |
| 58 | The Lab decides | An implementation is selected on published or external benchmarks with no delivery benchmark on the actual subject |
| 59 | Build is justified by ownership | PowerFarm builds an adequately available capability even though no semantics, authority, evidence, continuity, or other institution-owned property would be surrendered by adoption |
| 60 | Institutional speech is committed | Model output is presented as PowerFarm speech without effective authority committing the exact artifact revision |
| 61 | Signature binds a revision | A signed artifact is changed in place without creating a new revision |
| 62 | Effective capability is reconstructable | A consequential act cannot reconstruct why that capability was available to that actor in that context |
| 63 | Challenge is not denial | A resolvable policy failure is flattened into denial and exposes no lawful path toward resolution |
| 64 | Operation does not confer construction | Authority to operate a capability silently permits alteration of the capability itself |
| 65 | Coordination is institutional | A process depends on one transient intelligence recognizing, contacting, trusting, or continuing another transient intelligence |
| 66 | Detection removes consequence | An unattributed or no-longer-authorized actor is detected but can continue creating new external consequence |
| 67 | Direction is not evidence | A human preference or conviction is treated as evidence for a claim about reality, feasibility, performance, markets, or consequences |
| 68 | Signed history only grows | A later state rewrites what an earlier signed revision said |

## 16. The whole-system test

Set Direction. Stop operating the company. During the window, deliberately
cause:

```text
a provider fails
an occupancy is replaced
a worker dies mid-run
a capability is missing
an external effect becomes uncertain
infrastructure drifts
two sources contradict each other
a registered organ stops answering
an unregistered process begins acting
```

The system must replace the occupancy, restore office context, resume the run,
search for talent, reconcile the uncertain effect, repair the drift, preserve the
contradiction, raise the silent organ, and contain the unattributed actor so it
can create no new external consequence.

The human should receive approximately this:

```text
Direction remains on track.

Since your last visit:
  one provider was replaced automatically
  one infrastructure drift was repaired
  one unattributed process was detected and isolated
  one market risk was investigated

One strategic question needs your direction:
  ...
```

**That output is the product.** Everything in Parts I and II exists to make it
truthful.

### The second half of the test

Absence is only one of the two tests in §0.1. Run the other immediately after.

Arrive with a question about something you were not following:

```text
"what is actually going on with this?"
```

The company must, without asking you to reconstruct anything: recover what it
already knows on the subject, surface the contradictions it is holding, name
what it does not know, wake the offices whose work touches it, cast the talent
the question needs, and stay in it while you change the question.

```text
FAILS IF   you are handed a summary and nothing more
FAILS IF   going deeper requires a mode, a role, or a different surface
FAILS IF   the company must be told what it already recorded
```

The first test proves the company does not need you. The second proves it did
not dismiss you. A system that passes only the first has been built wrong, and
it will pass every audit while doing so.

---

# Appendix — what exists today

This appendix is derived operational truth, not permanent constitutional prose.
It SHOULD be generated from authoritative manifests, evidence, and build artifacts
wherever possible. Manually maintained state is an explicit temporary exception.
When operational reality changes, this appendix MUST change with it.

Written in the same discipline the release manifests use: `not_run` is a valid
and required answer.

```text
BUILT AND VERIFIED
  Cards 1.0.0            attention spaces, 13 tables, RLS, deterministic
                         ranker with persisted rationale, WakePack compile,
                         SDK, CLI, OpenAPI. 8/8 tests, secret guard,
                         migration check pass.
  Registry               identity, keys, OAuth clients, artifact manifest
                         with source/commit/sha256 admission.
  Superstructure         brand system, UI packages, 7 kits, catalog,
                         cadence contract, provider probe, autonomy levels,
                         health contract with three states.
  Process runtime        canonical event kernel, sealed grants, kind digests,
                         conformance and acceptance suite, portable export
                         with offline verification.
  Platform               workspace, gatekeepers, code mode, gadgets,
                         blueprints, agent spawner, execution envelope,
                         effect store.
  Memory                 knowledge compiler over a canonical markdown brain,
                         provenance and contradictions preserved.

BUILT AND VERIFIED LOCALLY; NOT DEPLOYED
  Heartime               pure scheduling, idle-liveness discipline, durable
                         PostgreSQL contracts, open-beat recovery, and one
                         private physical wake setting configurable by
                         ReconcilerRef. Migrations are structurally verified and
                         applied in order against a disposable in-process
                         PostgreSQL, which also exercises the real trace RPC. No
                         hosted database, production migration or Worker
                         deployment is claimed.
  Organ roster           desired state, validation, and level-triggered
                         reconciliation planner. No live organ register or
                         production coverage claim exists yet.
  First Seam             permanent attention contract, portable controller,
                         private setting, versioned organ ports, and vertical
                         reconciliation evidence. The live Cards, Registry,
                         Process, Platform, and Evidence bindings are not deployed.
  Sedimentation          permanent capability-learning contract, digital
                         substrate succession, stateless harden/soften
                         reconciler, private setting, independent-evidence
                         gates, and vertical lifecycle verification. It can
                         create construction, evaluation, and succession
                         obligations; it cannot activate or promote. Live owner
                         ports are not deployed, and no real capability has yet
                         changed substrate.

DESIGNED, NOT BUILT
  Parallel-power detector  attribution invariants exist; nothing reads them.
  Signal admission       signal ingress requires `source` but does not
                         authenticate it, grade trust, or distrust
                         sender-declared time.
  Talent search          no internal or external capability search.
  Construction env       §14 entire. Nowhere to build a capability in the
                         ontology it will be operated in; no durable
                         construction state, no content-addressed reuse, no
                         program account, no preview-as-operator. Sedimentation
                         can request this work but does not impersonate it.
  The Lab                §0.4. Three used 2020 Mac minis exist; two headless
                         machines are operational Lab hardware and the personal
                         machine is not part of the Lab. The headless machines
                         carry 512 GB disks and 16 GB / 8 GB memory. Approximately
                         fifteen local models are resident on disk, with one in
                         memory at a time. Rotation state requires reconciliation:
                         the previous §0.4 described a scheduled rotation script
                         while the previous Appendix said none exists. There is no
                         model roster, work-class benchmark, or path by which a
                         card reaches a local model.
  Cost function          §0.3, in two halves that must not be confused.
                         The ceiling half is BUILT AND VERIFIED LOCALLY: a Card
                         carries an explicit energy authorization vector and a
                         monetary ceiling in integer micros, Process owns the
                         authorization, Heartime owns admitted consumption, and
                         circulation is blocked on exhaustion, overdraw, or an
                         authorization outside its window. The frontier half is
                         still DESIGNED, NOT BUILT: nothing asks the Automation
                         Max question per card at eval time, no card can select a
                         cheaper rung, and there is no path by which a card
                         reaches a local model. The ladder is written and still
                         never descended.
  Amplification          §12.4. The compression direction is designed; the
                         expansion direction has no surface, no mechanism and
                         no test.
  Revenue                §0.2. Not decided, and deliberately not written.

ENGINES — HOW THEY ARE HELD TODAY
  set correctly     an agent runtime running unchanged inside an isolate
                    substrate through a small compatibility membrane. No fork,
                    no reimplementation. This is the pattern §5.2 describes,
                    and it already exists.
  held as a fork    the knowledge engine is a fork, and upstream is archived.
                    By §5.2 this is debt, not a decision: the occupancy is
                    ending and succession is the response.
  under-reached     the agent runtime in use is several versions behind the
                    branch that was studied, and the setting exposes a fraction
                    of what the engine offers. §5.3 drift, unmeasured.

NOT CONNECTED IN ANY DEPLOYED FORM
  Circulation now exists as verified local goldens: a Card is emitted by
  Heartime, projected into a sealed engine-neutral ExecutionSlice, admitted by
  Process, executed identically by three pinned engine runtimes, and settled
  with evidence — including recovery across a lost receipt, a stale Occupancy
  and a takeover. Every one of those goldens runs in-process against SQLite and
  disposable PostgreSQL. Not one of them runs against a deployed organ.

  Of thirty possible directed edges between the six organs, no live edge exists.
  The one that was described previously was a hardcoded preview URL that the
  naming rules already forbid.

  The organs are built. The circulation is proven locally and connected
  nowhere.
```

**The engine gap analysis is not in this document.** Which engines are missing,
and whether a cluster orchestrator is one of them, is decided against §5.4 —
after this document is settled, not inside it. Recording the criteria first is
the point: an engine adopted before the criteria exist was adopted by
enthusiasm.

> **The work is not building organs. It is building the circulation, and that
> has not been attempted once. There is nothing to undo.**

---

Copyright © 2026 PowerFarm. All rights reserved.
