// ADR 0014 — bounded decision experiment for the canonical Process commit point.
//
// Two candidate commit shapes face one identical failure schedule:
//
//   Shape A  embedded canonical (SQLite) + remote projection (PostgreSQL) fed by
//            an outbox written inside the canonical transaction
//   Shape B  remote canonical (PostgreSQL); the embedded store is a projection
//
// The invariant under test is:
//
//     ADMITTED  =>  a canonical durable commit exists
//
// alongside atomicity, idempotency, head correctness, deterministic replay and
// unambiguous recovery.
//
// Nothing here is a production architecture. It is the smallest faithful
// implementation needed to falsify each shape.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bodyDigest, projectFromCanonical } from './admission.mjs';
import { openSqliteStore } from './store-sqlite.mjs';
import { openPostgresStore } from './store-postgres.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const agent = path.join(here, 'agent.mjs');
const reportPath = path.join(here, 'report', 'canonical-commit-experiment.json');

const INVARIANTS = {
  ADMITTED_IMPLIES_DURABLE: 'no state exists in which the caller was told ADMITTED and the canonical durable commit does not exist',
  ATOMICITY: 'a batch commits entirely or not at all',
  IDEMPOTENCY: 'one request id yields one act; a different body under the same request id is refused, not overwritten',
  HEAD_CORRECTNESS: 'no lost update and no divergent head',
  DETERMINISTIC_REPLAY: 'replaying the canonical record reproduces the same state',
  UNAMBIGUOUS_RECOVERY: 'after a crash every act is unambiguously committed or unambiguously absent, never indeterminate',
};

class Workspace {
  constructor(shape, { ackBeforeCommit = false } = {}) {
    this.shape = shape;
    this.ackBeforeCommit = ackBeforeCommit;
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), `pf-commit-${shape}-`));
    this.canonicalPath = shape === 'A' ? path.join(this.dir, 'canonical.db') : path.join(this.dir, 'canonical-pg');
    this.projectionPath = shape === 'A' ? path.join(this.dir, 'projection-pg') : path.join(this.dir, 'projection.db');
    this.calls = 0;
  }

  // Every institution begins with an explicit initialization act, exactly as
  // Kernel.init() requires. Nothing may be admitted before it.
  init() {
    const created = this.run({ init: true });
    this.anchor = created.result?.anchor ?? null;
    return created;
  }

  // Every admission runs in its own process, so a crash is a real crash and the
  // next observation genuinely reopens the store from disk.
  run(request) {
    this.calls += 1;
    const resultPath = path.join(this.dir, `result-${this.calls}.json`);
    const payload = {
      shape: this.shape,
      canonicalPath: this.canonicalPath,
      projectionPath: this.projectionPath,
      resultPath,
      ackBeforeCommit: this.ackBeforeCommit,
      ...request,
    };
    const child = spawnSync(process.execPath, [agent, JSON.stringify(payload)], { cwd: root, encoding: 'utf8' });
    const killed = child.signal === 'SIGKILL' || child.status === 137;
    // A killed agent normally leaves no result. The forbidden control shape does
    // leave one, because it answered the caller before committing — so the file
    // is read either way and the verdict follows what the caller was actually
    // told.
    let result = null;
    if (fs.existsSync(resultPath)) result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    return {
      killed,
      status: child.status,
      signal: child.signal,
      // A caller only ever sees an outcome the agent actually returned. A killed
      // agent returned nothing, so the caller was never told ADMITTED.
      callerSaw: result?.outcome ?? null,
      result,
      stderr: (child.stderr ?? '').trim(),
    };
  }

  async openCanonical() {
    return this.shape === 'A' ? openSqliteStore(this.canonicalPath) : openPostgresStore(this.canonicalPath);
  }

  async openProjection() {
    return this.shape === 'A' ? openPostgresStore(this.projectionPath) : openSqliteStore(this.projectionPath);
  }

  async inspect(branch = 'main') {
    const canonical = await this.openCanonical();
    const projection = await this.openProjection();
    const state = {
      canonicalActs: await canonical.allActs(branch),
      canonicalHead: await canonical.head(branch),
      projectionActs: await projection.allActs(branch),
      projectionHead: await projection.head(branch),
    };
    await canonical.close();
    await projection.close();
    return state;
  }

  async repairProjection(branch = 'main') {
    const canonical = await this.openCanonical();
    const projection = await this.openProjection();
    const outcome = await projectFromCanonical(canonical, projection, branch);
    await canonical.close();
    await projection.close();
    return outcome;
  }

  async corruptProjection(branch = 'main') {
    const projection = await this.openProjection();
    await projection.corrupt(branch);
    await projection.close();
  }

  // Make the canonical store unreachable. For Shape A that models losing the
  // local disk; for Shape B it models losing the remote store or the network to
  // it. The mechanism is the same, the real-world likelihood is not, and that
  // asymmetry is the point of scenario 12.
  detachCanonical() {
    this.detachedPath = `${this.canonicalPath}.detached`;
    fs.renameSync(this.canonicalPath, this.detachedPath);
    for (const suffix of ['-wal', '-shm']) {
      const side = `${this.canonicalPath}${suffix}`;
      if (fs.existsSync(side)) fs.renameSync(side, `${this.detachedPath}${suffix}`);
    }
  }

  reattachCanonical() {
    for (const suffix of ['-wal', '-shm']) {
      const side = `${this.detachedPath}${suffix}`;
      if (fs.existsSync(side)) fs.renameSync(side, `${this.canonicalPath}${suffix}`);
    }
    fs.rmSync(this.canonicalPath, { recursive: true, force: true });
    fs.renameSync(this.detachedPath, this.canonicalPath);
  }

  cleanup() { fs.rmSync(this.dir, { recursive: true, force: true }); }
}

const findings = [];
function record(shape, scenario, invariant, held, detail, cost = null) {
  findings.push({ shape, scenario, invariant, verdict: held ? 'HELD' : 'VIOLATED', detail, cost });
}
function notApplicable(shape, scenario, invariant, detail) {
  findings.push({ shape, scenario, invariant, verdict: 'NOT_EXERCISED', detail, cost: null });
}

const scenarios = [
  {
    id: '01-kill-before-canonical-commit',
    title: 'kill Process immediately before canonical commit',
    async run(ws) {
      const call = ws.run({ requestId: 'req-1', body: { n: 1 }, killAt: 'before-commit' });
      const state = await ws.inspect();
      record(ws.shape, this.id, 'ADMITTED_IMPLIES_DURABLE',
        call.callerSaw !== 'ADMITTED',
        `caller saw ${call.callerSaw ?? 'nothing (process died)'}; canonical holds ${state.canonicalActs.length} act(s)`);
      record(ws.shape, this.id, 'UNAMBIGUOUS_RECOVERY',
        state.canonicalActs.length === 0 && (state.canonicalHead.head_id ?? null) === null,
        `after reopening from disk: ${state.canonicalActs.length} act(s), head ${state.canonicalHead.head_id ?? 'null'}`);
      record(ws.shape, this.id, 'ATOMICITY', state.canonicalActs.length === 0,
        'the uncommitted transaction left nothing behind');
    },
  },
  {
    id: '02-kill-after-canonical-commit',
    title: 'kill Process immediately after canonical commit, before answering',
    async run(ws) {
      const call = ws.run({ requestId: 'req-1', body: { n: 1 }, killAt: 'after-commit' });
      const state = await ws.inspect();
      record(ws.shape, this.id, 'ADMITTED_IMPLIES_DURABLE', state.canonicalActs.length === 1,
        `caller saw ${call.callerSaw ?? 'nothing (process died)'}; canonical durably holds ${state.canonicalActs.length} act(s)`,
        call.callerSaw === null ? 'the commit is durable but the caller never learned its outcome; the caller must retry to find out' : null);
      record(ws.shape, this.id, 'UNAMBIGUOUS_RECOVERY',
        state.canonicalActs.length === 1 && state.canonicalHead.head_id === state.canonicalActs[0]?.id,
        `head ${state.canonicalHead.head_id ?? 'null'} matches the single committed act`);
      record(ws.shape, this.id, 'ATOMICITY', state.canonicalActs.length === 1, 'the committed batch is present exactly once');
    },
  },
  {
    id: '03-kill-between-commit-and-projection',
    title: 'kill Process between canonical commit and projection',
    async run(ws) {
      ws.run({ requestId: 'req-1', body: { n: 1 }, killAt: 'after-commit-before-projection' });
      const before = await ws.inspect();
      record(ws.shape, this.id, 'ADMITTED_IMPLIES_DURABLE', before.canonicalActs.length === 1,
        `canonical holds ${before.canonicalActs.length} act(s) while the projection holds ${before.projectionActs.length}`);
      const repaired = await ws.repairProjection();
      const after = await ws.inspect();
      record(ws.shape, this.id, 'DETERMINISTIC_REPLAY',
        after.projectionActs.length === after.canonicalActs.length
          && after.projectionActs.every((act, index) => act.id === after.canonicalActs[index].id),
        `re-running projection from the canonical record delivered ${repaired.delivered} act(s) and made the projection identical`,
        before.projectionActs.length === 0 ? 'the projection was behind until a projector ran again; readers of the projection saw stale state in the meantime' : null);
    },
  },
  {
    id: '04-lost-acknowledgement',
    title: 'lost acknowledgement after a successful commit, then the caller retries',
    async run(ws) {
      ws.run({ requestId: 'req-1', body: { n: 1 }, killAt: 'after-commit' });
      const retry = ws.run({ requestId: 'req-1', body: { n: 1 } });
      const state = await ws.inspect();
      record(ws.shape, this.id, 'IDEMPOTENCY',
        retry.callerSaw === 'DUPLICATE' && state.canonicalActs.length === 1,
        `retry saw ${retry.callerSaw}; canonical holds ${state.canonicalActs.length} act(s)`);
      record(ws.shape, this.id, 'UNAMBIGUOUS_RECOVERY', retry.callerSaw === 'DUPLICATE',
        'the retry told the caller the act already existed rather than leaving the outcome unknown');
    },
  },
  {
    id: '05-duplicate-request-same-body',
    title: 'duplicate request, same body',
    async run(ws) {
      const first = ws.run({ requestId: 'req-1', body: { n: 1 } });
      const second = ws.run({ requestId: 'req-1', body: { n: 1 } });
      const state = await ws.inspect();
      record(ws.shape, this.id, 'IDEMPOTENCY',
        first.callerSaw === 'ADMITTED' && second.callerSaw === 'DUPLICATE' && state.canonicalActs.length === 1,
        `first ${first.callerSaw}, second ${second.callerSaw}, canonical holds ${state.canonicalActs.length} act(s)`);
      record(ws.shape, this.id, 'HEAD_CORRECTNESS',
        state.canonicalHead.head_id === state.canonicalActs[0]?.id && Number(state.canonicalHead.seq) === 1,
        `head is ${state.canonicalHead.head_id ?? 'null'} at seq ${state.canonicalHead.seq}`);
    },
  },
  {
    id: '06-duplicate-request-different-body',
    title: 'duplicate request, different body',
    async run(ws) {
      const first = ws.run({ requestId: 'req-1', body: { n: 1 } });
      const second = ws.run({ requestId: 'req-1', body: { n: 999 } });
      const state = await ws.inspect();
      const original = state.canonicalActs[0];
      record(ws.shape, this.id, 'IDEMPOTENCY',
        first.callerSaw === 'ADMITTED'
        && second.callerSaw === 'CONFLICT_DIFFERENT_BODY'
        && state.canonicalActs.length === 1
        && original?.body_sha256 === bodyDigest({ n: 1 }),
        `second attempt saw ${second.callerSaw}; the stored body digest is still the original`);
    },
  },
  {
    id: '07-concurrent-head-cas',
    title: 'two admissions racing on the same expected head',
    async run(ws) {
      const first = ws.run({ requestId: 'req-1', body: { n: 1 }, expectedHead: null });
      const second = ws.run({ requestId: 'req-2', body: { n: 2 }, expectedHead: null });
      const state = await ws.inspect();
      record(ws.shape, this.id, 'HEAD_CORRECTNESS',
        first.callerSaw === 'ADMITTED' && second.callerSaw === 'HEAD_CONFLICT' && state.canonicalActs.length === 1,
        `first ${first.callerSaw}, second ${second.callerSaw}; canonical holds ${state.canonicalActs.length} act(s)`);
      notApplicable(ws.shape, this.id, 'ATOMICITY',
        'true multi-connection contention is not exercised: both admissions run in separate processes but the stores are embedded single-connection engines. Real lock and serialization behaviour needs a hosted PostgreSQL server.');
    },
  },
  {
    id: '08-atomic-batch-failure',
    title: 'a multi-act batch whose last act violates a constraint',
    async run(ws) {
      const call = ws.run({ requestId: 'req-1', body: [{ n: 1 }, { n: 2 }, { n: 3 }], poison: true });
      const state = await ws.inspect();
      record(ws.shape, this.id, 'ATOMICITY',
        call.callerSaw === 'REJECTED' && state.canonicalActs.length === 0,
        `caller saw ${call.callerSaw}; canonical holds ${state.canonicalActs.length} act(s) from the failed batch`);
      record(ws.shape, this.id, 'HEAD_CORRECTNESS', (state.canonicalHead.head_id ?? null) === null,
        `head is ${state.canonicalHead.head_id ?? 'null'} after the rejected batch`);
    },
  },
  {
    id: '09-restart-and-replay',
    title: 'restart and replay',
    async run(ws) {
      for (const n of [1, 2, 3]) ws.run({ requestId: `req-${n}`, body: { n } });
      const before = await ws.inspect();
      const replayed = await ws.repairProjection();
      const after = await ws.inspect();
      record(ws.shape, this.id, 'DETERMINISTIC_REPLAY',
        replayed.delivered === 3
        && after.canonicalActs.map((a) => a.id).join(',') === before.canonicalActs.map((a) => a.id).join(',')
        && after.projectionActs.map((a) => a.id).join(',') === after.canonicalActs.map((a) => a.id).join(','),
        `replaying ${replayed.delivered} canonical act(s) reproduced the identical sequence`);
      const causes = after.canonicalActs.map((a) => a.causes ?? null);
      record(ws.shape, this.id, 'HEAD_CORRECTNESS',
        causes[0] === null && causes[1] === after.canonicalActs[0].id && causes[2] === after.canonicalActs[1].id,
        'each act causes its predecessor and the chain reconstructs from the record alone');
    },
  },
  {
    id: '10-corrupted-downstream-projection',
    title: 'corrupted downstream projection',
    async run(ws) {
      for (const n of [1, 2]) ws.run({ requestId: `req-${n}`, body: { n } });
      const clean = await ws.inspect();
      await ws.corruptProjection();
      const corrupted = await ws.inspect();
      record(ws.shape, this.id, 'ADMITTED_IMPLIES_DURABLE',
        corrupted.canonicalActs.map((a) => a.body_sha256).join(',') === clean.canonicalActs.map((a) => a.body_sha256).join(','),
        'corrupting the projection did not change the canonical record');
      await ws.repairProjection();
      const repaired = await ws.inspect();
      record(ws.shape, this.id, 'DETERMINISTIC_REPLAY',
        repaired.projectionActs.map((a) => a.body_sha256).join(',') === repaired.canonicalActs.map((a) => a.body_sha256).join(','),
        'the projection was fully rebuilt from the canonical record',
        'nothing in either shape detects the corruption on its own; repair here was triggered by the harness, not by the system');
    },
  },
  {
    id: '11-projection-unavailable',
    title: 'projection unavailable for an extended period',
    async run(ws) {
      for (const n of [1, 2, 3, 4]) ws.run({ requestId: `req-${n}`, body: { n }, project: false });
      const during = await ws.inspect();
      record(ws.shape, this.id, 'ADMITTED_IMPLIES_DURABLE',
        during.canonicalActs.length === 4,
        `${during.canonicalActs.length} act(s) were admitted and are durable while the projection held ${during.projectionActs.length}`);
      const caught = await ws.repairProjection();
      const after = await ws.inspect();
      record(ws.shape, this.id, 'DETERMINISTIC_REPLAY',
        after.projectionActs.length === 4 && caught.delivered === 4,
        'when the projection returned it caught up to exactly the canonical sequence',
        'while the projection was away, any reader of the projection saw a stale institution with no signal that it was stale');
    },
  },
  {
    id: '12-canonical-store-unavailable',
    title: 'canonical store unavailable, then restored',
    async run(ws) {
      ws.run({ requestId: 'req-1', body: { n: 1 } });
      const before = await ws.inspect();

      ws.detachCanonical();
      // With the canonical store gone, an admission must fail loudly. If instead
      // a second canonical appears, the institution has forked: that is split
      // brain, and it is the thing being looked for.
      const during = ws.run({ requestId: 'req-2', body: { n: 2 } });
      const substituteCreated = fs.existsSync(ws.canonicalPath);
      const headDuringOutage = during.result?.head?.head_id ?? null;
      ws.reattachCanonical();
      const after = await ws.inspect();
      const admittedActSurvived = after.canonicalActs.some((act) => act.request_id === 'req-2');

      record(ws.shape, this.id, 'ADMITTED_IMPLIES_DURABLE',
        !(during.callerSaw === 'ADMITTED' && !admittedActSurvived),
        during.callerSaw === 'ADMITTED' && !admittedActSurvived
          ? `the caller was told ADMITTED while the canonical store was unreachable, and that act does not exist afterwards: the store had silently created a substitute canonical, and the admission went into an institution that no longer exists`
          : `the caller saw ${during.callerSaw ?? 'nothing (process died)'} while the canonical store was unreachable; the canonical record after restore is intact`,
        'the institution cannot admit anything while its canonical store is unreachable; the question is whether it says so or invents a new institution');
      record(ws.shape, this.id, 'UNAMBIGUOUS_RECOVERY', !substituteCreated || during.callerSaw !== 'ADMITTED',
        substituteCreated && during.callerSaw === 'ADMITTED'
          ? 'opening a missing canonical store created an empty one and admitted into it, so after restore there is no record that the caller was ever answered'
          : 'no substitute canonical store accepted an admission');
      record(ws.shape, this.id, 'HEAD_CORRECTNESS',
        headDuringOutage === null || headDuringOutage === (after.canonicalHead.head_id ?? null),
        headDuringOutage && headDuringOutage !== (after.canonicalHead.head_id ?? null)
          ? `the head reported to the caller during the outage was ${headDuringOutage}; the surviving head is ${after.canonicalHead.head_id ?? 'null'}. Two heads existed.`
          : `head is ${after.canonicalHead.head_id ?? 'null'} and no divergent head was reported`);
    },
  },
  {
    id: '13-substitute-store-cannot-become-the-institution',
    title: 'the canonical store is missing and a startup tries to proceed anyway',
    async run(ws) {
      ws.run({ requestId: 'req-1', body: { n: 1 } });
      const expect = ws.anchor;
      ws.detachCanonical();

      // A startup that names the institution it expects is an OPEN. It refuses
      // the empty substitute instead of bootstrapping into it.
      const opened = ws.run({ requestId: 'req-2', body: { n: 2 }, expect });
      // And it cannot fall back to founding one, because a handle that expects
      // an institution is not authorized to create one.
      const attemptedGenesis = ws.run({ init: true, expect });

      const forkHead = opened.result?.head?.head_id ?? null;
      ws.reattachCanonical();
      const after = await ws.inspect();
      const survived = after.canonicalActs.some((act) => act.request_id === 'req-2');

      record(ws.shape, this.id, 'ADMITTED_IMPLIES_DURABLE',
        !(opened.callerSaw === 'ADMITTED' && !survived),
        opened.callerSaw === 'ADMITTED' && !survived
          ? `the substitute store accepted an admission; that act does not exist once the real store is restored`
          : `OPEN against the substitute saw ${opened.callerSaw}; genesis on that handle saw ${attemptedGenesis.callerSaw}`);
      record(ws.shape, this.id, 'UNAMBIGUOUS_RECOVERY',
        opened.callerSaw === 'REFUSED_WRONG_INSTITUTION'
        && attemptedGenesis.callerSaw === 'REFUSED_GENESIS_ON_AN_OPEN_HANDLE',
        `empty substitute store refused OPEN (${opened.result?.reason ?? 'n/a'}) and refused genesis on the same handle`);
      record(ws.shape, this.id, 'HEAD_CORRECTNESS',
        forkHead === null || forkHead === (after.canonicalHead.head_id ?? null),
        forkHead && forkHead !== (after.canonicalHead.head_id ?? null)
          ? `two institutions existed with different heads: ${forkHead} and ${after.canonicalHead.head_id ?? 'null'}`
          : `head is ${after.canonicalHead.head_id ?? 'null'}; no fork occurred`);
    },
  },
  {
    id: '14-foreign-institution-in-the-expected-location',
    title: 'a different institution occupies the expected store location',
    async run(ws) {
      ws.run({ requestId: 'req-1', body: { n: 1 } });
      const ours = ws.anchor;

      // The store is replaced by a real, healthy, initialized institution that
      // simply is not ours. Being non-empty is not being the right one.
      ws.detachCanonical();
      const foreign = ws.run({ init: true });
      const opened = ws.run({ requestId: 'req-2', body: { n: 2 }, expect: ours });
      ws.reattachCanonical();
      const after = await ws.inspect();

      record(ws.shape, this.id, 'ADMITTED_IMPLIES_DURABLE',
        opened.callerSaw === 'REFUSED_WRONG_INSTITUTION',
        `the substitute held institution ${foreign.result?.anchor?.institution_ref ?? 'unknown'}; OPEN saw ${opened.callerSaw} (${opened.result?.reason ?? 'n/a'})`);
      record(ws.shape, this.id, 'UNAMBIGUOUS_RECOVERY',
        after.canonicalActs.length === 1,
        `the real institution is untouched: ${after.canonicalActs.length} act(s)`);
    },
  },
];

const shapes = [
  { id: 'A', name: 'embedded canonical (SQLite) + PostgreSQL projection via outbox' },
  { id: 'B', name: 'PostgreSQL canonical + embedded projection' },
];

for (const shape of shapes) {
  for (const scenario of scenarios) {
    const ws = new Workspace(shape.id);
    try {
      ws.init();
      await scenario.run(ws);
    } catch (error) {
      record(shape.id, scenario.id, 'ADMITTED_IMPLIES_DURABLE', false, `harness error: ${String(error?.message ?? error)}`);
    } finally {
      ws.cleanup();
    }
  }
}

// Negative control on the harness itself.
//
// A harness that only ever reports HELD proves nothing about the shapes; it may
// simply be unable to see a violation. So a third, deliberately forbidden shape
// is run: it answers the caller ADMITTED before the canonical commit returns.
// The harness must report that shape as VIOLATED. If it does not, every other
// verdict in this report is worthless.
const controlFindings = [];
{
  const control = new Workspace('A', { ackBeforeCommit: true });
  try {
    control.init();
    const call = control.run({ requestId: 'req-1', body: { n: 1 }, killAt: 'before-commit' });
    const state = await control.inspect();
    const detected = call.callerSaw === 'ADMITTED' && state.canonicalActs.length === 0;
    controlFindings.push({
      shape: 'CONTROL-FORBIDDEN',
      scenario: '01-kill-before-canonical-commit',
      invariant: 'ADMITTED_IMPLIES_DURABLE',
      verdict: detected ? 'VIOLATED' : 'HELD',
      detail: `caller saw ${call.callerSaw ?? 'nothing'}; canonical holds ${state.canonicalActs.length} act(s)`,
      cost: null,
    });
    controlFindings.push({
      shape: 'CONTROL-FORBIDDEN',
      scenario: 'harness-self-check',
      invariant: 'HARNESS_CAN_DETECT_A_VIOLATION',
      verdict: detected ? 'HELD' : 'VIOLATED',
      detail: detected
        ? 'the harness reported the forbidden premature-acknowledgement shape as violating the invariant, so a HELD verdict elsewhere means something'
        : 'the harness FAILED to detect a known violation; every other verdict in this report is unreliable',
      cost: null,
    });
  } finally {
    control.cleanup();
  }
}

// Second negative control: reproduce the original fork.
//
// Scenario 13 passes because the store now refuses. That is only meaningful if
// the harness can still *see* the fork when the refusal is removed. So the
// original unguarded startup — one that opens whatever is present and
// bootstraps if it finds nothing — is run against the same failure, and must
// still produce two institutions.
{
  const legacy = new Workspace('A');
  try {
    legacy.init();
    legacy.run({ requestId: 'req-1', body: { n: 1 } });
    legacy.detachCanonical();
    const bootstrapped = legacy.run({ init: true });            // no expectation stated
    const admitted = legacy.run({ requestId: 'req-2', body: { n: 2 } });
    const forkHead = admitted.result?.head?.head_id ?? null;
    legacy.reattachCanonical();
    const after = await legacy.inspect();
    const survived = after.canonicalActs.some((act) => act.request_id === 'req-2');
    const forked = bootstrapped.callerSaw === 'INITIALIZED'
      && admitted.callerSaw === 'ADMITTED'
      && !survived;
    controlFindings.push({
      shape: 'CONTROL-LEGACY-STARTUP',
      scenario: '13-substitute-store-cannot-become-the-institution',
      invariant: 'ADMITTED_IMPLIES_DURABLE',
      verdict: forked ? 'VIOLATED' : 'HELD',
      detail: forked
        ? `an unguarded startup bootstrapped the substitute store and admitted into it; head ${forkHead} never existed in the real institution, whose head is ${after.canonicalHead.head_id ?? 'null'}`
        : `an unguarded startup saw bootstrap ${bootstrapped.callerSaw} and admission ${admitted.callerSaw}; no fork was reproduced`,
      cost: null,
    });
    controlFindings.push({
      shape: 'CONTROL-LEGACY-STARTUP',
      scenario: 'harness-self-check',
      invariant: 'HARNESS_STILL_REPRODUCES_THE_ORIGINAL_FORK',
      verdict: forked ? 'HELD' : 'VIOLATED',
      detail: forked
        ? 'removing the stated expectation still forks the institution, so scenario 13 passing is the refusal working rather than the harness losing the ability to see it'
        : 'the harness could NOT reproduce the original fork even with the expectation removed; scenario 13 proves nothing',
      cost: null,
    });
  } finally {
    legacy.cleanup();
  }
}

const perShape = Object.fromEntries(shapes.map((shape) => {
  const own = findings.filter((f) => f.shape === shape.id);
  return [shape.id, {
    name: shape.name,
    checks: own.length,
    held: own.filter((f) => f.verdict === 'HELD').length,
    violated: own.filter((f) => f.verdict === 'VIOLATED').length,
    not_exercised: own.filter((f) => f.verdict === 'NOT_EXERCISED').length,
    costs: own.filter((f) => f.cost).map((f) => ({ scenario: f.scenario, invariant: f.invariant, cost: f.cost })),
  }];
}));

// Which findings actually separate the two candidate shapes? If none do, the
// invariant set is not sufficient to decide, and saying so is the result.
const keys = [...new Set(findings.map((f) => `${f.scenario}::${f.invariant}`))];
const discriminating = keys
  .map((key) => {
    const [scenario, invariant] = key.split('::');
    const a = findings.find((f) => f.shape === 'A' && f.scenario === scenario && f.invariant === invariant);
    const b = findings.find((f) => f.shape === 'B' && f.scenario === scenario && f.invariant === invariant);
    return { scenario, invariant, a: a?.verdict ?? null, b: b?.verdict ?? null };
  })
  .filter((row) => row.a !== row.b);

const report = {
  kind: 'powerfarm.process.canonical-commit-experiment.v1',
  adr: 'process/continuum/docs/adr/0014-canonical-commit-is-decided-by-falsification.md',
  generated_at: new Date().toISOString(),
  node_version: process.version,
  invariant: 'ADMITTED => a canonical durable commit exists',
  invariants: INVARIANTS,
  cross_checked_against_the_real_kernel: [
    'The refusal that scenario 12 depends on was verified against the real Continuum kernel, not only against this model: opening a Kernel on a missing store creates the file, and `append` then fails closed with InstitutionalError "Institution is not initialized".',
    'The fork that scenario 13 originally reported was verified against the real kernel before it was fixed: `Kernel.init()` on a substitute store succeeded and produced a second institution. It is now closed in the kernel by the CREATE / OPEN / RESTORE split, with negative controls in process/continuum/tests/test_institution_identity.py, and the scenarios here prove the same design holds for both candidate commit shapes.',
  ],
  fidelity_limits: [
    'Both engines are embedded and single-connection. Real multi-connection contention — cross-session row locks, serialization failures, pool behaviour — is NOT exercised. Scenario 07 tests application-level CAS only.',
    'A crash is a self-inflicted SIGKILL in a dedicated child process. Nothing is caught, flushed or unwound, so the crash is faithful; the storage layer beneath it is still a local filesystem, not a networked volume.',
    'Network partition between Process and a remote canonical store is NOT modelled. That failure mode is specific to Shape B and must be tested against a hosted PostgreSQL before this ADR is promoted.',
    'This harness models admission commit semantics only. Authority, Occupancy, signatures and bitemporality are deliberately absent.',
  ],
  shapes: perShape,
  harness_negative_control: {
    purpose: 'prove the harness can report VIOLATED. Two controls: a forbidden shape that answers ADMITTED before the canonical commit returns, and an unguarded startup that still reproduces the original substitute-store fork once the stated expectation is removed.',
    findings: controlFindings,
    harness_is_trustworthy: controlFindings.every((f) => !f.invariant.startsWith('HARNESS_') || f.verdict === 'HELD'),
  },
  discrimination: {
    question: 'does the failure schedule separate Shape A from Shape B?',
    discriminating_findings: discriminating,
    separated: discriminating.length > 0,
    note: discriminating.length > 0
      ? 'the schedule separates the shapes; see discriminating_findings'
      : 'the schedule does NOT separate the shapes. Both preserve every invariant under every scenario that this harness can reach. The invariant set is therefore not sufficient on its own to decide, and the decision must rest on the architectural costs recorded per shape and on the failure modes listed under fidelity_limits, which this harness cannot reach.',
    shape_independent_requirements_discovered: [
      'Refusing to admit into an uninitialized store is load-bearing, not hygiene. The real Continuum kernel already does this — opening a missing store creates the file, but append fails closed with "Institution is not initialized" — and scenario 12 depends entirely on that refusal. Any candidate shape must preserve it; a store driver that admits on open turns a lost disk into a silent second institution.',
      'Bootstrap WAS the residual fork hazard, and the fix is shape-independent. Startup must name the institution it expects; an empty or foreign store then produces a refusal instead of a second institution, and the same handle cannot fall back to genesis. Scenarios 13 and 14 hold identically for both shapes, and the CONTROL-LEGACY-STARTUP finding shows the fork still reproduces the moment the stated expectation is removed — so the scenarios pass because the refusal works, not because the harness stopped seeing it. Implemented in the kernel as Kernel.create_institution / open_institution / restore_institution.',
    ],
    known_asymmetries_not_measurable_here: [
      'Shape B places a network between Process and its canonical commit. Every admission then depends on remote availability, and scenario 12 shows the institution admits nothing while the canonical store is unreachable — for Shape B that is a network outage, for Shape A it is local disk loss, which is already correlated with the process dying.',
      'Shape A is single-writer by construction, so multi-writer contention cannot arise. Shape B must define and test it against a hosted server.',
      'Shape B needs a dedicated transactional admission principal, transport authentication that establishes rather than accepts the caller, and a request digest recomputed at the trusted boundary. Shape A needs none of those to hold the invariants, but also cannot serve more than one writer.',
    ],
  },
  findings,
  conclusion: 'PENDING — see ADR 0014 promotion criteria. This report is evidence for the decision, not the decision.',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const selfChecks = controlFindings.filter((f) => f.invariant.startsWith('HARNESS_'));
const selfCheck = selfChecks.every((f) => f.verdict === 'HELD') ? { verdict: 'HELD' } : { verdict: 'VIOLATED' };
for (const check of selfChecks) {
  console.log(`harness self-check · ${check.invariant}: ${check.verdict === 'HELD' ? 'ok' : 'FAILED'}`);
}
const violations = findings.filter((f) => f.verdict === 'VIOLATED');
for (const shape of shapes) {
  const own = perShape[shape.id];
  console.log(`Shape ${shape.id}: ${own.held} held, ${own.violated} violated, ${own.not_exercised} not exercised — ${shape.name}`);
}
for (const violation of violations) {
  console.log(`  VIOLATED  ${violation.shape} · ${violation.scenario} · ${violation.invariant}: ${violation.detail}`);
}
console.log(discriminating.length > 0
  ? `discrimination: ${discriminating.length} finding(s) separate the two shapes`
  : 'discrimination: no finding separates the two shapes; the invariant set alone does not decide');
console.log(`report: ${path.relative(root, reportPath)}`);
process.exitCode = (violations.length > 0 || selfCheck?.verdict !== 'HELD') ? 1 : 0;
