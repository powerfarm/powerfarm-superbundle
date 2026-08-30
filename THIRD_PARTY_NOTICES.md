# Third-party notices

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle` · **README**  
> **Navigate:** [Super Bundle](./README.md) · [Documentation map](./DOCUMENTATION.md) · [Canon](./canon/README.md) · [Contracts](./contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The Super Bundle contains a pinned Vercel AI SDK upstream source tree under `engines/ai-sdk/upstream/`. Its upstream repository declares the Apache License and retains its original license and notices.

The GitHub-ready archive intentionally omits binary font assets from that upstream tree. `engines/ai-sdk/GITHUB-DISTRIBUTION.json` records the exact omitted paths and original SHA-256 digests while `SOURCE-MANIFEST.sha256` remains the original source manifest.

`continuum-adk` integrates with Google ADK as an external Python dependency. Installing dependencies may bring additional third-party packages governed by their respective licenses.

`continuum-maf` integrates with Microsoft Agent Framework as an external Python dependency pinned to `agent-framework-core==1.16.0`. Microsoft Agent Framework is distributed under the MIT License; installing it may bring additional third-party packages governed by their respective licenses. Semantic Kernel is historical lineage, not a separately vendored PowerFarm engine.

---

Copyright © 2026 PowerFarm. All rights reserved.
