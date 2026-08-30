# ENGINE_DECISION: Cloudflare Durable Object Alarm

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Engine decisions` · **ENGINE DECISION**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** provider setting implemented and locally tested; not deployed

## Role

Programmatic physical wake for Heartime.

## Mechanism supplied

- one future alarm per Durable Object;
- at-least-once alarm execution;
- bounded automatic retries;
- provider runtime placement;
- RPC invocation of the Durable Object control method.

## PowerFarm meaning retained above it

- Heartime semantics;
- Beat identity;
- roster and deadlines;
- reconciliation contracts;
- Evidence and authority meaning.

## Public surface used

Durable Object Alarm API, Durable Object RPC, and Service Bindings.

## Setting

`heartime/worker/src/index.js` is a small provider membrane. The tested core does not depend on Cloudflare types. `HeartimeControl` is a private RPC entrypoint; no public `/arm` route exists.

The alarm is rearmed immediately after PostgreSQL emits/recovers Beats and
before the first organ call. This makes the emission durable before the
replaceable runtime crosses the boundary. If PostgreSQL is unavailable and the
failure cannot itself be persisted, the Durable Object retains only an
exponential provider-local fallback timer. It carries no Card, WakePack,
response, authority or other institutional payload.

Every emitted Beat is finalized independently. Progress admitted for one Beat
survives a later boundary failure in the same alarm invocation. Durable
`failure_count` belongs to the PostgreSQL contract, while the Durable Object
keeps only the minimum local outage counter needed to avoid exhaustion of the
provider's finite retry window.

## What survives removal

The canon, PostgreSQL state, roster, contracts, pure Heartime logic, tests, and organ-owned reconciliation state.

## Replacement class

Any programmatic wake engine capable of re-arming from canonical state with at-least-once semantics.

## Known unexposed capability

No production binding or deployment evidence exists yet.

## Conformance

- duplicate wake is harmless downstream;
- scheduler storage may evaporate;
- next alarm reconstructs from canonical state;
- open Beats are recovered without replaying a message history;
- the provider alarm is armed before an organ boundary is crossed;
- canonical-storage outage leaves a payload-free fallback wake;
- Heartime wake carries no Card payload;
- reconciliation returns only compact summaries;
- invalid timestamps fail closed.

## Primary documentation

- https://developers.cloudflare.com/durable-objects/api/alarms/
- https://developers.cloudflare.com/durable-objects/best-practices/create-durable-object-stubs-and-send-requests/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/


## Runtime identity dependency

The Durable Object does not own a permanent Supabase bearer. Before database access it calls Registry through `powerfarm.registry.runtime-token.v1` for a short-lived token bound to `pf.runtime.heartime`. Token issuance remains Registry meaning; Cloudflare merely transports the RPC.

---

Copyright © 2026 PowerFarm. All rights reserved.
