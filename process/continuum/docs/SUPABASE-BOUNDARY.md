# Supabase boundary

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs` · **README**  
> **Navigate:** [Super Bundle](../../../README.md) · [Documentation map](../../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../../canon/README.md) · [Contracts](../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The existing Powerfarm Supabase database has runtime proof scaffolding such as `runs`, `adk.*`, `run_grants`, Gadget lineage and identity tables. That data is useful but is not, by itself, the institution.

Continuum should enter Supabase in a separate `continuum` schema and should **reference** runtime receipts instead of cloning ADK events or reinventing `runs`.

The candidate migrations intentionally grant `authenticated` read access only. Admission writes are withheld until there is a dedicated transactional writer with an explicit authority contract. This avoids reintroducing the exact failure mode where an authenticated browser can bypass the institutional admission path via direct PostgREST writes.

A future bridge should do this:

```text
runtime row / Cloudflare receipt / inference receipt
            ↓ normalize
powerfarm.runtime-receipt/v1
            ↓ store as evidence
continuum.external_receipts
            ↓ cited by authorized act
continuum.acts + continuum.act_causes
```

The bridge is asymmetric on purpose. Operational truth may inform institutional truth; it cannot silently write it.

---

Copyright © 2026 PowerFarm. All rights reserved.
