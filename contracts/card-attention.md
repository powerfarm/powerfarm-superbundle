# Card Attention Contract

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Port contract:** `powerfarm.cards.attention.v1`  
**Status:** permanent First Seam boundary contract

A Card is the canonical carrier of bounded institutional attention.

It is not Knowledge, Evidence, Authority, a Process Commit, a Capability, a queue message, or a workflow execution.

## Required semantics

A Card participating in the First Seam must expose or resolve:

```text
CardRef
semantic generation/revision
attention obligation identity when distinct from generation
recipient scope
why it matters
ranking rationale
response contract
expiry/freshness when applicable
EvidenceRefs
current response condition
```

Response contracts may include:

```text
none
acknowledge
answer
investigate
choose
abstain
act
```

Not every Card is a task.

## Observed generation

Every response names the Card generation it observed. A response to generation N remains attributable to N but MUST NOT silently satisfy generation N+1.

A Card MAY expose a separate `obligation_ref` when the same semantic generation can lawfully create a new attention obligation. Otherwise the stable default is `CardRef@generation`.

## Species projections

LLM, human, and client projections may differ in presentation and effective affordances. They MUST retain the same CardRef, generation, obligation identity, and evidence spine.

## Authority

Receiving a Card never creates authority. Unavailable actions remain visible only as policy permits and SHOULD carry a machine-readable reason and lawful next step when one exists.

---

Copyright © 2026 PowerFarm. All rights reserved.
