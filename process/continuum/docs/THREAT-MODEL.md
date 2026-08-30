# Threat model

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs` · **SECURITY**  
> **Navigate:** [Super Bundle](../../../README.md) · [Documentation map](../../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../../canon/README.md) · [Contracts](../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Continuum assumes the application process may crash, runtimes may disappear, the local database may be copied or rolled back, writers may race, clocks may regress, callers may retry, and an attacker may obtain write access to the SQLite file without obtaining every external trust root.

The local HMAC seal protects against database-only rewriting. It does not provide public non-repudiation. ES256 event signatures add actor-key evidence, but only after the key has been institutionally registered. Witness signatures add a separate trust domain for checkpoint statements. External checkpoints add rollback memory.

Continuum does **not** currently defend against a host compromise that simultaneously exposes the database, local seal key, every actor private key and every witness private key. It also does not pretend that a self-hosted timestamp is a trusted timestamp authority.

Denial of service is bounded, not eliminated. Payload size/depth/node counts, SQLite limits, graph node limits and HTTP response/query limits cap the easiest resource-exhaustion paths.

Counterfactual branches are not sandboxes. They prevent history contamination inside the ledger, but code executed while exploring a counterfactual must still be separately sandboxed by the runtime layer.

---

Copyright © 2026 PowerFarm. All rights reserved.
