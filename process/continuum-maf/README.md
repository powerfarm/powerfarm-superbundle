# continuum-maf

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Microsoft Agent Framework Setting` · **README**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

PowerFarm **Setting** between Process/Continuum and Microsoft Agent Framework.

```text
PowerFarm MEMORY ── read-only projection ─┐
                                         v
Card -> ExecutionSlice -> Continuum -> continuum-maf -> Microsoft Agent Framework
                            ^                    |                 |
                            |                    |                 +-- AgentSession
                            |                    |                 +-- ContextProvider
                            |                    |                 +-- function middleware
                            |                    |                 +-- workflows / tools
                            |                    |
                            +---- RuntimeReceipt + digest evidence
```

## Hard boundary

Microsoft Agent Framework is an execution engine. It may run agents, maintain an `AgentSession`, use ContextProviders, middleware, workflows and tools. None of those facilities become PowerFarm institutional semantics.

Every institutional function invocation must carry a sealed `powerfarm.execution-slice.v3` derived from the circulating Card. The Setting validates the exact tool mapping and asks Continuum to admit the intent and `run.start` before the function executes. A refusal sets the MAF function result and the underlying function is never called.

The engine cannot create Office, Occupancy, Direction, Authority, RunGrant, institutional evidence or consequence. Engine-local session/invocation identifiers are provenance only and never participate in `run_ref` derivation.

## Microsoft memory is not PowerFarm MEMORY

This boundary is intentionally explicit because the names overlap.

Microsoft Agent Framework provides session state and ContextProviders that are useful for execution-local memory. PowerFarm `MEMORY` is the institutional organ that preserves evidence, classified epistemic state, freshness, uncertainty and continuity between occupants.

`make_memory_projection()` creates a content-addressed, read-only projection of PowerFarm Memory for MAF. `make_memory_context_provider()` may inject that projection into an engine run. Its `after_run` path performs **no write-back**. MAF session/provider state cannot silently become `OBSERVED`, `INFERRED`, evidence or any other institutional memory record.

```text
PowerFarm MEMORY -> read-only projection -> MAF context/session
                                            |
                                            X no implicit write-back
```

Any future write-back path must return through the normal Card + Memory/Evidence contracts and be admitted under the organ that owns those fields.

## Function middleware

`make_continuum_middleware()` uses Microsoft Agent Framework function middleware as the enforcement point. PowerFarm runtime values are injected into `FunctionInvocationContext.kwargs`, which keeps them separate from model-proposed tool arguments.

Injected runtime values include:

- `powerfarm_run_ref`
- `powerfarm_authority_ref`
- `powerfarm_card_ref`
- `powerfarm_beat_ref`
- `powerfarm_attempt_ref`
- `powerfarm_engine_revision_ref`
- `powerfarm_resource_budget`

The Setting consumes `powerfarm_execution_slice` from runtime kwargs. Missing or invalid slices fail closed.

## Replay and recovery

The same completed institutional attempt returns `POWERFARM_ALREADY_COMPLETED` before a second external effect. A duplicate open beat returns `POWERFARM_ALREADY_IN_FLIGHT`. A new Heartime beat may resume the same `run_ref`; a successor Occupancy requires Process `run.takeover` first.

## Pin

The accepted engine revision is:

```text
agent-framework-core==1.16.0
```

`engines/microsoft-agent-framework/PIN.json` records the exact PyPI artifact digests. The package is an external dependency rather than vendored source.

## Tests

```bash
PYTHONPATH=../continuum:src python -m pytest -q tests
```

The deterministic controller/memory tests run without network. The real-runtime test uses actual Agent Framework `FunctionTool` and `FunctionInvocationContext` types when `agent-framework-core` is installed. It skips locally when the dependency is unavailable; GitHub CI installs the pinned dependency.

---

Copyright © 2026 PowerFarm. All rights reserved.
