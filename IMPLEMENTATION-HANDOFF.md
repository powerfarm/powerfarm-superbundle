# PowerFarm implementation handoff

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle` · **HANDOFF**  
> **Navigate:** [Super Bundle](./README.md) · [Documentation map](./DOCUMENTATION.md) · [Canon](./canon/README.md) · [Contracts](./contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Date: 2026-09-01

This is a work-in-progress implementation checkpoint. The Deployment Readiness
Gate is CLOSED. No deployment topology, production migration, installation
sequence or infrastructure action is contained here, and none was performed.

## Where the work stands

`powerfarm.execution-slice.v4` is closed. Every call site, fixture, golden,
contract document and validator has been migrated, and the expiry negative
controls exist at Card, AI SDK, ADK and MAF level. Derived evidence no longer
claims more than it proves.

Two constitutional questions remain open and were deliberately not selected.

## Closed in this checkpoint

### ExecutionSlice v4 — the timed authorization boundary (B04)

`deriveExecutionSlice()` requires an explicit `evaluatedAt`. There is no default
and no fallback to `Card.updated_at` or to an implicit wall clock inside the
derivation function. The slice seals `resources.evaluated_at` and both energy and
cost authorization windows, using an inclusive `effective_at` and an **exclusive**
`expires_at`. The AI SDK, ADK and MAF Settings each verify the slice seal and then
revalidate both windows against an injectable clock immediately before the
external effect.

Recorded as [ADR 0012](./process/continuum/docs/adr/0012-authorization-is-checked-at-the-effect-boundary.md).

Negative controls, all executable:

| Layer | File | Proves |
| --- | --- | --- |
| Cards | `circulation/cards/tests/execution-window.test.mjs` | derivation and the shared temporal assertion, including the B04 regression itself |
| AI SDK | `process/continuum-ai-sdk/tests/adapter.test.mjs` | refusal as `POWERFARM_RESOURCE_WINDOW_INVALID`, with the admitted run closed as a failure |
| ADK | `process/continuum-adk/tests/test_execution_window.py` | refusal before any ledger effect is admitted |
| MAF | `process/continuum-maf/tests/test_execution_window.py` | refusal before any ledger effect is admitted |
| Contract | `scripts/validate-execution-slice.mjs` | the same properties as executed contract checks, not source greps |

Each layer covers: expiry after derivation; the exclusive `expires_at` boundary;
a cost window expiring alone; a rewound execution clock; and a successor occupant
or fresh engine invocation failing to widen an expired window.

One property is stated honestly rather than overclaimed:
`assertExecutionSliceTemporallyExecutable` trusts the window it is handed and
does **not** verify the seal. A hand-widened window passes that function. The seal
is what makes the window unforgeable, so every Setting verifies the seal first.
The tests assert both halves explicitly.

### Process and Heartime PostgreSQL proof boundaries

Disposable in-process PostgreSQL suites using pinned `@electric-sql/pglite@0.5.8`
apply the real migration chains in order and call the real RPCs through the
workers' PostgREST-shaped transport.

- Canonical Event IDs persist as `evt_<32 lowercase hex>` text instead of being
  cast to UUID (B01).
- `bootstrap_institution_v2` is current and returns
  `powerfarm.process.bootstrap.v2` (B02).
- The Heartime worker always sends an explicit institutional `component_ref`;
  `HEARTIME_COMPONENT_REF` overrides the default `pf.runtime.heartime` (B03).
  Trace attribute redaction is recursive across nested objects and arrays.
- Applying the real chain surfaced a schema bug SQLite had hidden:
  `act_signatures.registry_key_ref` could not become nullable while it remained
  part of the primary key. The table now has an identity primary key, requires
  either a Registry key reference or a fingerprint, and carries partial
  uniqueness indexes for both forms.

### Evidence semantics (B10/B11)

`scripts/derive-repository.mjs` no longer reports structural source counts as
executed tests with zero failures. `heartime/RELEASE.json` previously carried
`status: 'pass'` and `failed: 0` beside a regex count of `test(` declarations;
those fields are now `declared_not_executed_here` with an explicit `measurement`
string and a pointer to the report that does execute the suites. The release
JSONs use `declared_test_inventory` / `declared_test_cases`, and
`negative_controls_made_executable` became
`negative_controls_named_in_test_source` with a note that naming a control is not
proof that it is enforced.

`scripts/record-verification.mjs` classifies every recorded command:

| Class | What it proves |
| --- | --- |
| `structural` | the artifact looks right; nothing about any interface |
| `derived` | committed derived metadata is current |
| `executable-local` | in-process behaviour against in-memory or SQLite doubles |
| `executable-integration` | behaviour across a real interface — a real PostgreSQL engine, a pinned real engine runtime, or a subprocess |
| `external` | **absent.** Nothing here runs against a deployed PowerFarm, a live Registry, a live Cloudflare binding or a hosted database |

Assertion counts are reporter-aware: `assertions_passed` is `null`, never `0`,
for commands that report no counts, so "reports nothing" is no longer readable as
"ran zero tests". Four commands that `npm run verify` already ran but evidence
never recorded are now recorded: both PostgreSQL suites, the Heartime
migration-structure checks, and the release-integrity gate.

Deployment claims were reduced to what the proof supports. The Process PostgreSQL
writer is recorded as wire-verified against a disposable in-process PostgreSQL and
explicitly **not** the canonical admission boundary.

### Contracts and documentation

- `contracts/execution-slice.v4.json` is current; v1–v3 remain pinned as
  historical evidence. All prose references advanced from v3 to v4.
- `/api/head` and `/api/findings` were added to the Process OpenAPI contract,
  which advanced to 0.4.0 (B25).
- Source-shape checks in `scripts/validate-execution-slice.mjs` are prefixed
  `source shape:` so the evidence log distinguishes them from executed behaviour.
- [ADR 0011](./process/continuum/docs/adr/0011-future-is-not-a-noun.md) records
  the temporal vocabulary: `effective_at` is fact time, future obligation is
  carried by Commitment/Card/ReconciliationContract/Heartime, and an ordinary
  consequential act cannot be pre-admitted with a future effective time. It is
  `proposed`, and it explicitly does **not** decide the Authority boundary.

### Documentary truth (B27)

The canon operational appendix said three things that were no longer true, and
was corrected in place, as its own discipline requires:

- **Cost function.** It claimed no card carries a ceiling. Split into two halves.
  The ceiling half is built and verified locally: a Card carries an explicit
  energy vector and a monetary ceiling in integer micros, Process owns
  authorization, Heartime owns admitted consumption, and circulation is blocked
  on exhaustion, overdraw, or an authorization outside its window. The frontier
  half is still unbuilt: nothing asks the Automation Max question per card at
  eval time, and no card can reach a local model.
- **Heartime.** Migrations are now applied in order against a disposable
  in-process PostgreSQL, not merely structurally verified. No hosted database is
  claimed.
- **NOT CONNECTED.** Restated as `NOT CONNECTED IN ANY DEPLOYED FORM`.
  Circulation is proven end to end by local goldens — Card, Heartime,
  ExecutionSlice, Process, three pinned engines, evidence, settlement, and
  recovery across a lost receipt, a stale Occupancy and a takeover — and is
  connected to no deployed organ. "The circulation has not been attempted once"
  was false; "the circulation is connected nowhere" is true.

ADR 0007 stays `proposed` but no longer reads as though nothing was built. It now
records the Card-bound writer and private Service Binding that exist, states the
two reasons it is not yet accepted — no dedicated transactional principal, and
initial read policies of `authenticated using (true)` — and carries promotion
criteria.

## Verification

Environment note: `npm run verify:process` and the AI SDK golden tests invoke
`python`, not `python3`, and the ADK and MAF suites need `pytest-asyncio`. On a
host where `python` is absent those suites fail for environmental reasons that
look like product failures. Put a `python` on `PATH` before reading any result.

## Constitutional decisions taken

Three questions were put to the owner and answered. All three are recorded as
ADRs; none was selected in passing.

### Authority is valid where it is consumed — ADR 0013, accepted

Authority must hold at the **consequential boundary**, the point at which the
institution commits to the consequence it authorizes. Not generically at
`recorded_at`, and not necessarily for the whole duration of a long-running
operation. "The external effect begins" is the common implementation of that
boundary, not its definition.

Creating a future obligation and causing the future effect are two consequences
and consume Authority separately. A grant valid today may authorize admitting a
Commitment today; it does not pre-authorize the effect. This closes the case
where a grant expiring in 2090, recorded in 2089, carried Authority to a
consequence effective in 2099.

If Authority has lapsed by the boundary, the effect is blocked and the obligation
is untouched — the Commitment stays `OPEN` and Heartime keeps reconciling.
Losing Authority is not a way to discharge an obligation. Expiry *after* a
committed irreversible consequence does not undo it.

Accepted as the decision. The kernel still validates at `recorded_at`; ADR 0013
carries seven promotion criteria.

### Delegated Authority is a required incomplete capability — ADR 0015, accepted

```text
CURRENT IMPLEMENTATION:  root-only
REQUIRED TARGET:         Authority may descend only by narrowing
CONFORMANCE:             NOT YET SATISFIED
```

Root-only is a temporary safety envelope, not final v1 semantics, and the canon
is **not** amended to remove delegation — a temporary implementation limitation
does not get to rewrite the theory. Delegation is classified as a required
incomplete capability, distinct from optional backlog and from known debt: the
institution is not finished until it exists. Nine named negative controls and a
blocking gate line are recorded so it cannot decay into a `TODO`.

Containment logic exists and is tested in isolation. It was deliberately not
integrated in this pass.

### The canonical commit point is decided by falsification — ADR 0014, open

Not chosen by preference, and deployment topology does not vote. Both candidate
shapes face one identical failure schedule; the harness is at
[`experiments/canonical-commit/`](./experiments/canonical-commit/README.md):

```sh
npm run experiment:canonical-commit
```

Thirteen scenarios against real transactional engines. Each admission runs in a
child process that SIGKILLs itself at the injection point, so a crash is a real
crash and the next observation reopens the store from disk. A deliberately
forbidden shape — one that answers `ADMITTED` before the canonical commit
returns — runs alongside the candidates, and the command fails if the harness
does not catch it. A harness that only ever reports `HELD` proves nothing.

Two findings, neither of which chooses a shape:

1. **The failure schedule does not separate the shapes.** Every scenario the
   harness can reach yields the same verdict for both. The invariant set alone
   does not decide. What remains is architectural cost and the failure modes the
   harness cannot reach — chiefly a network partition between Process and a
   remote canonical store, which belongs to Shape B specifically and has not been
   run. Shape B cannot be chosen on this evidence.
2. **Bootstrap was a shape-independent fork hazard, and it was in the product.**
   Admission into a missing canonical store is correctly refused because the
   store is uninitialized — verified against the real Continuum kernel, which
   fails closed with `Institution is not initialized`. But `Kernel.init()`
   against that substitute store succeeded, producing a second institution with
   its own head; acts admitted into it were lost when the real store returned.

   **Now closed — see the next section.** The harness proves the fix holds in
   both candidate shapes, and keeps a control that reproduces the fork the moment
   the stated expectation is removed.

The experiment is deliberately not part of `npm run verify`. It is a decision
instrument, not a gate over the product, and it exits non-zero while a hazard is
open so its report cannot be read as green.

## The gate

[`operations/deployment-readiness-gate.md`](./operations/deployment-readiness-gate.md)
is now the single place the Deployment Readiness Gate is recorded. It is CLOSED.
A line is checked only where executable evidence exists.

## Institutional identity continuity — ADR 0016, accepted

> **Genesis creates an institution. Recovery must never create one.**

`Kernel.init()` meant three different things at once, which is why losing a store
could be mistaken for founding one. It is now three verbs:

| Verb | Precondition | Effect |
| --- | --- | --- |
| `create_institution` | the store holds no institution | the genesis ceremony, once; returns the anchor |
| `open_institution` | the store holds exactly the named institution | attaches; can never run genesis |
| `restore_institution` | the store is empty and a verified bundle is supplied | rebuilds an existing institution; never runs genesis |

**Identity names nothing physical.** The anchor is `institution_ref`, the genesis
act's ref and digest, the trust root fingerprint, and the protocol version, bound
by an `anchor_digest`. No path, host, URL or engine. The store moves between
directories in `test_store_may_move_without_changing_institutional_identity` and
the anchor does not change.

The anchor is **derived from the ledger**, not read from a metadata row. The
genesis act is the fact; metadata is a cache of it. A store handed the correct
`institution_ref` is still refused because its genesis differs — that is
`test_right_institution_ref_with_incompatible_lineage_is_refused`.

**OPEN fails closed** on an empty store, a divergent `institution_ref`, a
divergent genesis, a different trust root, or a different protocol version, and
names the differences field by field: "wrong institution" and "right institution,
wrong genesis" are different accidents. The mechanism that makes it hold in
operation is that a handle which names the institution it expects is not
authorized to found one, so a normal runtime has no path to genesis at all and
cannot fall back to it.

**RESTORE proves identity; a witness proves continuity.** A stale copy carries
the right `institution_ref`, the right genesis and a clean audit, and is still the
wrong institution to run. Continuity reuses the checkpoint mechanism that already
exists — `verify_checkpoint()` already asks whether every anchored head is still
in the current history, which is exactly the question — promoted to a refusal in
`assert_continuity()`. Restoring *without* a witness stays permitted and is
honestly weaker; the API and the tests both say so.

Seventeen negative controls in
[`test_institution_identity.py`](./process/continuum/tests/test_institution_identity.py),
covering every case in the brief. The CLI carries the verbs: `init` requires
`--create-new-institution` and prints the anchor, `--expect-institution` pins any
invocation, `restore` takes a bundle and an optional witness, `anchor` prints a
store's identity.

The ADR 0014 harness reproduces the original fork and proves it now fails closed
in **both** candidate shapes, so this does not prejudge the canonical-commit
decision.

### What this does not yet do

The kernel constructor stays backward compatible, so an unguarded `Kernel(path)`
handle that states no expectation can still found an institution — that is what
`create_institution` uses. The server, workers and engine Settings still open
whatever store they are pointed at. **The refusal exists but is not universally
reached until every operational startup path pins an anchor.** That is a separate
open gate line, recorded as such.

## Recommended continuation order

1. Pin an anchor on every operational startup path — server, workers, Settings —
   so the refusal added in ADR 0016 is actually reached in operation rather than
   only being available.
2. Run the network-partition case against a hosted PostgreSQL, then close
   ADR 0014.
3. Implement ADR 0013: move Authority resolution to the consequential boundary,
   with the seven promotion criteria as negative controls.
4. Card snapshot store and transition ledger (B07) — until these exist, "the
   executor may die; the obligation must not" is not true for Cards.
5. `EffectStore` with `execute/replay/blocked/uncertain` (B08), and independent
   effect observation. A runtime receipt from the runtime that executed is not an
   independent observation.
6. Commitment lifecycle: `not_before`, due, breach, satisfaction, waiver,
   cancellation, and derived `ReconciliationContract`s (B12, B14) — the promotion
   criteria are listed in ADR 0011.
7. Rename `ProcessAdmissionWriterPort` to something that says what it is, such as
   `ProcessPersistencePort` (B16). It persists already-admitted acts; calling it
   an admission port confuses the boundary exactly where the Universal Gateway
   will be built.
8. Make digest/reference-only a schema and validation rule rather than a
   convention of some Settings (B17), and constrain `heartime.signals.payload`.
9. Universal Ingress: one proposal grammar, one Process admission port, adapters
   per transport, one shared conformance suite.

---

Copyright © 2026 PowerFarm. All rights reserved.
