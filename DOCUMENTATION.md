# Documentation map

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle` · **MAP**  
> **Navigate:** [Super Bundle](./README.md) · [Documentation map](./DOCUMENTATION.md) · [Canon](./canon/README.md) · [Contracts](./contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

PowerFarm documentation is a distributed map of the code. A human or language model should be able to enter at almost any Markdown file, determine where it is, identify the local ownership boundary, and move to the smallest authoritative source required next without scanning the whole repository.

## Read this repository

| Need | Start here |
| --- | --- |
| Understand the Super Bundle | [`README.md`](README.md) |
| Understand how it pairs with Registry | [`PAIRING.md`](PAIRING.md) |
| Understand organism/organization meaning | [`canon/README.md`](canon/README.md) |
| Understand executable boundaries | [`contracts/README.md`](contracts/README.md) |
| Understand Process | [`process/README.md`](process/README.md) |
| Understand institutional consequence | [`process/continuum/README.md`](process/continuum/README.md) |
| Understand Google ADK Setting | [`process/continuum-adk/README.md`](process/continuum-adk/README.md) |
| Understand AI SDK Setting | [`process/continuum-ai-sdk/README.md`](process/continuum-ai-sdk/README.md) |
| Understand Heartime | [`heartime/README.md`](heartime/README.md) |
| Understand canonical Cards | [`circulation/cards/README.md`](circulation/cards/README.md) |
| Understand Card contract/ownership | [`contracts/card.md`](contracts/card.md) |
| Understand removed legacy/bypass paths | [`contracts/legacy-removal.md`](contracts/legacy-removal.md) |
| Understand circulation | [`circulation/README.md`](circulation/README.md) |
| Understand desired organ coverage | [`roster/README.md`](roster/README.md) |
| Understand conformance tests | [`conformance/README.md`](conformance/README.md) |
| Understand engine policy | [`engines/README.md`](engines/README.md) |
| Inspect recorded verification | [`evidence/README.md`](evidence/README.md) |
| Start from the repo wiki scaffold | [`wiki/Home.md`](wiki/Home.md) |

## Ownership map

```text
Registry (separate)
  Identity · Office/Occupancy · Brand · Store · Gadget/artifact lineage
        │
        ▼
Super Bundle
  Process
    Continuum · authority · admission · runs · consequence · proof
    Settings: continuum-adk · continuum-ai-sdk
  Organism
    Cards (circulating medium) · Heartime · roster · reconciliation · learning/sedimentation
```

The Super Bundle owns institutional action and circulation. It references Registry identities and artifacts; it must not become a second Registry. Execution engines may be replaced without redefining PowerFarm identity, authority or consequence.

## Document kinds

- **CANON**: meaning that changes what gets built; candidate until adopted.
- **CONTRACT**: executable promise between owners.
- **INVARIANT**: condition whose violation makes the system wrong.
- **ADR / ENGINE DECISION**: why a consequential design choice exists.
- **README**: local orientation and nearest navigation.
- **RUNBOOK / OPERATIONS**: how to operate or recover safely.
- **CONFORMANCE / EVIDENCE**: what was actually tested or observed.
- **PROPOSAL**: construction intent, not institutional fact.
- **CHANGELOG / HISTORY**: lineage, not current truth by itself.

The map block near the top of PowerFarm-authored Markdown is navigational metadata. It never overrides Canon, Contracts, code or Evidence.

## Upstream engines

Documentation under `engines/ai-sdk/upstream/` belongs to the vendored AI SDK and remains byte-for-byte upstream. PowerFarm engine adapters and boundary documentation live outside that tree.

---

Copyright © 2026 PowerFarm. All rights reserved.
