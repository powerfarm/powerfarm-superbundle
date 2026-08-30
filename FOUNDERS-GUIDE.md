# The Founder’s Guide to PowerFarm

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle` · **README**  
> **Navigate:** [Super Bundle](./README.md) · [Documentation map](./DOCUMENTATION.md) · [Canon](./canon/README.md) · [Contracts](./contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

PowerFarm begins with a simple observation:

**Intelligence is becoming abundant. Continuity, authority, memory, coordination, and institutional judgment are not.**

A language model can wake, understand a problem, use tools, produce work, and disappear. Another can wake later. The second mind should not have to begin from darkness. It should inherit a world made more legible by the first.

PowerFarm is not an agent framework, a workflow engine, a wrapper around models, or a database with an AI interface.

**PowerFarm is an institutional operating system for intelligence.**

Its purpose is to allow transient intelligences, human and machine, to participate in one durable organism without confusing execution with authority, conversation with memory, credentials with legitimacy, or activity with progress.

> **LLMs are occupants of moments. The institution remembers between them.**

## The organism

PowerFarm has six organs:

| Organ | Constitutional responsibility |
| --- | --- |
| **REGISTRY** | Institutional identity and durable reference reality |
| **ACK** | Acknowledgement and reception |
| **MEMORY** | Evidence, context, knowledge and epistemic continuity |
| **PROCESS** | Authority, admission, Direction and institutional consequence |
| **PLATFORM** | Execution mechanisms, capabilities and engines |
| **HOMEOSTASIS** | Health, pressure, cost, energy and systemic interpretation |

Heartime runs through the organism. It is not a seventh organ and does not govern the body.

**Heartime is circulation.**

What circulates is the **Card**, the canonical unit of institutional circulation.

> **Everything that lives in PowerFarm circulates as a Card. Everything that circulates feels Heartime.**

## Authority must descend

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

Each step narrows the one before it. A credential does not create Authority. Capability does not create Authority. Occupancy does not create Authority. Being technically able to act does not mean the institution has permitted the action.

**Process owns institutional Authority.**

Registry knows what exists. Platform knows how something can be done. Heartime knows when work should move. Memory knows what has been observed. Homeostasis knows how the organism is doing. None of those facts alone constitute permission.

## Office endures; Occupancy changes

An Office is institutional. An occupant is temporary.

Humans change roles. Agents are replaced. Models are upgraded. Workers crash. Sessions expire. Credentials rotate. The Office remains the durable locus of responsibility.

> **The executor may die. The obligation must not.**

When Occupancy changes, Heartime detects the discontinuity, Process decides whether takeover or resumption is valid, Registry resolves the successor, and the Card continues.

## Registry is reality, not government

Registry owns durable identity reality: Identity, Office, Occupancy, keys, Brand, OAuth, Store, Gadgets, Manifest lineage and artifact provenance.

It answers who, what Office, which Occupancy, which key and which lineage.

It does not decide whether an action may be performed, whether Authority may be delegated, whether a run may commit, or what institutional consequence follows. Those belong to Process.

> **Registry is the semantic center without becoming the authority center or operational bottleneck.**

## Process is where institutional meaning happens

Process is Continuum plus execution Settings. There is no decorative wrapper service whose only purpose is to rename the pieces.

Continuum carries admission, causal relationships, runs, evidence references, signatures, witnesses, receipts and consequence.

Google ADK, Vercel AI SDK and Microsoft Agent Framework can execute. A future engine can execute. A human can execute. None of them become Process.

> **Engine theirs. Organ ours. Setting ours.**

The engine spends authority it was given. It does not manufacture authority. It returns execution evidence. The institution interprets that evidence.

## Cards are the circulating medium

A Card survives across organs, engines, occupants and time. It carries references to institutional reality without pretending to own that reality.

Registry cannot conclude a run. Platform cannot expand Authority. Heartime cannot invent an observation. Memory cannot arbitrarily change scheduling. Process cannot rewrite historical evidence.

Cards evolve through attributed patches, not arbitrary replacement.

## Heartime is institutional circulation

Heartime notices when work should wake, stop, reconcile or return. It notices missing evidence, stale Occupancy, stale knowledge, replay risk, exhausted cost, absent `next_expected`, and energy spent without progress.

Process decides admissibility:

```text
ALLOW · DENY · CHALLENGE · ESCALATE
```

Heartime decides circulability:

```text
CIRCULATE · DEFER · BLOCK · RECONCILE
```

Do not merge them.

## The institution must remember the world

PowerFarm Memory is not chat history. Transcript is not knowledge. Model summary is not evidence.

Institutional epistemic state distinguishes:

```text
OBSERVED
INFERRED
ASSUMED
REPORTED
UNKNOWN
CONTRADICTED
```

The next intelligence must know what was seen, what was inferred, what evidence supports it, what is stale, what remains unresolved and when reality should be sampled again.

> **Every intelligence should improve the starting position of the next intelligence that wakes.**

This is why Microsoft Agent Framework session/context memory remains engine-local. It may receive a read-only projection from PowerFarm MEMORY, but it does not become the Memory organ and cannot silently write institutional knowledge back.

## Heartime is also an epistemic clock

The world changes while agents sleep. A prediction may fail. An observation may become stale. An absence may become new evidence.

`next_expected` and `next_sample` therefore describe when the institution must look again. No live obligation should become temporally invisible.

## Energy is finite

Tokens cost money. Humans cost attention. Tools cost latency. Sandboxes consume compute. Retries consume time.

Process authorizes limits. Platform measures. Heartime aggregates and enforces. Homeostasis interprets pressure.

Energy remains a vector because model tokens, milliseconds, tool calls and human attention are different physical quantities.

A particularly valuable signal is **energy spent without proportional progress, knowledge or consequence**. That is circulatory debt.

## Engines are replaceable

No provider or agent framework should become constitutional.

A Card is projected into a sealed, engine-neutral ExecutionSlice. ADK, AI SDK or Microsoft Agent Framework may consume it. The institutional run identity does not depend on provider IDs, model session IDs, AgentSession IDs, tool-call IDs or engine-specific invocation IDs.

```text
same Card
same institutional attempt
different engine
same institutional meaning
```

Engine equivalence is a hedge against technological dependency.

## Recovery is more important than happy paths

The dangerous failures happen between effect and acknowledgement: the effect succeeded, the receipt disappeared, the worker crashed, a retry arrived, Occupancy changed.

PowerFarm treats replay, recovery and reconciliation as architecture.

The correct target is not “nothing fails.”

> **Failure does not corrupt institutional meaning.**

## Observability must not become Authority

Every circulation should be reconstructible through stable correlation from Direction to Card, beat, attempt, engine invocation, tool, evidence and consequence.

But visibility does not create sovereignty. If the trace store fails, legitimate circulation should continue.

> **What can see the organism does not therefore govern the organism.**

## No PowerFarm-ish execution

The mature definition is severe:

> **Either execution is inside institutional Card circulation, or it is not PowerFarm institutional execution.**

There is no acceptable middle state where an engine has roughly the right IDs, a writer accepts an unbound “already admitted” batch, an adapter invents a run identity, or a test bootstrap leaks into production.

Convenience paths should be removed, not merely discouraged.

## The founder’s architectural test

When deciding whether something belongs in PowerFarm, ask whether it strengthens institutional continuity or merely makes an execution easier.

Ask:

- Does this create Authority or merely transport it?
- Does this belong to an Office or only its current occupant?
- Is this evidence, inference, telemetry or consequence?
- Does it survive engine replacement, process death and Occupancy replacement?
- Can a future intelligence reconstruct it without private session memory?
- Can every mutation be attributed to exactly one organ?
- Does power widen downstream?
- Does this create a second source of truth?
- Would removing today’s provider change the meaning of this object?

A healthy architecture excludes almost as much as it includes.

## Grow by sedimentation

Not every useful behavior deserves institutional machinery.

```text
experiment
  ↓
evidence
  ↓
repetition
  ↓
evaluation
  ↓
proposal
  ↓
admission
  ↓
institutional capability
```

PowerFarm should become more capable over time without becoming more accidental.

## The human role

Humans should not be biological cron jobs transporting context between transient agents. Human attention belongs where ambiguity, Direction, Responsibility, exception, values and consequence genuinely require it.

The machine should absorb coordination complexity without hiding institutional reality.

## What the founder must protect

PowerFarm will always be pulled toward gravitational collapses: Registry becoming permissions, Heartime becoming government, Platform minting Authority because it has credentials, Memory becoming “everything in a vector DB,” Cards becoming arbitrary JSON, or the newest framework becoming the architecture.

The founder’s job is to protect the boundaries that let the institution outlive its current implementation.

## The long horizon

PowerFarm is not fundamentally a bet on the models available in 2026.

If intelligence becomes dramatically cheaper and more abundant, institutional structure becomes more valuable, not less. A million capable agents without durable identity, authority, memory, consequence and coordination produce turbulence.

PowerFarm is a bet that increasingly powerful intelligence will need increasingly serious institutions, and that those institutions will need to exist in software.

## Founder’s North Star

PowerFarm succeeds when an intelligence can wake and immediately understand who it acts for, which Office it occupies, what Responsibility it inherited, what Authority it has, what Direction governs the work, what happened before, what is known, what is inferred, what remains unresolved, what resources remain, what may execute, what must not repeat, what evidence must return, when progress is expected, and what must be left for whoever wakes next.

Then it acts. It leaves evidence. It updates the world model. It spends bounded energy. It records uncertainty. It establishes the next expectation. It disappears.

Another intelligence wakes.

Nothing essential is lost.

## The founder’s promise

We are not building a smarter chatbot, a prettier orchestration layer, or a permanent monument to today’s AI stack.

We are building the durable substrate in which intelligence can become institutional.

Registry preserves who exists.
Process preserves what is permitted and what follows.
Platform executes.
Memory preserves what the institution has learned about the world.
Homeostasis tells us whether the organism is healthy.
ACK closes reception loops.
Cards carry obligations through the body.
Heartime keeps them alive through time.
Humans and machines occupy the moments.

The institution outlives them.

> **Every intelligence observes and records the world for the intelligences that have yet to wake.**

And if we build this correctly, the remarkable property of PowerFarm will not be that it contains intelligent agents. It will be that, despite those agents constantly appearing, changing and disappearing, **the institution itself never forgets what it is.**

---

Copyright © 2026 PowerFarm. All rights reserved.
