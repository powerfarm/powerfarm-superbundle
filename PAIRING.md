# PowerFarm deployment pairing

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle` · **BOUNDARY**  
> **Navigate:** [Super Bundle](./README.md) · [Documentation map](./DOCUMENTATION.md) · [Canon](./canon/README.md) · [Contracts](./contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The target architecture is exactly two independently deployable artifacts:

1. **PowerFarm Registry** — Identity, Office/Occupancy, identity keys, Brand, UI,
   Store/Gadgets, Manifest and exact artifact lineage.
2. **PowerFarm Super Bundle** — Organism/Heartime plus Process/Continuum and its
   pinned execution Settings/engines.

Registry does not own institutional Authority. The Super Bundle does not mint or
mutate Registry identity state. The boundary is `contracts/registry-process-boundary.md`.

## Milestone 6 private bindings

The paired deployment now has explicit least-privilege runtime surfaces:

- Registry `HeartimeRuntimeTokenPort` is physically fixed to `pf.runtime.heartime`.
- Registry `ProcessWriterRuntimeTokenPort` is physically fixed to `pf.runtime.process-writer`.
- Registry `RegistryOccupancyPort` exposes the existing `powerfarm.registry.occupancy.v1` projection used by First Seam.
- Super Bundle `ProcessAdmissionWriterPort` spends only the Process-writer runtime credential and invokes the transaction-only Continuum writer.

A runtime token is a database credential, never institutional Authority. Runtime subjects must be explicitly configured in Registry and paired to dedicated Supabase auth principals before deployment.

---

Copyright © 2026 PowerFarm. All rights reserved.
