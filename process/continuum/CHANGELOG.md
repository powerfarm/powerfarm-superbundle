# Changelog

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum` · **HISTORY**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

## 0.4.0

- Writable kernels now require a RegistryDirectory by default; the retired embedded identity directory requires explicit `identity_mode="embedded-test"`.
- Production persistence is Card-bound through `admit_card_batch_v2`, which binds request replay to Card, beat, attempt and exact ExecutionSlice digest.
- The legacy `admit_batch_v1` transaction routine remains internal and is revoked from authenticated callers.

## 0.3.1

- Added atomic `Kernel.append_batch()` admission with causal aliases and full rollback on refusal.
- Added narrow continuation authority for `run.finish` and `run.fail`: an already-authorized run can always record its outcome when the same actor/office cites the exact `run.start`, even if start authority was revoked in the meantime.
- Added regression tests for atomic rollback, batch idempotency, and post-revocation run closure.
- Removed the unnecessary `cryptography<47` ceiling so ADK environments are not silently downgraded; Continuum uses stable P-256/ECDSA/serialization APIs.

## 0.3.0

- Added institutional ES256 key registration, revocation and detached event signatures.
- Added P-256 external witness receipts and N-of-M quorum verification.
- Added per-branch Merkle roots and portable evidence bundles.
- Added consistent SQLite backup/manifest verification, doctor and metrics operations.
- Added runtime receipt contracts and existing-Supabase run normalization.
- Added candidate Postgres/Supabase `continuum` schema with read-only authenticated boundary.
- Split Observatory assets and removed inline script/style CSP exceptions.
- Added explicit v2→v3 local database upgrade path.
- Added JSON schemas, OpenAPI, ADRs and incident/recovery runbooks.

## 0.2.0

- Hardened atomic admission, HMAC seals, bitemporal replay, rollback checkpoints, CAS/idempotency and read-only Observatory.

---

Copyright © 2026 PowerFarm. All rights reserved.
