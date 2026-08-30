# Vercel AI SDK engine pin

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Engines` · **README**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

This directory is a sealed upstream engine inside the PowerFarm super bundle.

- `upstream/` preserves the supplied upstream source tree except for the binary font assets explicitly declared in `GITHUB-DISTRIBUTION.json`; no PowerFarm semantic patch is applied there.
- `PIN.json` fixes the accepted package versions, original archive digest, lockfile digest, and whole-tree source-manifest digest.
- `SOURCE-MANIFEST.sha256` remains the original complete upstream manifest; the GitHub distribution checker verifies every present file and the exact digest of each declared omission.
- PowerFarm code MUST NOT patch `upstream/` to encode institutional meaning.
- The only institutional integration boundary is `process/continuum-ai-sdk/`.

The engine may be replaced. PowerFarm identity, authority, consequence, evidence, and circulation must survive replacement.

---

Copyright © 2026 PowerFarm. All rights reserved.
