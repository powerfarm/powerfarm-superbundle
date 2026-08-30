# The shared database

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

One Supabase project, several organs. This is the contract that stops it
becoming a corridor.

## What happened

Measured 2026-08-23, recorded in `evidence/db-state-2026-08-23.json`:

```text
public                 19 tables · 42 policies · 4 subsystems mixed
migrations recorded     6, of which 2 have a file in any repository
numbering schemes       2 (sequential and timestamp, in the same table)
number 0004             used twice, by two different migrations
applied, unrecorded     1 (brand v0.3, via the SQL editor)
written, unapplied      1 (attention/Cards)
```

None of that was carelessness. It is what happens when three writers arrive at a
namespace with no boundary, and each is correct that nobody had claimed it.

The registry's own migration `0004` carries a comment saying a number already
spent is never reused. It was right about the principle and wrong about which
number was spent: the database's `0004` is `adk_runtime`.

## The rules

**1. `public` is closed.** Nothing new is created there. It has 19 tables from
four subsystems and no owner; adding to it is the act this contract exists to
stop.

**2. One organ, one schema.** The schema is the boundary and Postgres enforces
it, rather than the discipline of whoever chooses prefixes.

```text
identity      identities, identity_keys, identity_links, occupancies
manifest      artifacts, artifact_versions, artifact_relations
authority     grants, runs, run_artifacts, approvals, run_grants
platform      gadgets, workspaces, gadget_*
attention     cards (Cards 1.0)
heartime      the heart
adk           created by the engine. Not ours to touch — §5.2.
```

**3. Timestamps, never sequence numbers.** A sequence assumes one writer. There
are at least three, and they have already collided.

```text
<YYYYMMDDHHMMSS>_<organ>_<what>.sql
```

**4. One migration touches one schema.** A migration spanning two organs is a
boundary being crossed silently.

**5. RLS on every table, `created_by` on every table.** Both are already the
PLANO's invariants; this makes them checkable before they reach the database.

**6. Nothing writes with the service key at runtime.** `security definer` is for
resolving identity, not for carrying writes past RLS.

`scripts/db-policy.mjs` enforces 1–6 without credentials, so it runs on every
PR — which is where the next collision is cheap to prevent. All four violation
classes were tested and rejected: sequential numbering, a table in `public`, a
table without RLS, a table without `created_by`.

## What this does not fix

Moving the existing 19 tables into schemas is a separate operation, and a real
one: 42 policies, several functions and every application query resolve against
`public`. It is planned, not done, and it should not be done casually.

**Staging:**

```text
now      new organs land in their own schema. Costs nothing. Done for heartime.
next     reconcile the record: the unrecorded brand migration, the unapplied
         attention migration, and the two migrations in the database with no
         file anywhere.
later    move the existing tables, with the application changes that requires.
```

The order matters. Stopping the bleeding is free; the surgery is not.

## Heartime, as the first case

`heartime/migrations/20260823000000_heartime_genesis.sql` creates its own schema,
touches `public` only to read the identity tables that already live there, and
writes nothing into it. It resolves identity itself rather than importing
`current_identity_id()` from the attention migration — because that migration is
not applied, and because the heart has to stand when other organs do not.

## Heartime First Seam state

`heartime/migrations/20260823190000_heartime_first_seam.sql` is the evolutionary
migration that turns the pulse into a reconstructible reconciliation boundary.
It adds durable reconciliation contracts and observations inside the `heartime`
schema, and extends beats with references to the contract and reconciler that
caused the wake. It deliberately stores compact summaries only. Cards,
WakePacks, prompts, response bodies, workflow state, and organ-owned business
payloads remain outside Heartime.

The migration exposes versioned RPCs for the physical setting:

```text
next_reconciliation_wake_v1
prepare_cycle_v1
finish_cycle_v1
defer_failure_v1
```

A custom-schema PostgREST deployment must explicitly expose `heartime` in the
Supabase API configuration before these RPCs can be called. Runtime calls use an
institutional authenticated bearer and carry both `Accept-Profile: heartime`
and `Content-Profile: heartime`. The service-role key is not part of normal
runtime operation.

This migration is **built and structurally verified, not applied**. Structural
verification is useful evidence about declared boundaries and source shape; it
is not evidence that PostgreSQL accepted the migration or that production state
was changed. Staging application and rollback evidence are required before a
production authorization is considered.

---

Copyright © 2026 PowerFarm. All rights reserved.
