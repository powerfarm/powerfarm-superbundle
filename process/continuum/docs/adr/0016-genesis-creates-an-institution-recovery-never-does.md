# ADR 0016: Genesis creates an institution; recovery never does

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** accepted

## Decision

> **Genesis creates an institution. Recovery must never create one.**

Losing or replacing the canonical store may not let a runtime silently create a
new institution and mistake it for the previous one.

`Kernel.init()` ambiguously meant three different things. They are now three
verbs with three different preconditions:

| Verb | Precondition | Effect |
| --- | --- | --- |
| `create_institution` | the store holds no institution | runs the genesis ceremony, once, and returns the anchor |
| `open_institution` | the store holds exactly the named institution | attaches; can never run genesis |
| `restore_institution` | the store is empty and a verified bundle is supplied | rebuilds an existing institution; never runs genesis |

## Identity is not physical

The anchor names nothing that can move:

```text
institution_ref     the identity assigned once, at genesis
genesis_ref         the identifier of the genesis act
genesis_digest      the hash of the genesis act itself
trust_root_ref      the institutional seal key fingerprint
protocol_version    the storage/protocol format
```

`anchor_digest` binds those five so one value can be pinned by a runtime.

No hostname, no file path, no database URL, no engine. A store may move between
files, hosts or engines without changing a single field — proved by
`test_store_may_move_without_changing_institutional_identity`.

The anchor is **derived from the ledger**, not read from a metadata row. The
genesis act is the fact; metadata is a cache of it. Something that rewrote
metadata alone is still caught, which is exactly what
`test_right_institution_ref_with_incompatible_lineage_is_refused` exercises: a
store handed the correct `institution_ref` is still refused, because its genesis
is not the expected genesis.

## OPEN fails closed

`open_institution` refuses when:

- the store is empty — *an empty store is not authorization to bootstrap*;
- `institution_ref` differs;
- genesis differs;
- the trust root differs;
- the protocol version differs.

Differences are reported field by field. "Wrong institution" and "right
institution, wrong genesis" are different accidents and lead to different
recovery actions.

The mechanism that makes this hold operationally is that **a handle which names
the institution it expects is not authorized to found one.** A normal runtime
therefore has no path to genesis at all, and cannot fall back to it when the
store turns out to be empty.

## RESTORE proves continuity, not just identity

Restore rebuilds from a verified portable bundle and never mints an act:
restoring an institution is not an event in its own history.

Identity alone is not enough. A stale copy carries the correct
`institution_ref`, the correct genesis and a clean audit, and is still the wrong
institution to run — it has lost everything admitted after it was taken.

Continuity therefore reuses the witness mechanism that already exists rather than
inventing a second one. `checkpoint()` produces an external, sealed anchor over
branch heads, and `verify_checkpoint()` already asks exactly the right question:
is every anchored head still in the current history? A stale restore fails it.
`assert_continuity()` is that check, promoted to a refusal.

Restoring **without** a witness is permitted and is honestly weaker: it proves
identity, not currency. The API says so, and the negative control
`test_a_stale_restore_is_refused_when_a_later_witness_exists` shows both halves
— the stale copy is accepted on identity and refused on continuity.

## Evidence

`process/continuum/tests/test_institution_identity.py` — seventeen negative
controls covering each case the owner named: the canonical store disappearing and
an empty store taking its place; an operator running normal startup against an
empty store; attempting bootstrap a second time; a store belonging to another
institution; a correct `institution_ref` with incompatible lineage; a stale
snapshot restored when a later witness exists; a legitimate restore preserving
institution, genesis and lineage; and the store changing physical location
without any change of institutional identity.

The ADR 0014 harness proves the same design holds for **both** candidate commit
shapes, so this fix does not prejudge the canonical-commit decision. It also
keeps a `CONTROL-LEGACY-STARTUP` control that reproduces the original fork the
moment the stated expectation is removed, so the scenarios pass because the
refusal works rather than because the harness stopped seeing it.

## What this does not do

It does not decide SQLite versus PostgreSQL. [ADR 0014](./0014-canonical-commit-is-decided-by-falsification.md)
stays open.

It does not yet convert the rest of the system to the new verbs. The kernel
constructor remains backward compatible, so an unguarded `Kernel(path)` handle
that states no expectation can still found an institution — that is what
`create_institution` uses. Every operational startup path must be moved to
`open_institution` with a pinned anchor before the gate can close on this line.

---

Copyright © 2026 PowerFarm. All rights reserved.
