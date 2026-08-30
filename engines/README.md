# Engines

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Engines` · **README**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Engines are replaceable execution mechanisms inside the super bundle. They do
not own PowerFarm identity, authority, consequence, or circulation.

- `ai-sdk/` contains the exact vendored Vercel AI SDK source accepted by this bundle.
- Google ADK is pinned by `process/continuum-adk/constraints/tested-py312.txt` and enters Process only through `process/continuum-adk/`.
- Microsoft Agent Framework is pinned by `engines/microsoft-agent-framework/PIN.json` and enters Process only through `process/continuum-maf/`. Its AgentSession, ContextProvider and memory facilities remain engine-local execution state.

The permanent rule is **ORGAN ours, SETTING ours, ENGINE theirs**.

---

Copyright © 2026 PowerFarm. All rights reserved.
