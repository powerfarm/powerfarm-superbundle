# ADR 0007: Postgres starts read-only to authenticated clients

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** proposed

## Decision

The candidate `continuum` schema grants reads to authenticated users but no direct writes. Admission requires a dedicated transactional principal before deployment.

## Current state

Since this ADR was written, a Card-bound write path was built. `continuum.admit_card_batch_v2` is the only writer authenticated callers can reach; the legacy `admit_batch_v1` routine is no longer directly executable by them, and the writer is reached through a private Service Binding that carries no service-role key. That path has been exercised against a disposable in-process PostgreSQL through the worker's PostgREST-shaped transport.

The ADR stays `proposed` for two reasons, not out of neglect:

1. The dedicated transactional principal it names does not exist yet. The writer currently authenticates on `caller.identity_ref` supplied by the caller plus an environment allowlist, and `request_sha256` is stored and format-checked rather than recomputed by SQL over the request body.
2. The initial read policies are `authenticated using (true)`, which grants broad visibility over the `continuum` and `heartime` schemas. That is compatible with "no direct writes" but not with a rich Observatory, which will necessarily hold sensitive data.

It also cannot be settled independently of the canonical-commit question: whether the durable Process commit is SQLite or PostgreSQL determines what this boundary is a boundary *of*.

## Promotion criteria

1. A dedicated transactional admission principal exists and is the only writer.
2. Transport authentication establishes the caller identity rather than accepting it.
3. `request_sha256` is recomputed at the trusted boundary over the request body.
4. Read policies are scoped rather than `using (true)`.
5. The canonical Process commit point has been decided.

---

Copyright © 2026 PowerFarm. All rights reserved.
