import test from 'node:test';
import assert from 'node:assert/strict';
import { HEARTIME_CYCLE_VERSION } from '../../../circulation/lib/contract.mjs';
import { validateReconciliationSummary } from '../../../circulation/attention/lib/contract.mjs';
import {
  armFromCanonicalState,
  runHeartimeAlarm,
  validateBeatHint,
  validateReconcilerResult,
} from '../src/alarm-core.mjs';

const INSTITUTION_REF = `inst_${'1'.repeat(32)}`;

const storage = () => ({
  alarm: null,
  values: new Map(),
  async setAlarm(value) { this.alarm = value; },
  async deleteAlarm() { this.alarm = null; },
  async get(key) { return this.values.get(key); },
  async put(key, value) { this.values.set(key, value); },
  async delete(key) { this.values.delete(key); },
});

const cycle = (overrides = {}) => ({
  contract_version: HEARTIME_CYCLE_VERSION,
  beats: [],
  next_wake: null,
  ...overrides,
});

const reconciliationSummary = (overrides = {}) => ({
  state: 'reconciled',
  scope: 'pf.office.research',
  beat_ref: 'pf.beat.1',
  recipient_ref: 'pf.occupancy.research',
  observed_at: '2026-08-23T12:00:00.000Z',
  wake_pack_ref: 'pf.wakepack.1',
  wake_pack_card_count: 1,
  returned: [],
  returned_count: 0,
  observations: [{ card_ref: 'pf.card.market-change', generation: 1, state: 'running' }],
  observation_count: 1,
  ...overrides,
});

test('wake hint contains identity only, never Card payload', () => {
  assert.equal(validateBeatHint({ ref: 'pf.beat.1', reconciler_ref: 'pf.reconciler.attention' }).ref, 'pf.beat.1');
  assert.throws(() => validateBeatHint({ ref: 'pf.beat.1', reconciler_ref: 'pf.reconciler.attention', card_body: {} }), /must not carry/);
  assert.throws(() => validateBeatHint({ ref: 'pf.beat.1', reconciler_ref: 'pf.reconciler.attention', metadata: { payload: {} } }), /must not carry/);
});

test('reconciler result returned to Heartime is compact summary, not body transport', () => {
  const summary = reconciliationSummary();
  assert.equal(validateReconcilerResult(summary, validateReconciliationSummary), summary);
  assert.throws(() => validateReconcilerResult({ ...summary, wake_pack: { cards: [] } }, validateReconciliationSummary), /forbidden field/);
  assert.throws(() => validateReconcilerResult({ ...summary, response: { value: 1 } }, validateReconciliationSummary), /forbidden field/);
  assert.throws(() => validateReconcilerResult({ ...summary, reason: { nested: { cards: [] } } }, validateReconciliationSummary), /forbidden field/);
  assert.throws(() => validateReconcilerResult({ ...summary, state: 'surprising' }, validateReconciliationSummary), /invalid reconciliation state/);
});

test('alarm invokes reconciler from canonical cycle and arms the next wake', async () => {
  const store = storage();
  const calls = [];
  const stateApi = {
    assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }),
    prepareCycle: async () => cycle({
      beats: [{ ref: 'pf.beat.1', reconciler_ref: 'pf.reconciler.attention', reason: 'overdue', resource_hint: 'pf.office.research' }],
      next_wake: '2026-08-23T12:15:00.000Z',
    }),
    finishCycle: async () => cycle({ next_wake: '2026-08-23T12:15:00.000Z' }),
    deferFailure: async () => { throw new Error('not expected'); },
    nextWake: async () => '2026-08-23T12:15:00.000Z',
  };
  const reconciler = {
    reconcile: async (hint) => {
      calls.push(hint);
      return reconciliationSummary({ beat_ref: hint.beat_ref });
    },
  };
  const result = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({ ...reconciler, validateSummary: validateReconciliationSummary }),
    storage: store,
    now: new Date('2026-08-23T12:00:00Z'),
  });
  assert.equal(result.status, 'ok');
  assert.equal(calls[0].resource_hint, 'pf.office.research');
  assert.equal('card' in calls[0], false);
  assert.equal('wake_pack' in result.summaries[0], false);
  assert.equal(store.alarm, Date.parse('2026-08-23T12:15:00.000Z'));
});

test('alarm persists compact operational trace without making trace storage a liveness dependency', async () => {
  const store = storage();
  const traces = [];
  const stateApi = {
    assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }),
    prepareCycle: async () => cycle({ beats: [{ ref: 'pf.beat.trace', reconciler_ref: 'pf.reconciler.attention', trace_ref: 'pf.trace.beat.trace' }] }),
    finishCycle: async () => cycle(),
    deferFailure: async () => cycle(),
    nextWake: async () => null,
    recordTrace: async (event) => { traces.push(event); },
  };
  const result = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({ reconcile: async () => reconciliationSummary({ beat_ref: 'pf.beat.trace' }), validateSummary: validateReconciliationSummary }),
    storage: store,
    now: new Date('2026-08-30T07:40:00Z'),
  });
  assert.equal(result.status, 'ok');
  assert.deepEqual(traces.map((row) => row.event_name), ['heartime.beat.dispatch', 'heartime.beat.reconciled']);
  assert.equal(traces[0].trace_ref, 'pf.trace.beat.trace');
  assert.equal('card_body' in traces[0], false);

  stateApi.recordTrace = async () => { throw new Error('trace store down'); };
  const stillLive = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({ reconcile: async () => reconciliationSummary({ beat_ref: 'pf.beat.trace' }), validateSummary: validateReconciliationSummary }),
    storage: store,
    now: new Date('2026-08-30T07:41:00Z'),
  });
  assert.equal(stillLive.status, 'ok');
});

test('physical clock is re-armed before an organ boundary is crossed', async () => {
  const events = [];
  const store = {
    values: new Map(),
    async setAlarm(value) { events.push(['alarm', value]); },
    async deleteAlarm() { events.push(['delete']); },
    async get(key) { return this.values.get(key); },
    async put(key, value) { this.values.set(key, value); },
    async delete(key) { this.values.delete(key); },
  };
  const stateApi = {
    assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }),
    prepareCycle: async () => cycle({
      beats: [{ ref: 'pf.beat.1', reconciler_ref: 'pf.reconciler.attention' }],
      next_wake: '2026-08-23T12:00:01.000Z',
    }),
    finishCycle: async () => cycle({ next_wake: '2026-08-23T12:15:00.000Z' }),
    deferFailure: async () => { throw new Error('not expected'); },
    nextWake: async () => '2026-08-23T12:15:00.000Z',
  };
  const reconciler = {
    async reconcile() {
      events.push(['reconcile']);
      return reconciliationSummary();
    },
  };

  await runHeartimeAlarm({ stateApi, reconcilerFor: () => ({ ...reconciler, validateSummary: validateReconciliationSummary }), storage: store, now: new Date('2026-08-23T12:00:00Z') });
  assert.equal(events[0][0], 'alarm');
  assert.equal(events[1][0], 'reconcile');
  assert.deepEqual(events.at(-1), ['alarm', Date.parse('2026-08-23T12:15:00.000Z')]);
});

test('downstream failure is durably deferred with exact BeatRef and alarm is re-armed', async () => {
  const store = storage();
  const deferred = [];
  const stateApi = {
    assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }),
    prepareCycle: async () => cycle({ beats: [{ ref: 'pf.beat.1', reconciler_ref: 'pf.reconciler.attention' }] }),
    finishCycle: async () => cycle(),
    deferFailure: async (input) => {
      deferred.push(input);
      return cycle({ next_wake: '2026-08-23T12:01:00.000Z' });
    },
    nextWake: async () => '2026-08-23T12:01:00.000Z',
  };
  const reconciler = { reconcile: async () => { throw new Error('Cards unavailable'); } };
  const result = await runHeartimeAlarm({ stateApi, reconcilerFor: () => ({ ...reconciler, validateSummary: validateReconciliationSummary }), storage: store, now: new Date('2026-08-23T12:00:00Z') });
  assert.equal(result.status, 'deferred');
  assert.deepEqual(deferred[0].beat_refs, ['pf.beat.1']);
  assert.equal(store.alarm, Date.parse('2026-08-23T12:01:00.000Z'));
});

test('completed beats remain committed when a later beat fails', async () => {
  const store = storage();
  const finished = [];
  const deferred = [];
  const stateApi = {
    assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }),
    prepareCycle: async () => cycle({ beats: [
      { ref: 'pf.beat.1', reconciler_ref: 'pf.reconciler.attention', resource_hint: 'pf.office.research' },
      { ref: 'pf.beat.2', reconciler_ref: 'pf.reconciler.attention', resource_hint: 'pf.office.finance' },
    ] }),
    finishCycle: async (input) => {
      finished.push(input.beat_refs[0]);
      return cycle({ next_wake: '2026-08-23T12:30:00.000Z' });
    },
    deferFailure: async (input) => {
      deferred.push(input.beat_refs[0]);
      return cycle({ next_wake: '2026-08-23T12:01:00.000Z' });
    },
    nextWake: async () => '2026-08-23T12:01:00.000Z',
  };
  const result = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({
      validateSummary: validateReconciliationSummary,
      reconcile: async (hint) => {
        if (hint.beat_ref === 'pf.beat.2') throw new Error('second boundary unavailable');
        return reconciliationSummary({ beat_ref: hint.beat_ref, scope: hint.resource_hint });
      },
    }),
    storage: store,
    now: new Date('2026-08-23T12:00:00Z'),
  });
  assert.equal(result.status, 'partial');
  assert.deepEqual(finished, ['pf.beat.1']);
  assert.deepEqual(deferred, ['pf.beat.2']);
  assert.equal(result.completed_count, 1);
  assert.equal(result.failed_count, 1);
});

test('finish failure leaves beat open and schedules provider-local look-again energy', async () => {
  const store = storage();
  const stateApi = {
    assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }),
    prepareCycle: async () => cycle({ beats: [{ ref: 'pf.beat.1', reconciler_ref: 'pf.reconciler.attention' }] }),
    finishCycle: async () => { throw new Error('Postgres commit unavailable'); },
    deferFailure: async () => cycle(),
    nextWake: async () => null,
  };
  const result = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({ reconcile: async () => reconciliationSummary(), validateSummary: validateReconciliationSummary }),
    storage: store,
    now: new Date('2026-08-23T12:00:00Z'),
  });
  assert.equal(result.status, 'provider_fallback');
  assert.equal(result.stage, 'finish_cycle');
  assert.equal(result.completed_count, 0);
  assert.equal(store.alarm, Date.parse('2026-08-23T12:00:05.000Z'));
});

test('canonical state outage leaves payload-free provider fallback and compounds locally', async () => {
  const store = storage();
  const stateApi = {
    assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }),
    prepareCycle: async () => { throw new Error('Postgres unavailable'); },
    finishCycle: async () => { throw new Error('not reached'); },
    deferFailure: async () => { throw new Error('not reached'); },
    nextWake: async () => { throw new Error('not reached'); },
  };
  const first = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({ reconcile: async () => { throw new Error('not reached'); }, validateSummary: validateReconciliationSummary }),
    storage: store,
    now: new Date('2026-08-23T12:00:00Z'),
    alarmInfo: { retryCount: 2, isRetry: true },
  });
  assert.equal(first.status, 'provider_fallback');
  assert.equal(store.alarm, Date.parse('2026-08-23T12:00:20.000Z'));
  assert.equal('card' in first, false);
  assert.equal('payload' in first, false);

  const second = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({ reconcile: async () => { throw new Error('not reached'); }, validateSummary: validateReconciliationSummary }),
    storage: store,
    now: new Date('2026-08-23T12:00:20Z'),
    alarmInfo: { retryCount: 0, isRetry: false },
  });
  assert.equal(second.provider_retry_count, 4);
  assert.equal(store.alarm, Date.parse('2026-08-23T12:01:00.000Z'));
});

test('successful pass clears provider-local outage counter', async () => {
  const store = storage();
  store.values.set('heartime:provider-fallback-count', 4);
  const stateApi = {
    assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }),
    prepareCycle: async () => cycle(),
    finishCycle: async () => cycle(),
    deferFailure: async () => cycle(),
    nextWake: async () => null,
  };
  const result = await runHeartimeAlarm({ stateApi, reconcilerFor: () => ({}), storage: store });
  assert.equal(result.status, 'ok');
  assert.equal(store.values.has('heartime:provider-fallback-count'), false);
});

test('scheduler storage can evaporate and alarm is reconstructed from canonical state', async () => {
  const store = storage();
  const stateApi = { assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }), nextWake: async () => '2026-08-23T13:00:00.000Z' };
  const armed = await armFromCanonicalState({ stateApi, storage: store, now: new Date('2026-08-23T12:00:00Z') });
  assert.equal(armed, Date.parse('2026-08-23T13:00:00.000Z'));
  assert.equal(store.alarm, armed);
});

test('a due-now canonical deadline is lowered to a future provider alarm', async () => {
  const store = storage();
  const armed = await armFromCanonicalState({
    stateApi: { assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }), nextWake: async () => '2026-08-23T12:00:00.000Z' },
    storage: store,
    now: new Date('2026-08-23T12:00:00.000Z'),
  });
  assert.equal(armed, Date.parse('2026-08-23T12:00:01.000Z'));
});

test('invalid next wake fails closed rather than arming a corrupt timer', async () => {
  const store = storage();
  await assert.rejects(() => armFromCanonicalState({
    stateApi: { assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }), nextWake: async () => 'not-a-time' },
    storage: store,
  }), /invalid next wake/);
});

test('cycle contract mismatch is treated as canonical-state outage, not accepted state', async () => {
  const store = storage();
  const stateApi = {
    assertInstitution: async () => ({ institution_ref: INSTITUTION_REF }),
    prepareCycle: async () => ({ contract_version: 'wrong', beats: [], next_wake: null }),
    finishCycle: async () => cycle(),
    deferFailure: async () => cycle(),
    nextWake: async () => null,
  };
  const result = await runHeartimeAlarm({ stateApi, reconcilerFor: () => ({}), storage: store });
  assert.equal(result.status, 'provider_fallback');
  assert.match(result.error, /contract mismatch/);
});
