# Invariants

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs` · **INVARIANT**  
> **Navigate:** [Super Bundle](../../../README.md) · [Documentation map](../../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../../canon/README.md) · [Contracts](../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

1. One canonical timeline per institution.
2. One local successor per `(timeline, previous hash)`.
3. An actor cannot speak for an office it does not occupy at admission time.
4. Every non-root act persists the exact authority reference used to admit it.
5. Future-effective occupancy/authority/key registration cannot authorize a present admission.
6. A consequence cannot become effective before any cited cause.
7. Runtime success is evidence, never automatic institutional truth.
8. Actor signatures are valid only under a historically registered key binding.
9. Revocation affects future signatures; historical valid signatures remain verifiable.
10. Counterfactual timelines never mutate canonical history.
11. Bundle verification never pretends to possess the local HMAC secret.
12. External checkpoint/witness state must live outside the database rollback domain to add freshness assurance.
13. Genesis creates an institution; recovery never does. An empty store is not authorization to bootstrap.
14. Institutional identity is anchored to `institution_ref`, the genesis act and its digest, the trust root and the protocol version — never to a path, host, URL or engine. The store may move; the institution may not.
15. A handle that names the institution it expects cannot create one.
16. Restoring proves identity; only a later witness proves continuity. A stale copy carries the right name and is still refused against a witness it does not contain.

---

Copyright © 2026 PowerFarm. All rights reserved.
