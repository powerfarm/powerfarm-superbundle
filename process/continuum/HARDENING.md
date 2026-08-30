# v0.3 hardening and production pass

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum` · **SECURITY**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

v0.3 preserves every v0.2 invariant and adds external-verification and operations layers.

## Admission and storage

- `BEGIN IMMEDIATE` serializes authority check + semantic validation + append.
- `request_id` is idempotent; mismatched reuse fails.
- `expected_head` implements compare-and-set writes.
- deterministic bounded JSON domain; no floats.
- monotonic transaction timestamps.
- effective-time causal ordering.
- HMAC event/branch seals with an external `0600` key.
- schema v2 databases upgrade in-place to v3; pre-v2 layouts remain refused.

## Actor signatures

- P-256/ES256 signing keys.
- public key registration is itself a root-authorized institutional act.
- key registration binds key fingerprint + JWK to the principal currently occupying an office.
- event signatures sign institution id + event id/hash + branch position + actor/office + transaction time.
- audit validates signature bytes and historical key binding.
- revoked keys cannot sign future events.

## External witnesses

- P-256 witness receipts over checkpoint statements.
- key fingerprints are SHA-256 over DER SubjectPublicKeyInfo.
- quorum requires unique valid witness keys signing one identical statement.
- optional trusted-key-id filtering supports explicit trust sets.

## Portability

- deterministic evidence bundle digest;
- per-branch Merkle roots;
- offline verification of event intent hashes, event hashes, branch chains, ancestry, checkpoint anchors and detached actor signatures;
- local HMAC verification is intentionally impossible without exporting the local trust secret.

## Operations

- SQLite backup API under one read snapshot;
- SHA-256 + size + checkpoint backup manifest;
- backup never includes the local seal key;
- `doctor` covers file modes, key modes, SQLite integrity, FK integrity, defensive config and full semantic audit;
- `metrics` exposes aggregate counts and signature coverage;
- Observatory static assets are allowlisted and CSP uses only `self`, no inline script/style.

## Verification

The automated suite covers authorization, bitemporal semantics, forks, concurrency, rollback, HMAC tamper, semantic forgery, ES256 event signatures, key revocation, witness quorum, bundle tampering, Merkle inclusion, backup tampering, authority-containment math, runtime receipt normalization, Supabase contract invariants and v2→v3 upgrade.

---

Copyright © 2026 PowerFarm. All rights reserved.
