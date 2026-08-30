# Operational Trace v1

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Contracts` · **CONTRACT**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../canon/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Operational tracing is the correlation spine of circulation, not institutional evidence or Authority.

A stable `CardRef` deterministically yields one operational `trace_ref` without changing the `powerfarm.card.v1` wire body or historical Card seals. Heartime similarly derives a deterministic beat trace from each `BeatRef`. Service Bindings propagate the trace ref explicitly and HTTP boundaries may additionally carry W3C `traceparent` plus `x-powerfarm-*` correlation headers.

Trace events may name Card/Beat/Attempt refs and compact operational attributes. They MUST NOT contain raw prompts, chain-of-thought, Card bodies, Authority grants or secrets.

---

Copyright © 2026 PowerFarm. All rights reserved.
