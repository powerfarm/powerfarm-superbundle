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

## 0.14.0 — Every process knows which institution it is serving

- **ADR 0016 is now mandatory on every operational startup path.** Twelve paths are inventoried in `operations/institutional-startup-paths.md`, each with `wrong anchor -> refuses before work` and `correct anchor -> starts` as executable negative controls. The operational rule is `normal startup = OPEN EXISTING INSTITUTION`, never `init whatever is there`; CREATE stays reachable only by explicit genesis ceremony and RESTORE only by explicit recovery.
- The ADK and MAF Settings require `expect_institution` and re-derive the anchor from the Kernel they were handed. A configuration that validated once cannot vouch for what it passes down: an inherited handle is re-verified, not trusted.
- The AI SDK Setting reaches Continuum through a Python child process, which is exactly where a parent-side check proves nothing. `PythonContinuumPort` learns the anchor at genesis and carries it into every child; the child refuses when it is undeclared, when the store is empty, when the store is a different institution, and when the anchor it was handed disagrees with the store.
- **Heartime carried no institutional identity at all.** Its tables key on ReconcilerRef, organ and component, none of which say whose circulation this is, so a worker pointed at a restored snapshot or a copied connection string had nothing to check. Added `heartime.institution` as a singleton plus `declare_institution_v1` and `assert_institution_v1`; a Heartime deployment serves one institution, so this needed no column on any existing table and no RPC signature changed.
- Added `continuum.assert_institution_v1` and `continuum.bootstrap_institution_v3`, which records the anchor and refuses to re-found the same id under a different one. The Process worker declares `PROCESS_EXPECTED_INSTITUTION` and asserts before any persist; the Heartime worker declares `HEARTIME_EXPECTED_INSTITUTION` and asserts before arming or cycling.
- Workers are stateless request handlers, so every request is a startup: the assertion runs per persist and per alarm, and the wire order is pinned by test — `assert_institution_v1` precedes `admit_card_batch_v2`, and no cycle work happens before the assertion resolves. The cost is one extra authenticated RPC per persist, visible in the production circulation golden as a second runtime-token spend and recorded rather than hidden.
- CI installs Node dependencies before the verification gates. `verify:organism` and `verify:process` both run the disposable PostgreSQL suites, which need the pinned `@electric-sql/pglite`; neither job installed anything, so both would have failed on any runner.
- One exception remains and is recorded as an open gate line: `Kernel(path)` with no declared expectation can still found an institution, which is what `create_institution()` and the disposable test fixtures use. No operational path reaches it, but the constructor is not sealed.

## 0.13.0 — Timed authorization boundary and honest evidence semantics

- Promoted the engine boundary to `powerfarm.execution-slice.v4`. `deriveExecutionSlice()` now requires an explicit `evaluatedAt` and never infers the authorization instant from `Card.updated_at` (B04).
- The slice seals `resources.evaluated_at` and both energy and cost authorization windows. Windows use an inclusive `effective_at` and an exclusive `expires_at`.
- AI SDK, ADK and Microsoft Agent Framework Settings revalidate both sealed windows against an injectable clock immediately before the external effect, after verifying the slice seal.
- Added expiry negative controls at three layers: Card derivation and the shared temporal assertion, the AI SDK wrapper, and the ADK and MAF Settings. They cover expiry after derivation, the exclusive `expires_at` boundary, a rewound execution clock, and occupant/engine identity failing to widen a window.
- Added disposable PostgreSQL proof boundaries using pinned `@electric-sql/pglite`, applying the real Process and Heartime migration chains and calling the real RPCs through the workers' PostgREST-shaped transport.
- Canonical Event IDs persist as `evt_<32 lowercase hex>` text instead of being cast to UUID (B01). `bootstrap_institution_v2` returns `powerfarm.process.bootstrap.v2` (B02). The Heartime worker always sends an explicit institutional `component_ref` (B03), and trace attribute redaction is recursive.
- `act_signatures` gained an identity primary key so `registry_key_ref` can be nullable, requiring either a Registry key reference or a fingerprint, with partial uniqueness for both forms. PostgreSQL surfaced this; SQLite had hidden it.
- Corrected derived evidence semantics (B10/B11). `scripts/derive-repository.mjs` no longer reports structural source counts as executed tests with zero failures; declaration counts are labelled `declared_test_inventory` with an explicit measurement note and a pointer to the report that actually executes them.
- `scripts/record-verification.mjs` classifies every recorded command as `structural`, `derived`, `executable-local` or `executable-integration`, states what each class does and does not prove, and reports `assertions_passed: null` rather than `0` for commands that report no counts. The two disposable PostgreSQL suites, the Heartime migration-structure checks and the release-integrity gate are now recorded.
- Overstated deployment claims were reduced to what the proof supports: the Process PostgreSQL writer is recorded as wire-verified against a disposable in-process PostgreSQL, and explicitly not the canonical admission boundary.
- Added `/api/head` and `/api/findings` to the Process OpenAPI contract and advanced it to 0.4.0 (B25).
- Added ADR 0011 (the future is a semantics over existing primitives, not a new entity) and ADR 0012 (resource authorization is checked at the effect boundary).
- Decided and recorded: **ADR 0013 — Authority is valid where it is consumed.** Authority must hold at the consequential boundary, not generically at `recorded_at`. Creating a future obligation and causing the future effect are two consequences that consume Authority separately. Expiry before the boundary blocks the effect and leaves the Commitment `OPEN`; expiry after a committed irreversible consequence does not undo it. Accepted as the decision; not yet implemented in the kernel.
- Decided and recorded: **ADR 0015 — delegated Authority is a required incomplete capability.** Grant and revoke stay root-only as a temporary safety envelope, and the canon is not amended to remove delegation. Nine named negative controls and a blocking readiness-gate line were recorded so the gap cannot decay into backlog.
- Opened as a bounded experiment: **ADR 0014 — the canonical Process commit point is decided by falsification, not preference.** Added `npm run experiment:canonical-commit`, which puts both candidate commit shapes through one identical thirteen-scenario failure schedule using real transactional engines, with each admission in a child process that SIGKILLs itself at the injection point, and with a deliberately forbidden shape running alongside so the harness proves it can report a violation.
- The experiment found that the failure schedule does **not** separate the two shapes, and surfaced a shape-independent hazard that is in the product: admission into a missing canonical store is correctly refused because the store is uninitialized, but `Kernel.init()` against that substitute store succeeds and forks the institution. Verified against the real Continuum kernel, not only against the harness model.
- Closed that hazard. **ADR 0016 — genesis creates an institution; recovery never does.** `Kernel.init()` was split into three verbs with three preconditions: `create_institution` (the genesis ceremony, once, returning the anchor), `open_institution` (attaches to exactly the named institution and can never run genesis), and `restore_institution` (rebuilds an existing institution from a verified bundle and never runs genesis).
- Institutional identity is anchored to `institution_ref`, the genesis act's ref and digest, the trust root fingerprint and the protocol version, bound by an `anchor_digest`. It names nothing physical — no path, host, URL or engine — and is derived from the ledger rather than from a metadata row, so rewriting metadata alone does not forge it.
- OPEN fails closed on an empty store, a different `institution_ref`, a different genesis, a different trust root or a different protocol version, and reports the differences field by field. A handle that names the institution it expects cannot found one, so a normal runtime has no path to genesis at all.
- RESTORE proves identity; only a witness proves continuity. `assert_continuity()` reuses the existing checkpoint mechanism rather than inventing a second one, and refuses a stale copy that carries the right name but does not contain a later witnessed head. Restoring without a witness stays permitted and is documented as weaker.
- Seventeen negative controls in `process/continuum/tests/test_institution_identity.py` cover the canonical store disappearing, normal startup against an empty store, a second bootstrap attempt, a foreign store, a correct `institution_ref` with incompatible lineage, a stale restore against a later witness, a legitimate restore, and the store changing physical location without any change of identity.
- The CLI now carries the three verbs: `init` requires `--create-new-institution` and prints the anchor, `--expect-institution` pins any invocation, `restore` takes a bundle and an optional witness, and `anchor` prints a store's identity.
- The ADR 0014 harness reproduces the original fork and proves it now fails closed in **both** candidate commit shapes, so the fix does not prejudge the canonical-commit decision. A `CONTROL-LEGACY-STARTUP` control shows the fork still appears the moment the stated expectation is removed.
- Regenerated `process/continuum/MANIFEST.sha256`, which was already stale before this work: it listed a `checkpoint.schema.json` that no longer exists and omitted ten tracked files.
- Added `operations/deployment-readiness-gate.md` as the single place the gate is recorded, with each line marked satisfied only where executable evidence exists.
- No dual-write was introduced to make the canonical-commit question disappear, and no shape was selected by preference.

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
