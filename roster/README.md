# Roster

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Organism / Roster` · **README**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Who is registered.

`roster/organs.json` is **desired state, reviewed in Git**. `heartime.organs` is observed/materialized state. Their difference is drift, and drift is read two ways: something needs repair, and something has hands here.

`freshness_minutes` is a maximum intended silence/freshness contract. It is not a fixed polling interval. Heartime derives the actual wake from evidence and deadlines.

The genesis migration creates schema only. It deliberately carries no second copy of the roster and no personal-name bootstrap.

Plan reconciliation against an observed JSON export:

```bash
node roster/scripts/plan.mjs --observed observed-organs.json
```

The library also exposes an attributed writer boundary for create/update/retire. Retirement preserves lineage; reconciliation never destructively deletes an organ.

---

Copyright © 2026 PowerFarm. All rights reserved.
