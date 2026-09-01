# ADR 0011: The future is a semantics over existing primitives, not a new entity

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** proposed

## Decision

PowerFarm does not introduce an entity called `Future`. Future meaning is expressed
as a closed semantics over primitives that already exist: bitemporal `Event`,
`Commitment`, `Card`, `ReconciliationContract`, Authority and resource
authorization windows, the epistemic record, and `Beat`.

Three sub-decisions follow, and only the first two are settled here.

### 1. `effective_at` is fact time, never scheduling

`effective_at` says when something is true in the world. It does not say when
anything should run. A scheduler that reads `effective_at` as a due time has
turned a fact into an instruction.

### 2. An ordinary consequential act cannot be pre-admitted with a future `effective_at`

Admitting today an act whose consequence begins in the future is not the same as
admitting the consequence. The institution may admit a *commitment* to attempt
something later. It may not spend today an authorization that will have lapsed by
the time the effect begins.

This is already enforced at one boundary. `powerfarm.execution-slice.v4` seals
`resources.evaluated_at` and both authorization windows into the slice, and every
engine Setting revalidates those windows against its own clock immediately before
the external effect — see [ADR 0012](./0012-authorization-is-checked-at-the-effect-boundary.md).
It is **not** yet enforced for Authority itself, which is still validated at
`recorded_at`. That gap is real and is stated as such below.

### 3. Authority is valid where it is consumed

Decided in [ADR 0013](./0013-authority-is-valid-where-it-is-consumed.md). Authority
must hold at the **consequential boundary** — the point at which the institution
commits to the consequence it authorizes — not generically at `recorded_at`.

Creating a future obligation and causing the future effect are two consequences
and consume Authority separately. A grant valid today may authorize admitting a
Commitment today; it does not pre-authorize the effect. When that effect reaches
its own boundary, Process re-resolves Authority at that time.

If Authority has lapsed or been revoked by then, the effect is blocked and the
obligation is untouched: the Commitment stays `OPEN` and Heartime keeps
reconciling. Losing Authority is not a way to discharge an obligation.

## The vocabulary this ADR fixes

Each row names one thing, who owns its truth, and what the passage of time does
to it. Different rows are different concepts and must not share a field.

| Concept | Institutional meaning | Owner of the truth | What the passage of time does |
| --- | --- | --- | --- |
| time passing | the observed clock advances | a trusted clock plus owner projections | may make `due`, `expired` or `stale` true; executes nothing |
| scheduled execution | a replaceable attempt to wake an executor at or after an instant | Heartime/Platform, as mechanism | if the wake is lost, no institutional truth disappears; level reconciliation finds it again |
| future obligation | an admitted commitment requiring satisfaction, waiver, cancellation or breach | Process plus the owning Office | survives the absence of both the agent and the scheduler |
| deadline | the limit after which non-satisfaction is itself an attributable fact | the Commitment/Card owner; Process admits the consequence | yields a derived `BREACHED`/`OVERDUE` state, not merely another wake |
| expectation | a promise that something will be revisited, observed or advanced | owner state plus `ReconciliationContract` | absence raises attention or UNKNOWN; it becomes a breach only when bound to a Commitment |
| authorization window | the interval in which a consequential boundary is permitted | Process | outside the window the proposal is inadmissible; the underlying obligation is neither created nor cancelled |
| condition becoming true | a proven change in an institutional predicate or world state | the owner of the fact, plus Evidence | makes an action eligible and may pull a wake earlier; executes nothing by itself |
| not before | an eligibility constraint | the Commitment / admission policy | an early proposal is rejected even where the technical capability exists |
| expiration | the deterministic end of a grant's or resource's validity | Process, or the owner of the authorization | the authorization becomes invalid; the earlier fact does not become false |
| staleness | evidence too old to support a decision | the Memory/Evidence projection | yields UNKNOWN or a challenge and new sampling; it is not revocation |
| retry | a new attempt after the previous result has been classified | Process plus EffectStore/Platform | must never be produced merely because time passed |

## Consequences

A scheduler is never the source of institutional truth. If Heartime disappears
between `not_before` and a deadline, the deadline still passes, and the breach
remains derivable from the Commitment plus a clock. A later reconciliation records
the discovery with the breach's `effective_at` and a later `recorded_at`,
preserving bitemporality.

The reverse also holds: a delivered Beat authorizes nothing. Waking a reconciler
only means the institution should look again. The reconciler re-reads the owner's
truth, observes conditions, and produces a proposal, which Process re-evaluates
against Identity, Occupancy, Authority, Capability, resources and evidence *at
that boundary*.

## What this ADR does not yet buy

Naming the vocabulary is not implementing it. As of this revision:

- `commitment.open` carries `due_at` and `reconcile()` can produce an overdue
  finding, but there is no durable breach/satisfaction/waiver lifecycle and no
  bridge from a commitment to Heartime.
- An expired deadline on a Card produces the transient gate decision
  `deadline_expired`, not a durable, attributed, evidenced breach.
- `next_expected`, `deadline`, `next_sample`, retry timing and liveness still
  share the informal role of "things in the future" across the implementation;
  this table is the intended split, not a description of the current field set.

## Promotion criteria

This ADR moves to `accepted` when all of the following hold:

1. `commitment` carries owner Office, satisfaction rule, `not_before`, optional
   `due_at`, activation-condition refs, admitting Authority, and a lifecycle state
   in `OPEN | SATISFIED | WAIVED | CANCELLED | BREACHED`.
2. A breach is derivable from the commitment plus a clock with every agent, worker
   and scheduler dead across the deadline, and a later reconciliation records it
   with the breach's own `effective_at`.
3. A proposal before `not_before` is refused even where the capability exists.
4. Cancellation and waiver each require Authority, and neither is reachable by the
   passage of time alone.
5. `ReconciliationContract`s are derived from commitments rather than authored
   beside them.
6. The Authority-boundary decision recorded in ADR 0013 is implemented: a
   consequential act with a future `effective_at` resolves Authority at its own
   boundary and cannot inherit the Authority spent admitting the Commitment.

---

Copyright © 2026 PowerFarm. All rights reserved.
