# ADR 0014: The canonical Process commit point is decided by falsification

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** proposed

## Decision

The canonical durable commit point for Process — embedded/SQLite or PostgreSQL —
is **not** chosen by architectural preference. Both candidate commit semantics are
subjected to the same invariants under the same failure schedule, and the one that
satisfies them at lower architectural cost is chosen.

This is a **bounded decision experiment**, not an open research programme. Once one
design clearly satisfies the invariants at lower cost, it is chosen and the work
proceeds. Two production architectures are not built; only the smallest faithful
implementation needed to falsify each shape.

Deployment topology does not vote. That PostgreSQL is where a hosted deployment
would live is not evidence about commit semantics.

## Context

Today the in-process kernel admits, and the PostgreSQL path persists
already-admitted acts afterwards. The institution can therefore answer
`ADMITTED` in a window where the durable replica may never receive the act.

The tempting resolution is to declare PostgreSQL canonical because it is the
store that already has migrations, RPCs and a worker. That would let the future
topology decide the present semantics. The equally tempting opposite is to declare
the embedded kernel canonical because it is currently the strongest component.
Neither is evidence.

## The invariant

```text
ADMITTED  ⇒  a canonical durable commit exists
```

There is no state in which the institution has answered `ADMITTED` and the
canonical durable commit does not exist. Alongside it, a winning shape must
preserve:

- **atomicity** — a batch commits entirely or not at all;
- **idempotency** — one request id yields one act;
- **causal and head correctness** — no lost update, no divergent head;
- **deterministic replay** — replaying the durable record reproduces the same
  state;
- **recovery without ambiguity** — after a crash, every act is unambiguously
  committed or unambiguously absent, never indeterminate.

## The failure schedule

Both shapes face the identical schedule:

| # | Scenario |
| --- | --- |
| 1 | kill Process immediately **before** canonical commit |
| 2 | kill Process immediately **after** canonical commit |
| 3 | kill between canonical commit and projection/replication |
| 4 | lost acknowledgement after a successful commit |
| 5 | duplicate request, same body |
| 6 | duplicate request, **different** body |
| 7 | concurrent head / CAS contention |
| 8 | atomic batch failure partway through |
| 9 | restart and replay |
| 10 | corrupted downstream projection |
| 11 | projection unavailable for an extended period |

Scenarios 10 and 11 are where the two shapes are expected to diverge most: a
projection that is behind, corrupt or absent must never be able to change what
the institution has admitted.

## Candidate shapes

**Shape A — embedded canonical, remote projection.** The kernel's transactional
commit is canonical. The remote durable store is fed by an outbox that can be
rebuilt entirely from the canonical record. Single canonical writer.

**Shape B — remote canonical.** Admission commits transactionally in PostgreSQL.
The embedded kernel becomes a local/development profile and a projection. Requires
a dedicated transactional admission principal.

## What is explicitly forbidden

Dual-write after admission. If the answer is that both stores must hold the act,
that is a replication decision downstream of one canonical commit, never two
commits that can disagree.

## Consequences of leaving this open

Until this ADR is resolved, several things stay blocked and are recorded as
blocked rather than quietly worked around:

- [ADR 0007](./0007-postgres-read-boundary.md) cannot be promoted, because what
  the read boundary is a boundary *of* depends on this answer.
- The port that persists already-admitted acts keeps a misleading name; renaming
  it is worth doing regardless, but what it *becomes* depends on this answer.
- No claim may be made that PostgreSQL is canonical.

## Results so far

The harness lives at [`experiments/canonical-commit/`](../../../../experiments/canonical-commit/README.md)
and runs as `npm run experiment:canonical-commit`. Each admission runs in a child
process that SIGKILLs itself at the requested point, so a crash is a real crash.
A deliberately forbidden third shape — one that answers `ADMITTED` before the
canonical commit returns — runs alongside the candidates so that a `HELD` verdict
means something; the command fails if the harness does not catch it.

Two results, neither of which chooses a shape:

**1. The failure schedule does not separate the shapes.** Every scenario the
harness can reach yields the same verdict for A and for B. The invariant set is
therefore not sufficient on its own to decide. What remains is the recorded
architectural cost and the failure modes the harness cannot reach — chiefly a
network partition between Process and a remote canonical store, which belongs to
Shape B specifically and has not been run.

**2. Bootstrap is a shape-independent fork hazard, and it is in the product.**
Admitting into a missing canonical store is correctly refused because the store is
uninitialized. That refusal is load-bearing, and it was verified against the real
Continuum kernel rather than only against the model: opening a `Kernel` on a
missing store creates the file, and `append` then fails closed with
`Institution is not initialized`.

But `Kernel.init()` against that same substitute store succeeds. A second
institution appears, with its own head; acts admitted into it are lost when the
real store returns. Nothing distinguishes "the canonical store is missing" from
"this is a new institution", so bootstrap cannot refuse.

This is not an argument for either shape. It is a requirement on both:

> Initialization must be bound to an institution identity that a substitute store
> cannot claim.

A recovery runbook that re-runs bootstrap after losing the store currently forks
the institution instead of restoring it.

## Promotion criteria

This ADR moves to `accepted` when:

1. ~~A harness applies the full failure schedule to both shapes under identical
   conditions, against real transactional engines rather than doubles.~~ **Done.**
2. ~~Every scenario reports, per shape, whether each invariant held.~~ **Done.**
3. ~~The report distinguishes "invariant violated" from "invariant preserved at a
   cost" and names the cost.~~ **Done.**
4. The network-partition case is run against a hosted PostgreSQL. Shape B cannot
   be promoted without it, because the harness cannot model the one failure mode
   that is specific to putting a network on the commit path.
5. Multi-connection contention is exercised against a real server, for whichever
   shape is expected to serve more than one writer.
6. The bootstrap fork hazard has a fix that holds for whichever shape is chosen.
7. A shape is chosen, with the observed failure semantics cited as the reason.
8. The rejected shape's failure modes are recorded, so the decision can be
   revisited against evidence rather than reopened from preference.

---

Copyright © 2026 PowerFarm. All rights reserved.
