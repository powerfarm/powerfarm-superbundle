# continuum-maf security boundary

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Microsoft Agent Framework Setting` · **SECURITY**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The Microsoft Agent Framework Setting is fail-closed around external function execution.

Security invariants:

1. A sealed ExecutionSlice is mandatory.
2. Tool name, institutional kind and subject must match an explicit Process mapping.
3. Continuum admission happens before the MAF function body runs.
4. MAF session, invocation and workflow identifiers never create institutional run identity.
5. Raw function inputs/results are represented by digest evidence by default.
6. The Setting cannot mint Office, Occupancy, Authority or keys.
7. Engine-local memory/context is non-authoritative and has no implicit write-back to PowerFarm MEMORY.
8. Completed replay is refused before a second external effect.
9. Recovery through a new beat preserves the institutional attempt; Occupancy replacement requires Process takeover.
10. Remaining energy/cost authorization is projected into the engine but cannot be enlarged there.

The Setting should be reviewed as an execution boundary, not as a trusted source of institutional truth.

---

Copyright © 2026 PowerFarm. All rights reserved.
