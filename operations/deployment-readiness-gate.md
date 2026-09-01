# Deployment Readiness Gate

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Operations` · **GATE**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status: CLOSED.**

> Deployment is a consequence of the institution, not a method for discovering it.

This file is the single place where the gate is recorded. A line is checked only
when it is satisfied by executable evidence, not by intent. `NOT RUN` is never
reported as `PASS`.

## Constitution

- [ ] Canon is adopted, versioned, and carries no contradictory appendix.
      *The operational appendix has been corrected to match verified reality; the
      canon documents are still `canon-candidate` and have not been adopted.*
- [ ] The temporal vocabulary formally distinguishes time passing, scheduled
      execution, future obligation, deadline, expectation, authorization window
      and condition. *Recorded in ADR 0011; the field set does not yet implement
      the split.*
- [x] Authority's temporal boundary has an accepted decision.
      *ADR 0013: Authority is valid where it is consumed, at the consequential
      boundary.*
- [ ] That decision is implemented and covered by negative controls.
      *Authority is still validated at `recorded_at`. ADR 0013 promotion
      criteria 1–7.*
- [ ] **Delegated Authority descends and narrows, or an explicit constitutional
      decision has been made to reject that property permanently.**
      *ADR 0015. Current implementation is root-only as a temporary safety
      envelope. This is a required incomplete capability, not backlog.*
- [ ] Exactly one canonical Process commit point exists.
      *ADR 0014: to be decided by falsification, not preference. The harness
      (`npm run experiment:canonical-commit`) finds that the failure schedule
      does not separate the two shapes; the network-partition case must be run
      against a hosted PostgreSQL before Shape B could be chosen.*
- [x] Genesis creates an institution; recovery never does.
      *ADR 0016. `Kernel.init()` was split into `create_institution` /
      `open_institution` / `restore_institution`. Identity is anchored to
      `institution_ref`, genesis ref and digest, trust root and protocol
      version — nothing physical — and is derived from the ledger, not from a
      metadata row. An empty or foreign store is refused, and a handle that
      expects an institution can never found one. Seventeen negative controls in
      `process/continuum/tests/test_institution_identity.py`; the ADR 0014
      harness proves the design holds for both candidate commit shapes.*
- [ ] Every operational startup path opens with a pinned institution anchor.
      *The kernel now supports it and the negative controls cover it, but the
      server, CLI, workers and engine Settings still open whatever store they are
      pointed at. Until they pin an anchor, the refusal exists but is not
      universally reached.*
- [ ] Restore demonstrates continuity, not only identity, wherever a witness
      exists.
      *`assert_continuity()` refuses a stale restore against a later checkpoint,
      and `restore_institution(witness=...)` enforces it. Restoring without a
      witness remains permitted and proves identity only; no operational runbook
      requires a witness yet.*

## Interfaces

- [x] Event IDs, schemas and contract versions are compatible across interfaces.
      *Canonical `evt_<32 hex>` IDs persist as text; `bootstrap_institution_v2`
      is current; the Heartime worker sends an explicit `component_ref`. Proved
      against a disposable in-process PostgreSQL.*
- [x] Resource authorization windows are verified at the real effect boundary.
      *ADR 0012, with negative controls at Cards, AI SDK, ADK and MAF.*
- [ ] Universal Ingress is the only mutation seam for humans, agents, APIs, MCP,
      webhooks and automations.
- [ ] Authentication, Identity, proposal, admission, Authority and execution are
      separated and separately tested.
- [ ] No human, runtime, analytical tool or operator holds a privileged write
      outside the ingress.
- [ ] The port that persists already-admitted acts is named for what it does.
      *Still called an admission writer. B16.*
- [ ] Transport authentication establishes the caller identity rather than
      accepting it, and the request digest is recomputed at the trusted
      boundary. *B29; ADR 0007 promotion criteria 2–3.*
- [ ] Digest/reference-only is a schema and validation rule, enforced
      recursively, rather than a convention of some Settings. *B17, B18.*

## Durability

- [ ] Cards, commitments, transitions, Authority and Evidence survive the loss of
      occupants and workers. *Card snapshot store and transition ledger are not
      deployed. B07.*
- [ ] Heartime can disappear without taking obligations with it.
- [ ] A missed deadline produces an attributable, durable breach; a lost wake
      never makes an obligation invisible. *B12, B14.*
- [ ] Retries reconcile UNKNOWN and uncertain effects before re-executing.
- [ ] Every consequential effect has a reconcilable observation or receipt and
      demonstrable idempotency. *No `EffectStore` exists. B08.*
- [ ] The Registry boundary and Occupancy freshness are verified against an
      available implementation. *The paired Registry is not in this bundle.*
- [ ] Owner-organ ports are executable, not in-memory.

## Observation

- [ ] The Observatory is reconstructible, cross-organ, machine-readable and not
      on the execution critical path. *Today it observes only the Continuum
      SQLite ledger. B23.*
- [ ] Coverage and ingest lag are explicit; missing telemetry is never read as
      absence of facts.
- [ ] No analytical tool can admit, grant, settle or promote.
- [ ] An independent verifier can falsify PowerFarm's own claims from a separate
      trust boundary. *B24.*

## Evidence

- [x] Published evidence distinguishes structural, local, integrated and external
      proof, and claims nothing above its proof.
      *`evidence/organism-verification/verification.json` classifies every
      recorded command and reports `null`, not `0`, where no counts exist.*
- [x] Derived metadata never reports a source count as an executed test result.
      *Corrected in `scripts/derive-repository.mjs`.*
- [ ] Migrations and RPCs pass against a real disposable database including
      crash, replay and rollback. *Migrations apply and RPCs answer; crash and
      rollback are covered only by the ADR 0014 harness so far.*
- [ ] The whole-system test and the institutional negative controls have been
      run. *`whole_system_test: NOT RUN`.*
- [ ] No P0 or P1 finding is unresolved.

---

Copyright © 2026 PowerFarm. All rights reserved.
