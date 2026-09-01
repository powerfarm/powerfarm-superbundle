# PowerFarm Process

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process` · **README**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Process is the Continuum institutional kernel plus its execution Settings.**
There is no wrapper service whose only job is to rename the pieces.

```text
Registry (separate)                       Process (inside super bundle)
Identity / Office / Occupancy             Continuum
Brand / Store / Gadgets             -->   Authority / admission / consequence / proof
exact artifact lineage                    |
                                           +-- continuum-adk      -> Google ADK
                                           +-- continuum-ai-sdk   -> Vercel AI SDK
                                           +-- continuum-maf      -> Microsoft Agent Framework
```

## Ownership

Process owns institutional grants, run authority, admission, causal consequence
and evidence/proof. It resolves identity and current Office/Occupancy from the
standalone Registry but does not mint or mutate Registry identity state.

Continuum is the durable institutional kernel. Runtime Settings map engine
activity into Continuum admission and evidence:

- `continuum-adk` pins and constrains Google ADK execution.
- `continuum-ai-sdk` pins the vendored AI SDK source and wraps executable tools
  so institutional admission occurs before `execute()`.
- `continuum-maf` pins Microsoft Agent Framework and uses function middleware so
  Continuum admission occurs before the function body. AgentSession and ContextProvider
  state are engine-local and never become the PowerFarm MEMORY organ.

No engine creates PowerFarm authority. All three are replaceable mechanisms.

## Common execution boundary

Both Settings consume the same `powerfarm.execution-slice.v4` rather than constructing institutional context independently. The slice is derived from the Card before engine selection and is content-addressed.

```text
Card → ExecutionSlice → Process admission → engine-local execution → RuntimeReceipt
```

`continuum-adk`, `continuum-ai-sdk`, and `continuum-maf` validate the slice seal and exact tool mapping before an external effect. The same institutional attempt yields the same `run_ref` on both Settings. A Heartime reissue changes `beat_ref` and `resume_request_id` but preserves `attempt_ref` and `run_ref`. An open run accepts a new beat only through `run.resume`; a successor Occupancy must first be admitted through `run.takeover`. Runtime and revision pin remain receipt provenance, never run identity.

## Production identity contract

The Python kernel exposes a read-only `RegistryDirectory` boundary. Production
implementations must resolve Office existence and current Occupancy from Registry.
The included `StaticRegistryDirectory` exists only for deterministic tests and local integration goldens. A writable Kernel without Registry now fails at construction unless the caller explicitly chooses `identity_mode="embedded-test"`.

## Resource authorization boundary

Process owns `energy.authorization` and `cost.authorization` on the Card. ExecutionSlice v3 projects the remaining budget to ADK, AI SDK and Microsoft Agent Framework, but engines cannot enlarge it. Resource consumption observations return through Heartime and never mint Authority.

## Production persistence setting

`process/worker/` is the production persistence Setting for already-admitted Continuum acts. The writer is serialized per institution/timeline with a transaction-scoped advisory lock, checks exact previous head/chain/index, and preserves canonical `pf.*` actor/Office/Occupancy refs separately from provider UUID coordinates.

The Worker obtains a short-lived `pf.runtime.process-writer` credential from Registry through a private Service Binding. It has no service-role key and cannot mint grants or reinterpret engine output as Authority. Its authenticated write boundary is `admit_card_batch_v2`, which binds every request to Card, beat, attempt, and exact ExecutionSlice digest; the v1 transaction routine is internal only.

---

Copyright © 2026 PowerFarm. All rights reserved.
