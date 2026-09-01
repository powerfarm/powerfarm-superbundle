# Engine-equivalent execution

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The PowerFarm execution boundary begins with a Card, not with an engine callback.

`powerfarm.execution-slice.v4` is a content-addressed projection of one institutional Card attempt. It is produced before selecting or entering ADK, AI SDK, or any future engine Setting. `execution-slice.v1.json`, `execution-slice.v2.json` and `execution-slice.v3.json` remain pinned as historical contract evidence; v4 is the current boundary. V3 sealed the remaining resource budget; v4 additionally seals the instant at which that budget was evaluated and the energy/cost authorization windows, so that an engine can revalidate authorization against its own clock immediately before an external effect.

```text
Card
  identity / office / occupancy refs
  Direction / Authority / ECS refs
  attempt_ref
       |
       +-- Heartime beat_ref #1
       |        ↓
       |   ExecutionSlice v4
       |
       +-- Heartime beat_ref #2 after recovery
                ↓
           ExecutionSlice v4
                ↓
         same institutional run_ref
```

## Attempt identity versus delivery identity

The institutional run identity is derived from:

```text
card_ref
semantic generation
attempt_ref
tool_name
institutional kind
institutional subject
```

It deliberately excludes `beat_ref`, runtime, provider, model, engine revision, session, invocation ID, tool-call ID and current occupant principal.

`attempt_ref` identifies the institutional attempt. `beat_ref` identifies one Heartime emission of that attempt. Therefore a recovery reissue may change `beat_ref` without manufacturing a new run. Each beat gets a deterministic `resume_request_id`, while the stable `run_ref` remains the external idempotency key.

## Settings

Each Setting must validate, before external execution:

1. the ExecutionSlice content seal;
2. the exact tool/capability mapping;
3. Process admission or continuation;
4. terminal replay state;
5. whether an already-open run is a same-beat duplicate or a deliberate new-beat resume.

Same-beat redelivery fails closed as `POWERFARM_ALREADY_IN_FLIGHT`. A new beat for the same attempt requires `run.resume`. If Registry reports a successor Occupancy, `run.takeover` must be admitted before that successor may resume.

The engine may then execute. Completion or failure is represented by the same Continuum `RuntimeReceipt` semantics, with runtime and engine revision retained as provenance rather than run identity.

## Boundary

ExecutionSlice does not mint Authority, Occupancy, budget or capability. It carries exact references already present in the circulating Card and makes engine replacement, retry and occupancy recovery unable to redefine institutional meaning.

---

Copyright © 2026 PowerFarm. All rights reserved.
