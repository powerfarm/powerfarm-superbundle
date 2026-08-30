# GitHub publication guide

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle` · **README**  
> **Navigate:** [Super Bundle](./README.md) · [Documentation map](./DOCUMENTATION.md) · [Canon](./canon/README.md) · [Contracts](./contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

This directory is a complete repository root, not a milestone overlay.

Recommended initial publication:

```sh
git init -b main
./scripts/git-stage-github.sh
git commit -m "PowerFarm Super Bundle v0.12.0"
git remote add origin <your-repository-url>
git push -u origin main
```

Require the `verify` GitHub Actions check before merge to `main`. Enable GitHub Security Advisories and secret scanning where available. No production secret is required by CI.

The paired Registry is a separate repository. Keep `PAIRING.md` aligned across releases and do not merge Registry Authority concerns back into this repository.

---

Copyright © 2026 PowerFarm. All rights reserved.
