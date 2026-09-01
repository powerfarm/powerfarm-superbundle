# continuum-ai-sdk

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / AI SDK Setting` · **README**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

PowerFarm **Setting** between Process/Continuum and the vendored Vercel AI SDK engine.

```text
PowerFarm Process
    Continuum               institutional authority + admission + consequence
        ^
        | versioned ProcessPort
        v
    continuum-ai-sdk        this boundary
        ^
        | AI SDK Tool contract
        v
    Vercel AI SDK           replaceable engine
```

## Hard boundary

The AI SDK may propose and execute work. It cannot create Office, Occupancy,
institutional Grants, Commit, Direction, or institutional consequence.

Every institutional executable tool must receive a sealed `powerfarm.execution-slice.v4` derived from the circulating Card. Engine-local invocation/session/tool-call IDs are provenance only. Every executable tool is then wrapped so that:

1. the sealed slice and exact tool mapping are verified before any institutional act is projected;
2. only digest evidence crosses the boundary by default;
3. Continuum atomically admits the act and `run.start` before execution;
4. refusal prevents the original `execute` function from running;
5. success/failure is returned to Continuum as a runtime receipt;
6. Continuum, not the AI SDK, decides what becomes institutional consequence.

Provider-executed tools have no local `execute` interception point and therefore
fail closed in strict mode. They require a separate receipt/admission setting
before they can become PowerFarm capabilities.

`tests/support/bridge.py` and `tests/support/python-port.mjs` are local golden transports, not runtime package exports or institutional ontology. They may bootstrap deterministic test institutions because they live exclusively under test support. Production uses the Registry-backed and PostgreSQL Service Binding boundaries instead.

---

Copyright © 2026 PowerFarm. All rights reserved.
