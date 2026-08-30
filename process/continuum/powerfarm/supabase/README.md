# Continuum / Supabase boundary

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / powerfarm / supabase` · **README**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

These SQL files are **candidate migrations**, not an automatic installer.

The current Powerfarm Supabase project already contains runtime proof tables (`runs`, `adk.*`, `run_grants`) and identity scaffolding. Continuum must not duplicate them. Its Postgres role is narrower:

- admitted institutional acts;
- causal/support edges;
- detached signatures;
- external runtime receipts;
- external witness/checkpoint material.

Direct writes from `anon` and `authenticated` are intentionally absent. A real deployment should create a dedicated admission principal and perform authority check + append + cause edges + signature registration in one transaction.

`external_receipts` is the seam for existing runtime data. A Cloudflare/ADK/Supabase run may be recorded as evidence, then an authorized office can admit an institutional consequence that cites the receipt digest.


## Registry identity boundary

The candidate schema deliberately references `public.identities` and
`public.identity_keys`, which are Registry-owned tables in the current shared
Supabase deployment. Continuum owns `continuum.*` consequence tables. A later
physical database split must replace these FKs with stable Registry references
or signed identity snapshots without changing Process semantics.

---

Copyright © 2026 PowerFarm. All rights reserved.
