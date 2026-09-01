# Institutional startup paths

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Operations` · **INVENTORY**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

> **Every process knows which institution it is serving before it can do anything
> on that institution's behalf.**

The operational rule is:

```text
normal startup = OPEN EXISTING INSTITUTION
```

never:

```text
normal startup = init whatever is there
```

`CREATE` is reachable only through an explicit genesis ceremony. `RESTORE` is
reachable only through an explicit recovery flow. Neither is a fallback from a
failed open.

This is continuity of institutional identity. It is not authentication and it is
not Authority — it comes before both. See
[ADR 0016](../process/continuum/docs/adr/0016-genesis-creates-an-institution-recovery-never-does.md).

## The inventory

Every path that can cause admission or effect, and how it declares what it serves.

| # | Path | Opens what | Declares via | Fails closed on | Negative controls |
| --- | --- | --- | --- | --- | --- |
| 1 | Continuum CLI | SQLite store | `--expect-institution` (ref or anchor file) | empty, foreign, wrong genesis, wrong trust root, wrong protocol | `process/continuum/tests/test_institution_identity.py`, `test_cli_registry.py` |
| 2 | Continuum Observatory server | nothing — receives a read-only Kernel | inherits the CLI's pinned handle; refuses a writable Kernel | — | `test_cli_registry.py` |
| 3 | `ops` backup / doctor / metrics | nothing — receive a Kernel | inherit the CLI's pinned handle | — | covered by 1 |
| 4 | ADK Setting (`ContinuumPlugin`) | nothing — receives a Kernel, can `append` | required `expect_institution`, re-derived from the Kernel it was handed | undeclared, wrong ref, wrong genesis, inherited-but-wrong handle | `process/continuum-adk/tests/test_serving_institution.py` |
| 5 | MAF Setting (`ContinuumFunctionController`) | nothing — receives a Kernel, can `append` | required `expect_institution`, re-derived | undeclared, wrong anchor, inherited-but-wrong handle | `process/continuum-maf/tests/test_serving_institution.py` |
| 6 | AI SDK Setting (Python bridge child process) | SQLite store, in a child process | `expect_institution` carried in every request by `PythonContinuumPort` | undeclared child, empty store, foreign store, forged anchor | `process/continuum-ai-sdk/tests/institution-propagation.test.mjs` |
| 7 | ADK conformance driver | SQLite store, in a child process | founds its own institution, then serves it explicitly | covered by 4 | `conformance/circulation/engine-equivalence.integration.test.mjs` |
| 8 | MAF conformance driver | SQLite store, in a child process | founds its own institution, then serves it explicitly | covered by 5 | `conformance/circulation/engine-equivalence.integration.test.mjs` |
| 9 | Process worker | PostgreSQL, per request | `PROCESS_EXPECTED_INSTITUTION` + `PROCESS_EXPECTED_ANCHOR_DIGEST`; `continuum.assert_institution_v1` before any persist | undeclared env, absent institution row, different institution, different anchor | `process/worker/tests/process-writer.test.mjs`, `process/tests/process-postgres.integration.test.mjs` |
| 10 | Heartime worker | PostgreSQL, per alarm | `HEARTIME_EXPECTED_INSTITUTION` + `HEARTIME_EXPECTED_ANCHOR_DIGEST`; `heartime.assert_institution_v1` before arming or cycling | undeclared env, undeclared database, different institution, different anchor | `heartime/worker/tests/postgrest-state.test.mjs`, `heartime/tests/heartime-postgres.integration.test.mjs` |
| 11 | Attention reconciler worker | nothing institutional — reached only by a Heartime Beat | Heartime asserts before it may wake anything | — | covered by 10 |
| 12 | Sedimentation reconciler worker | nothing institutional — reached only by a Heartime Beat | Heartime asserts before it may wake anything | — | covered by 10 |

## Heartime needed a new seam

Heartime carried **no institutional identity at all**. Its tables key on
ReconcilerRef, organ and component, none of which say whose circulation this is.
A Heartime worker pointed at a restored snapshot, a second project or a copied
connection string had nothing to check.

Because a Heartime deployment serves exactly one institution, identity is a
singleton (`heartime.institution`) rather than a column on every table. That is
the smallest change that makes the question answerable, and every existing RPC
signature is unchanged.

## What is asserted, and when

The anchor is the same location-independent value the Continuum kernel derives
from its ledger: `institution_ref`, `genesis_ref`, `genesis_digest`,
`trust_root_ref`, `protocol_version`, bound by `anchor_digest`. Nothing about a
host, a path, a project or a connection string is part of it.

Workers are stateless request handlers, so for them **every request is a
startup**: the assertion runs before each persist and before each alarm cycle,
not once at deploy time. `process/worker/tests/process-writer.test.mjs` pins the
wire order — `assert_institution_v1` precedes `admit_card_batch_v2` — and the
Heartime control proves no cycle work happens before the assertion resolves.

That costs one extra authenticated RPC per persist, visible in the production
circulation golden as a second `registry.runtime-token` spend. Recorded rather
than hidden: it is the price of asking the question every time it can be
answered wrongly.

## Remaining exceptions

**One.** The Kernel constructor is still backward compatible: `Kernel(path)` with
no stated expectation may found an institution, which is what
`Kernel.create_institution()` uses internally and what test fixtures use to build
disposable institutions. No operational path reaches it — every path in the table
above declares — but the constructor itself is not sealed.

Closing it fully means making `expect` mandatory and giving genesis its own
constructor, which would touch every test fixture in the repository. It is
recorded as an open gate line rather than described as done.

---

Copyright © 2026 PowerFarm. All rights reserved.
