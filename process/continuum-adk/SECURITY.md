# Security model

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / ADK Setting` · **SECURITY**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

`continuum-adk` is an admission boundary, not a sandbox. It decides whether an ADK tool invocation may proceed and records evidence around the execution.

## Production defaults

- The plugin fails closed if `invocation_id` or `function_call_id` is unavailable.
- A concrete runtime `revision_ref` and an explicit mapping policy are required.
- Raw arguments, results, exception messages, user IDs, and session IDs are not written to Continuum by default.
- Tool intent and `run.start` are committed atomically. A refusal creates neither.
- `run.finish` / `run.fail` cite the exact `run.start` and use Continuum's narrow continuation authority. Revocation prevents new work but cannot prevent recording the outcome of work that was already admitted.
- Refusals do not reveal the acting principal unless explicitly configured.

## Still outside the boundary

A tool implementation can still leak or corrupt data after admission. Use OS/container/network/database controls for execution isolation. Continuum admission complements those controls; it does not replace them.

---

Copyright © 2026 PowerFarm. All rights reserved.
