# Heartime

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Organism / Heartime` · **README**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Institutional perfusion: variable rate, level-triggered, and scoped by canonical `ReconcilerRef`.

```text
lib/heartime/schedule.js
    pure scheduling and observation logic

migrations/20260823000000_heartime_genesis.sql
    organ liveness, beats, echoes, signals

migrations/20260823190000_heartime_first_seam.sql
    durable reconciliation contracts, open-beat recovery, compact observations

migrations/20260824120000_heartime_capability_learning.sql
    recursively strengthens compact summaries for capability learning

worker/src/alarm-core.mjs
    provider-neutral alarm cycle

worker/src/postgrest-state.mjs
    authenticated Supabase/PostgREST membrane, configured by ReconcilerRef

worker/src/rpc-ports.mjs
    versioned router for attention and sedimentation reconciler bindings

worker/src/index.js
    Cloudflare Durable Object plus private control entrypoint
```

## Card circulation enforcement

Heartime now has a canonical Card circulation kernel under `circulation/cards/`. It owns lifecycle motion, wake timing, transition lineage, and observed consumption. It does not own the institutional references carried by the Card.

```text
prepared → emitted → acknowledged → executing → evidence_pending → settled
              ↘ orphaned → reconciling ↗
```

Illegal jumps fail closed. Every live Card carries `next_expected` unless explicitly blocked. Emission writes `beat_ref`, `emitted_at`, and the next expectation before external execution begins.

## Epistemic wake enforcement

Heartime also treats knowledge as time-sensitive. Memory records what was observed, inferred, assumed, reported, unknown, or contradicted; Heartime does not rewrite those records. It watches `epistemic.next_sample` and observation freshness and may wake a prepared/deferred Card before its ordinary `next_expected` when the world is due to be sampled again.

A Card with unresolved UNKNOWN state cannot be deliberately deferred without a sampling condition. This makes sleep attributable: a future occupant is told not only what the previous occupant believed, but when those beliefs must face the world again.

## Engine handoff

When a Card reaches `executing`, its beat and attempt refs become part of the sealed ExecutionSlice consumed by Process Settings. Heartime does not choose the engine and does not encode engine-local invocation identity. `attempt_ref` survives recovery; `beat_ref` may change when Heartime deliberately reissues an interrupted or reconciled attempt. The resulting `run_ref` remains stable.

## Invariants

1. **The deadline is written on emission.** Silence cannot unschedule itself.
2. **The roster is the coverage contract.** It declares maximum silence, not a metronome.
3. **Everything that acts must be attributable.** Unscheduled but attributed action may be extraordinary; unattributed action is parallel power.
4. **Heartime does not deliver work.** It wakes one reconciler with references and reason. The reconciler fetches current owner state.
5. **An open beat remains due.** Provider death after emission cannot lose the obligation.
6. **The physical engine may evaporate.** The next alarm is reconstructed from PostgreSQL.
7. **One setting may serve several seams.** Canonical `ReconcilerRef`, not deployment topology, selects the contract and private binding.
8. **Summaries are compact references.** Organ-owned bodies cannot return through Heartime.
9. **Cards are the circulating carrier.** Heartime may move and meter a Card but cannot rewrite Registry identity, Process Authority, Platform execution truth, Memory evidence, or Homeostasis health.
10. **Every live Card remains expected.** A live Card has `next_expected`; blocked and terminal states are explicit rather than silent disappearance.
11. **A beat is a delivery, not the obligation.** Same-beat redelivery fails closed; deliberate recovery emits a new beat while preserving the attempt.
12. **Occupancy replacement does not erase work.** Heartime marks stale custody `orphaned`, coordinates reconciliation, and reissues only after Process admits takeover/resume.
13. **Knowledge has a wake condition.** Due `next_sample` or stale observations can wake a Card before ordinary work timing.
14. **Heartime schedules observation; it does not invent knowledge.** Epistemic records remain Memory-owned and evidence-linked.

## Status

Pure logic, migrations, physical setting, PostgREST membrane, and both reconciler routes are built and locally verified. PostgreSQL migrations have not been applied to production. Cloudflare settings and live organ bindings have not been deployed.

```bash
npm run verify
```

## Energy circulation

Heartime now enforces Card resource circulation. It does not grant budget. Process authorizes energy and cost; Heartime meters each beat, admits Platform resource observations, and refuses further circulation when the authorized vector or monetary ceiling is exhausted. Homeostasis consumes the resulting pressure projection.

## Production perfusion and trace

Heartime production state now includes a narrow operational trace projection. Every stable `CardRef` yields one deterministic `trace_ref`; beats inherit deterministic correlation and carry it through private reconciler bindings and Process persistence. Heartime records compact dispatch/reconciliation events and exposes circulation-pressure projection without storing Card bodies, prompts, chain-of-thought, Authority, or secrets.

Runtime PostgREST access is no longer modeled as a static bearer. `RegistryRuntimeTokenProvider` consumes the Registry Service Binding for `pf.runtime.heartime`, refreshes on expiry, and fails closed on subject/contract drift. Trace recording itself remains best-effort so observability cannot become a liveness dependency.

---

Copyright © 2026 PowerFarm. All rights reserved.
