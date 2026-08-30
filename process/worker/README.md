# Process admission writer Setting

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process` · **README**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The Process admission writer is the production persistence setting for already-admitted Continuum acts. It is not an authority issuer and does not interpret engine output as institutional consequence by itself.

It exposes a private Cloudflare Service Binding, obtains a short-lived `pf.runtime.process-writer` credential from Registry, and invokes the Card-bound transaction RPC `continuum.admit_card_batch_v2`. The older `admit_batch_v1` implementation is not executable by authenticated callers. Canonical `pf.*` refs and trace correlation cross the boundary; service-role credentials do not.

---

Copyright © 2026 PowerFarm. All rights reserved.
