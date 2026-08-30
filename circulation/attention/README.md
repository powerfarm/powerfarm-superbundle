# Attention reconciliation

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Organism / Circulation / attention` · **README**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The permanent First Seam controller.

Heartime wakes this reconciler with a `BeatRef`, reconciler identity, reason, and optional resource hint. It never receives a Card body from Heartime. Every pass queries current Cards state, compiles a current WakePack, observes durable attempt/response state, and ends.

The controller owns no institutional state and can evaporate after every pass. Cards, Occupancy, Authority, Runs, and Evidence remain owned by their organs. Test doubles live only under `tests/fixtures` and are excluded from production code.

The portable controller is independent of Cloudflare and Node-only APIs. The Worker setting exposes one private RPC entrypoint and resolves versioned organ ports through Service Bindings.

Core law:

```text
events accelerate
state guarantees
```

**Status:** portable core and private Worker setting built and verified locally; live organ bindings not deployed.

---

Copyright © 2026 PowerFarm. All rights reserved.
