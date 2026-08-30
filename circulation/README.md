# Circulation

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Organism / Circulation` · **README**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The permanent boundary controllers between organs.

The organs own institutional state. Circulation reads that state, ensures attributable obligations through versioned owner ports, and returns compact references to Heartime. A controller is not an organ and cannot become a second source of truth.

## Admitted source contracts

```text
cards/           canonical Card v1, organ-owned patches, lifecycle, recovery and local circulation gate
attention/       attention projection and response circulation over Cards
sedimentation/   capability learning, hardening, and softening proposals
lib/             shared compact-reference and Heartime boundary validation
```

Cards are the medium of circulation, not an organ. Heartime may mutate only Card circulation/consumption fields. Registry, Process, Platform, Memory, and Homeostasis retain ownership of their own Card namespaces. Recovery preserves `attempt_ref` across a new Heartime `beat_ref`; Occupancy changes require Registry refresh plus Process takeover/resume rather than Card identity replacement.

Both controllers are level-triggered and stateless:

```text
Heartime wake hint
  ↓
read current owner state
  ↓
compare observed with declared
  ↓
ensure missing institutional obligation idempotently
  ↓
return compact reference summary
```

No Card, WakePack, capability body, implementation body, work profile, proposal body, prompt, or response body is transported through Heartime.

The source and settings are built and locally verified. No circulation edge is represented as live until its real organ-owned ports are deployed and its admission runbook passes.

---

Copyright © 2026 PowerFarm. All rights reserved.
