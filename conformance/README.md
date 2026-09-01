# Conformance

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Conformance` · **CONFORMANCE**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The negative controls, and exactly what this page measures.

This page is derived by reading source. It counts declarations; it does not run
anything. Execution results — real exit codes and reported pass/fail counts per
suite — live in `evidence/organism-verification/verification.json`.

Document 1 currently contains **68 negative controls**. **16 numbered controls** are named by at least one test declaration.

Document 2 currently contains **30 capability-learning controls**. **30 learning controls** are named by at least one test declaration.

The repository declares 172 deterministic test cases for Heartime, canonical Cards, roster, attention circulation, capability learning, private settings, and vertical seams. A control is listed only when a test names it explicitly. Naming a control is evidence that a test refers to it, not proof that the control is enforced; read the named test to see what it actually asserts.

The Heartime migrations pass 80 structural checks without touching a database. The First Seam contract passes 42 source/contract checks. The Capability Learning contract passes 58. The canonical Card contract passes 27. The Epistemic Continuity contract passes 21. The Energy + Cost contract passes 32. Production Circulation passes 27. Legacy Removal passes 32. These validators mix executed behaviour with source-shape inspection; a passing source-shape check proves the shape, not the interface.

Document 1 controls named in test source: `1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 30, 31, 56`.

Document 2 controls named in test source: `L1, L2, L3, L4, L5, L6, L7, L8, L9, L10, L11, L12, L13, L14, L15, L16, L17, L18, L19, L20, L21, L22, L23, L24, L25, L26, L27, L28, L29, L30`.

A control moves here only when it can run against real behavior or against a deterministic contract whose mutation is observable. `NOT RUN` is never reported as `PASS`, and a declaration count is never reported as a pass count.

This file is derived by `scripts/derive-repository.mjs`.

---

Copyright © 2026 PowerFarm. All rights reserved.
