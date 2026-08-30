## 0.5.0 - Super bundle engine convergence

- Vendored and content-pinned Vercel AI SDK 7.0.84 source under `engines/ai-sdk/upstream`.
- Added `continuum-ai-sdk` as a strict Process Setting beside `continuum-adk`.
- Added golden Node -> Continuum integration tests with Registry-backed Office/Occupancy.
- Tool admission is fail-closed and precedes execution; raw inputs/results remain digest-only by default.
- Completed run retries are refused before re-executing external effects.
- Provider-executed AI SDK tools fail closed until a dedicated admission/receipt boundary exists.
- Fixed Continuum Registry-backed semantic/audit checks so Registry Offices can own runs without duplicate embedded Office state.
- Registry-backed Process now rejects `identity.key.*` mutation as Registry-owned identity state.
- Added exact AI SDK source manifest, lockfile/package pins, source-shape guards, and engine-boundary guards.

# Changelog

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle` · **HISTORY**  
> **Navigate:** [Super Bundle](./README.md) · [Documentation map](./DOCUMENTATION.md) · [Canon](./canon/README.md) · [Contracts](./contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

## 0.12.0 - Cards + Heartime Milestone 7: Legacy Removal

- Writable Continuum now requires Registry identity reality by default; the retired embedded directory is available only through explicit `identity_mode="embedded-test"`.
- AI SDK and ADK institutional execution now require a sealed ExecutionSlice; engine-local invocation/session/tool-call IDs are provenance only.
- Removed ADK runtime Office/Occupancy/grant bootstrap exports and moved AI SDK Python bootstrap transport entirely under test support.
- First Seam `Cards.listCurrent()` now accepts only sealed `powerfarm.card.v1`; WakePack projections are bound to the exact source Card digest.
- Added Card-bound PostgreSQL `continuum.admit_card_batch_v2`; authenticated callers can no longer execute the legacy `admit_batch_v1` RPC directly.
- Added `pf.contract.legacy-removal.v1` and release gates that preserve the exact Card v1 hashes from Milestones 5 and 6.

## 0.11.0 — Cards + Heartime Milestone 6: Production Circulation

- Added production `PostgrestRegistryDirectory` for read-only historical Office/Occupancy/key resolution.
- Added Registry-issued short-lived runtime credential consumption for Heartime and the Process writer.
- Added transaction-serialized PostgreSQL admission persistence for already-admitted acts, preserving canonical `pf.*` refs beside provider UUID coordinates. Milestone 7 later closed direct authenticated access to the v1 routine behind the Card-bound v2 writer.
- Added private `ProcessAdmissionWriterPort` Service Binding with no service-role key.
- Added deterministic Card-derived trace refs, W3C trace propagation, compact Heartime trace persistence, and circulation-pressure projection without changing Card v1 bytes.
- Added `pf.contract.production-circulation.v1`, production transport conformance, and a sixth pinned circulation golden.
- Production-shaped implementations are built and verified but remain explicitly not deployed.

## 0.10.0 — Cards + Heartime Milestone 5: Energy + Cost

- Added `pf.contract.energy-cost.v1` with vector energy budgets and integer-micro monetary cost.
- Every Heartime emission and recovery reissue now consumes one content-addressed `beats` observation.
- Platform resource observations are evidence-backed, replay-idempotent, and tied to exact Card/attempt/beat provenance.
- Heartime blocks unauthorized, exhausted, or overdrawn circulation without hiding observed overdraw.
- Homeostasis now derives resource pressure and circulatory debt from Card state.
- Promoted the engine boundary to `powerfarm.execution-slice.v3`, sealing remaining budget while keeping `run_ref` engine-, occupancy-, and budget-independent.
- Added a fifth circulation golden proving budget delivery to AI SDK, exact cost exhaustion, Homeostasis pressure, and blocked subsequent circulation.

## 0.9.0 - Cards + Heartime Milestone 4: Epistemic Continuity

- Added `pf.contract.epistemic-continuity.v1` and `powerfarm.epistemic-record.v1`.
- Added durable classes `OBSERVED`, `INFERRED`, `ASSUMED`, `REPORTED`, `UNKNOWN`, and `CONTRADICTED`.
- Evidence-backed observations and reports fail closed without durable evidence/source attribution; inferences require cited support.
- Epistemic records receive content-addressed `pf.epistemic.*` refs and cannot be resealed after body tampering.
- Memory owns durable epistemic records; Heartime alone owns `epistemic.next_sample`.
- Heartime can wake a prepared/deferred Card when a sample is due or an observation becomes stale.
- A Card with unresolved UNKNOWN state cannot be deferred without a future sampling condition.
- Added `powerfarm.epistemic-wake-context.v1`, preserving observations, inference, uncertainty, conflicts, freshness and evidence refs for future occupants.
- Added a pinned multi-process golden where occupant A exits completely and occupant B continues from the serialized Card only.
- Private model sessions, raw prompts, chat transcripts and hidden chain-of-thought remain outside the Card contract.

## 0.8.0 - Cards + Heartime Milestone 3: Recovery

- Promoted the engine boundary to `powerfarm.execution-slice.v2`, separating stable `attempt_ref` from per-delivery `beat_ref`.
- Heartime can mark interrupted or stale-Occupancy Cards `orphaned`, reconcile them, and reissue a new beat without changing the institutional run.
- Added Continuum `run.takeover` and `run.resume` continuation semantics with current Registry Occupancy enforcement.
- Old occupants can no longer resume or close after Registry replacement; successor occupants require exact takeover/resume lineage.
- Same-beat duplicate delivery fails closed as `POWERFARM_ALREADY_IN_FLIGHT`; a new beat uses a deterministic `resume_request_id`.
- ADK and AI SDK now share the same recovery model and stable `run_ref` external idempotency key.
- Added pinned recovery golden covering lost receipt, duplicate delivery, Occupancy replacement, takeover, reissue, resume and one physical effect.
- Added `pf.contract.card-recovery.v1` and recovery conformance checks.

## 0.7.0 - Cards + Heartime Milestone 2: Engine Equivalence

- Added sealed `powerfarm.execution-slice.v1`, derived from an executing Card before engine selection.
- Unified ADK and AI SDK institutional run identity under engine-neutral `pfx-*` refs and deterministic request IDs.
- Engine-local invocation/session/tool-call IDs are now provenance only when an ExecutionSlice is present.
- Both Settings validate exact capability mapping and slice content seal before execution.
- Both Settings preserve Card, beat, attempt, Direction, ECS and slice digest through `run.finish`/`run.fail` receipts.
- Added a pinned cross-runtime golden proving identical normalized Continuum consequence and replay behavior for ADK and AI SDK.
- Added `pf.contract.execution-receipt.v1` around the common Continuum `RuntimeReceipt` semantics.

## 0.3.0 — 2026-08-24

### Permanent capability learning and sedimentation

- Added Canon Document 2, **Capability Learning and Sedimentation**.
- Added the permanent `pf.contract.capability-learning.v1` machine contract.
- Added a portable, stateless, level-triggered sedimentation reconciler.
- Added strict Registry, Evidence, Imagineering, Process and Heartime port membranes.
- Added a private Cloudflare Worker setting with a closed public HTTP surface.
- Generalized Heartime routing to multiple canonical `ReconcilerRef` identities without creating another scheduler.
- Added the evolutionary Heartime compact-summary migration for capability-learning references.
- Added exact capability, implementation, occupancy, policy, profile, assessment and proposal binding.
- Separated institutional obligation identity from evidence-observation identity.
- Added digital substrate succession: `inference → configuration → fixed`, one rung at a time.
- Added exact inference fallback lineage and attributable softening.
- Added independent equivalence assessment and fail-closed Process proposal verification.
- Added 30 executable capability-learning negative controls and a vertical Heartime-to-Process lifecycle test.

### Verification

- 120 deterministic tests across Heartime, roster, attention, capability learning and both vertical seams.
- 58 executable capability-learning structural contract checks.
- 42 executable First Seam structural contract checks.
- 14 capability-learning migration checks.
- Production deployment remains explicitly unclaimed until owner-organ ports, provider settings and destructive admission evidence exist.

---

Copyright © 2026 PowerFarm. All rights reserved.
