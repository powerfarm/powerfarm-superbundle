# First Seam conformance

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Conformance / first-seam` · **CONFORMANCE**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

These tests protect the permanent v1 boundary. They do not claim a live deployment.

| Property | Executable evidence |
|---|---|
| Event loss cannot lose obligation | `event loss: level-triggered pass discovers durable attention without an event` |
| At-least-once wake is idempotent | `duplicate wake is idempotent and creates one attempt` |
| Occupancy succession preserves work | worker-death and no-current-Occupancy tests |
| Stale reasoning cannot close new state | stale-generation test |
| One Card survives species projection | LLM/human/client projection test |
| Attention does not mint authority | unavailable/resolvable affordance test |
| UNKNOWN and abstention remain legal | durable response test |
| Controller process may evaporate | controller-evaporation test |
| Heartime transports no Card/WakePack body | summary and wake-hint tests |
| Provider contracts fail closed | RPC contract mismatch tests |
| Physical scheduler may evaporate | alarm reconstruction test |
| Invalid timer state fails closed | invalid next-wake test |
| Public arm endpoint does not exist | Heartime source contract test |
| Bus machinery is not required | `scripts/validate-first-seam.mjs` no-bus checks |
| The vertical seam closes without a message bus | `first-seam.integration.test.mjs` runs Heartime → current Cards state → WakePack → response/Evidence → later reconciliation |
| Partial progress is not lost | Heartime setting test persists each completed Beat before attempting the next boundary |
| Canonical-state outage cannot silence the pulse | Heartime setting test leaves only a payload-free provider fallback alarm and reconstructs from PostgreSQL later |
| Contract mutation cannot accept stale work | migration checks advance generation on semantic changes and reject generation rollback |

A deployed First Seam must rerun these against real Cards, Registry, Process, Platform, Evidence, PostgreSQL and Cloudflare bindings. Local conformance is necessary, not sufficient, for admission as a live edge.

---

Copyright © 2026 PowerFarm. All rights reserved.
