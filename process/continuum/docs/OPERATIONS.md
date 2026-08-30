# Operations

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs` · **OPERATIONS**  
> **Navigate:** [Super Bundle](../../../README.md) · [Documentation map](../../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../../canon/README.md) · [Contracts](../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

## Daily health

Run `powerfarm doctor` first. It checks storage permissions, the external seal key, SQLite integrity, foreign keys, `trusted_schema`, the full semantic audit and the canonical branch head.

`powerfarm metrics` is safe for dashboards and emits only aggregate institutional/ledger information.

## Backups

`powerfarm backup --out /secure/path/powerfarm-YYYYMMDD.db` uses SQLite's backup API inside a consistent read snapshot. It writes a separate manifest containing database SHA-256, size, institution id and a checkpoint. It never copies the seal key.

The backup and the seal key must not share a rollback domain. A backup that contains both is a convenient archive but a weak tamper boundary.

## External checkpointing

Create a checkpoint after meaningful institutional transitions. Keep copies in at least one separate trust domain. For higher assurance, have independent witnesses sign the checkpoint and require quorum during recovery.

## Signing keys

Generate witness/actor P-256 keys with `witness-keygen`. Private keys are created with mode `0600` and the command refuses to overwrite an existing file.

Before a key can sign an institutional event it must be registered with `key-register`. Registration binds the public JWK to the current principal occupying an office. Revocation is itself an institutional act.

## Portable bundles

`bundle-export` produces local events, branch metadata, event signatures, branch Merkle roots and an authenticated checkpoint. `bundle-verify` validates the deterministic bundle and its hash chains without needing the local HMAC secret. If you also carry witness receipts, a third party can verify an externally attested checkpoint.

---

Copyright © 2026 PowerFarm. All rights reserved.
