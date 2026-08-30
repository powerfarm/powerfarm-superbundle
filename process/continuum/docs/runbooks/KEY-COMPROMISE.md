# Signing-key compromise

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / runbooks` · **RUNBOOK**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

1. Stop using the key immediately.
2. Admit `identity.key.revoke` from root authority with the compromised key id.
3. Create/register a fresh key for the current occupant.
4. Identify every event signed after the suspected compromise time.
5. Re-evaluate those events' causal descendants with `impact`.
6. Preserve the old public key and revocation act. Do not delete historical verification material.

---

Copyright © 2026 PowerFarm. All rights reserved.
