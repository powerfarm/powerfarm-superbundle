# Canonical commit — bounded decision experiment

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Experiments` · **EXPERIMENT**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Evidence for [ADR 0014](../../process/continuum/docs/adr/0014-canonical-commit-is-decided-by-falsification.md).
This is not a candidate implementation and must not become one.

```sh
npm run experiment:canonical-commit
```

The report is written to `report/canonical-commit-experiment.json`. The command
exits non-zero while any invariant is violated, so an open hazard cannot be
generated once and then read as green. It is deliberately **not** part of
`npm run verify`: it is a decision instrument, not a gate over the product.

## What is being decided

Which store holds the canonical Process commit — embedded, or PostgreSQL. The
decision is made by falsification, not preference, and deployment topology does
not vote.

The headline invariant:

```text
ADMITTED  =>  a canonical durable commit exists
```

alongside atomicity, idempotency, head correctness, deterministic replay and
unambiguous recovery.

## Shapes

| Shape | Canonical | Projection |
| --- | --- | --- |
| A | embedded (SQLite), single writer | PostgreSQL, fed by an outbox written inside the canonical transaction |
| B | PostgreSQL, transactional | embedded, rebuilt from the canonical record |

## How a crash is modelled

Each admission runs in its own child process (`agent.mjs`), which SIGKILLs
itself at the requested point. SIGKILL cannot be caught, so nothing flushes,
nothing unwinds and no exit handler runs. The next observation reopens the store
from disk. A caller is only ever recorded as having seen an outcome the agent
actually wrote before dying.

## The harness proves it can fail

A harness that only ever reports `HELD` may simply be unable to see a violation.
So a third, deliberately forbidden shape runs alongside the two candidates: it
answers the caller `ADMITTED` before the canonical commit returns. The report
records whether the harness caught it under
`harness_negative_control.harness_is_trustworthy`, and the command fails if it
did not.

## What the experiment has found so far

1. **The invariant set does not separate the two shapes.** Every scenario the
   harness can reach produces the same verdict for A and for B. Read
   `discrimination` in the report. The decision therefore cannot rest on these
   invariants alone; it rests on the recorded architectural costs and on the
   failure modes listed under `fidelity_limits`.
2. **Bootstrap was a shape-independent fork hazard; it is now closed.** The
   original finding was that admission into a missing canonical store is
   correctly refused because the store is uninitialized, but re-running
   *initialization* against that substitute succeeds — in the harness and in the
   real kernel — producing a second institution with its own head, whose acts are
   lost when the real store returns.

   The fix is in the kernel, as `Kernel.create_institution` /
   `open_institution` / `restore_institution`: startup names the institution it
   expects, an empty or foreign store is refused, and a handle that expects an
   institution can never found one. Scenarios 13 and 14 prove the same design
   holds for both candidate shapes, so it does not prejudge ADR 0014.

## The harness proves it can still see the fork

Scenario 13 now passes, which would be worthless if the harness had merely lost
the ability to observe a fork. A second control — `CONTROL-LEGACY-STARTUP` —
runs the original unguarded startup against the identical failure and must still
produce two institutions. Both self-checks are reported under
`harness_negative_control` and the command fails if either does not hold.

## What this harness cannot reach

Stated in the report under `fidelity_limits`, and repeated here because it
bounds every conclusion drawn from it:

- both engines are embedded and single-connection, so real multi-connection
  contention is not exercised;
- a network partition between Process and a remote canonical store is not
  modelled at all, and that failure mode belongs to Shape B specifically;
- the storage beneath the crash is a local filesystem, not a networked volume;
- admission commit semantics only — Authority, Occupancy, signatures and
  bitemporality are deliberately absent.

Shape B cannot be promoted on this evidence alone. The partition case has to be
run against a hosted PostgreSQL first.

---

Copyright © 2026 PowerFarm. All rights reserved.
