# Attention reconciler Worker setting

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Organism / Circulation / attention / worker` · **README**  
> **Navigate:** [Super Bundle](../../../README.md) · [Documentation map](../../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../../canon/README.md) · [Contracts](../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

This is the permanent Cloudflare Service Binding setting for the First Seam attention controller.

It exposes one private RPC method through the named `AttentionReconciler` entrypoint:

```text
reconcile({ beat_ref, reconciler_ref, reason?, resource_hint })
```

The wake carries no Card body. The Worker resolves current state through versioned organ-owned RPC ports:

```text
CARDS          current attention, WakePack, response persistence
REGISTRY       current Occupancy
PROCESS        effective authority projection
PLATFORM       durable attempt/run lifecycle
EVIDENCE_STORE durable Evidence recording
```

The default HTTP handler always returns 404. Operational access is through an explicit Service Binding.

`wrangler.toml.example` deliberately contains provider placeholders. This setting is built and tested, not deployed or bound to production organs.

---

Copyright © 2026 PowerFarm. All rights reserved.
