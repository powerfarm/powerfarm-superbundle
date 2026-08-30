# Continuum architecture

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs` · **ARCHITECTURE**  
> **Navigate:** [Super Bundle](../../../README.md) · [Documentation map](../../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../../canon/README.md) · [Contracts](../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Continuum is not a workflow engine and it is not a second copy of the runtime database. It is the narrow layer that answers four questions after the runtime disappears:

1. **What did the institution admit?**
2. **Who was entitled to admit it?**
3. **What did that act depend on?**
4. **Can another machine verify the answer?**

## Planes

### Admission plane

`Kernel.append` serializes one timeline with `BEGIN IMMEDIATE`, checks occupancy, selects an exact authority reference, validates semantic invariants, fixes transaction/effective time, hashes the intent, links the previous head, computes the event digest and seals it with the local trust root.

### Projection plane

Projection is derived. Offices, occupancies, grants, commitments, capabilities, runs, gaps, evidence and unknown future act kinds are computed from immutable admitted acts. A projection can be queried by effective time and by transaction-time knowledge.

### Proof plane

Causal edges and authority edges form a support graph. `proof` walks backward. `impact` walks forward. Neither requires a separate graph database because event counts are expected to remain small enough for local institutional reasoning; if that ceases to be true, a materialized graph is an optimization, not a new authority.

### Cryptographic plane

There are three distinct cryptographic jobs:

- local HMAC seal: protects a database from undetected offline rewriting without the seal key;
- ES256 event signature: proves a registered institutional key signed a particular admitted event;
- witness receipt: lets an external trust domain attest a checkpoint and makes rollback/fork detection independent from the local machine.

They are deliberately not collapsed into one mechanism.

### Runtime boundary

ADK, Supabase, Cloudflare Workers, Kubernetes, Golden Bridge, local Labs or any future engine produce **runtime receipts**. A receipt is evidence. It becomes institutional truth only when an authorized act admits a consequence and cites the receipt/hash as support.

## Persistence

SQLite is the executable reference implementation. It is hardened and intentionally boring. The `powerfarm/supabase/migrations` directory contains a candidate Postgres representation with a separate `continuum` schema and a read-only API boundary. Those migrations are not applied automatically.

## Counterfactuals

A timeline fork has one parent and one fork event. Inherited history is immutable. A branch only stores local acts after the fork. This creates cheap counterfactual worlds without copying institutional history or contaminating the canonical line.

## Invariants worth protecting

- no act without a current occupancy for the claimed office;
- no non-root act without an exact active authority reference;
- no causal consequence effective before its cause;
- one branch head, serialized writes, idempotent retries, optional CAS;
- no runtime receipt implicitly becomes an institutional fact;
- registered signing keys are bound to the office occupant in historical time;
- a valid hash/HMAC/signature is insufficient if semantic replay says the story was institutionally impossible.

---

Copyright © 2026 PowerFarm. All rights reserved.
