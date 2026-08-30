# Capability Learning v1 admission and operation

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Operations` · **OPERATIONS**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** permanent deployment procedure. No production step in this file is reported as executed by the repository build.

## Admission law

A learning scope may be admitted only when:

```text
Capability identity and revision are canonical
WorkClassRef is explicit
semantic / authority / evidence contracts are exact
one current occupancy exists
non-inference occupancy has an admitted fallback
learning thresholds are declared, not inferred by the reconciler
work profiles are measured from actual delivery
candidate author and equivalence evaluator differ
Process owns promotion
Registry owns occupancy
Heartime owns only the obligation to look again
```

## Gate 0: source admission

```bash
npm run derive
npm run verify
npm run evidence
```

Required result:

```text
Capability Learning contract passes
portable controller tests pass
private Worker setting tests pass
vertical harden/soften test passes
Heartime migration structure passes
no deployment claim is produced
```

## Gate 1: apply Heartime evolution

After the existing Heartime migrations, apply:

```text
heartime/migrations/20260824120000_heartime_capability_learning.sql
```

Prove that the compact-summary guard rejects nested bodies named:

```text
capability implementation candidate profile policy
proposal assessment semantic_contract authority_contract
learning_policy
```

while reference fields such as `capability_ref` remain legal.

## Gate 2: Registry port

Provide `powerfarm.registry.capability-learning.v1`:

```text
resolveCapabilityLearningScope
findCapabilityImplementationCandidate
```

For each admitted learning scope, Registry must return:

- durable CapabilityRef and revision;
- WorkClassRef;
- exact semantic, authority and evidence contracts;
- one active occupancy with exact implementation revision, substrate and cognition fraction;
- exact fallback implementation reference, revision and substrate where required;
- explicit LearningPolicyRef and policy revision;
- explicit learning policy thresholds.

A profile or candidate referring to a previous occupancy must fail closed.

## Gate 3: Evidence port

Provide `powerfarm.evidence.capability-learning.v1`:

```text
profileCapabilityWorkClass
assessCapabilityImplementation
recordCapabilityLearningEvidence
```

The delivery profile must be derived from real work in the declared work class. At minimum prove:

```text
observed_runs is counted
exception_rate = exception_count / observed_runs
window timestamps are derived
cost and latency come from actual runs
contradictions and workarounds are preserved
profile names the exact occupancy and implementation
```

An equivalence assessment is admissible only when it binds the exact capability revision, work class, candidate revision, profile and equivalence contract; its evaluator differs from the candidate author; and its observed cost, quality, latency, uncertainty and cognition fraction can be resolved independently.

## Gate 4: Imagineering port

Provide `powerfarm.imagineering.capability-construction.v1`:

```text
ensureCapabilityConstruction
ensureCapabilityEvaluation
```

Both methods must be idempotent on the supplied semantic key. Construction remains provisional. Evaluation must run the candidate in shadow or an equivalent isolated environment against the declared equivalence contract.

## Gate 5: Process port

Provide `powerfarm.process.capability-succession.v1`:

```text
ensureCapabilityTransitionProposal
```

The call creates or returns a proposal. It must never silently activate the candidate.

Promotion must independently check:

```text
same capability revision
same WorkClassRef
same semantic contract
same authority contract
same evidence contract
independent equivalence evidence
fallback lineage
direction, exact source occupancy, target implementation revision, target substrate and target cognition fraction
applicable Direction version
```

## Gate 6: deploy the private reconciler

Deploy `circulation/sedimentation/worker` with private Service Bindings only.

Required identities:

```text
RECONCILER_IDENTITY_REF          pf.runtime.sedimentation-reconciler
EXPECTED_HEARTIME_IDENTITY_REF   pf.runtime.heartime
EXPECTED_HEARTIME_COMPONENT_REF  pf.runtime.heartime
```

Public HTTP must return 404.

## Gate 7: deploy a Heartime setting for the seam

Deploy the unchanged Heartime Worker with:

```text
HEARTIME_CLOCK_KEY       sedimentation
HEARTIME_RECONCILER_REF  pf.reconciler.sedimentation
```

Bind `SEDIMENTATION_RECONCILER` to the private Worker. The attention deployment may remain separate. Both use the same PostgreSQL reconciliation contract table and cycle functions.

## Gate 8: admit one real learning scope

Choose one low-risk work class that already has measurable repeated delivery. Do not use synthetic sample work as the admission claim.

Register a Heartime reconciliation contract:

```text
id               permanent ReconciliationContractRef
organ_id         the owning observable organ
reconciler_ref   pf.reconciler.sedimentation
resource_hint    CapabilityLearningScopeRef
freshness        maximum acceptable silence before re-evaluation
```

## Gate 9: destructive conformance

Prove all of the following:

```text
same beat delivered twice
new profile observes the same open obligation
learning-policy revision changes obligation identity
controller dies after ensuring construction
profile belongs to superseded occupancy
candidate changes semantic contract
candidate changes authority contract
candidate weakens evidence contract
candidate skips a substrate rung
policy skips or reorders a substrate rung
candidate author evaluates own work
assessment names another candidate revision, profile or equivalence contract
assessment predates candidate or evidence window
fixed candidate reports non-zero runtime cognition
candidate saves money but violates quality floor
stable profile has no candidate
candidate exists but has no independent assessment
verified candidate reaches Process but is not activated
hardened implementation becomes contradicted
fallback implementation is unavailable
Heartime provider state is discarded
```

Required properties:

```text
no duplicate institutional consequence
stale evidence cannot drive transition
semantic change becomes revision, not sedimentation
authority never widens
UNKNOWN remains legal
construction and evaluation remain provisional
promotion remains outside the reconciler
softening is attributable and reversible
physical clock reconstructs from canonical state
```

## Gate 10: admission artifact

Record:

```text
contract digest
canon digest
migration digest and applied version
learning scope and capability revision
active occupancy and fallback
policy revision
work-profile derivation
candidate and artifact digests
equivalence contract and independent evidence
proposal reference
Heartime and Worker deployments
failure-test results
operator identity and authority
```

Only then may release metadata say the Capability Learning Seam is deployed and verified.

## Roll-forward discipline

- capability semantic change creates a new capability revision;
- implementation change creates a new implementation revision;
- substrate succession preserves capability revision;
- every promotion preserves prior occupancy lineage;
- softening never deletes the hardened artifact or its evidence;
- applied migrations are never rewritten;
- engine replacement is occupancy succession, not constitutional change.

---

Copyright © 2026 PowerFarm. All rights reserved.
