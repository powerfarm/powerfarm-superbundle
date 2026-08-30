# Recovery runbook

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs` · **OPERATIONS**  
> **Navigate:** [Super Bundle](../../../README.md) · [Documentation map](../../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../../canon/README.md) · [Contracts](../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

1. Freeze writers. Do not repair in place while admission is active.
2. Copy the database, WAL and seal key to separate evidence storage.
3. Run `powerfarm doctor` and `powerfarm audit` against a copy.
4. Verify the newest retained external checkpoint.
5. If witness receipts exist, verify quorum and confirm every receipt signs the same checkpoint statement.
6. If the live database is behind an anchored checkpoint, treat it as rollback, not ordinary corruption.
7. Restore the newest database backup whose manifest verifies.
8. Restore the seal key from its independent trust store.
9. Run a full semantic audit before allowing any new append.
10. Compare the recovered main head with external/witness anchors.

Never "fix" a broken chain by recalculating hashes. A repaired chain that erases the evidence of corruption is worse than a broken chain.

---

Copyright © 2026 PowerFarm. All rights reserved.
