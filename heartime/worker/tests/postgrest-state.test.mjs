import test from 'node:test';
import assert from 'node:assert/strict';
import { CYCLE_CONTRACT, PostgrestHeartimeState } from '../src/postgrest-state.mjs';

const INSTITUTION_REF = `inst_${'1'.repeat(32)}`;

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

function client(replies, tokenProvider = null, reconcilerRef = 'pf.reconciler.attention') {
  const calls = [];
  const tokens = tokenProvider ?? {
    invalidated: 0,
    async getToken({ forceRefresh = false } = {}) { return forceRefresh ? 'refreshed-token' : 'institutional-token'; },
    invalidate() { this.invalidated += 1; },
  };
  const state = new PostgrestHeartimeState({
    baseUrl: 'https://example.supabase.co/',
    publishableKey: 'sb_publishable_test',
    tokenProvider: tokens,
    reconcilerRef,
    expectedInstitutionRef: INSTITUTION_REF,
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const reply = replies.shift();
      return response(reply.body, reply.status ?? 200);
    },
  });
  return { state, calls, tokens };
}

test('custom Heartime schema is selected and runtime identity token is explicit', async () => {
  const { state, calls } = client([{ body: '2026-08-23T13:00:00.000Z' }]);
  const next = await state.nextWake({ now: '2026-08-23T12:00:00.000Z' });
  assert.equal(next, '2026-08-23T13:00:00.000Z');
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/next_reconciliation_wake_v1');
  assert.equal(calls[0].init.headers['content-profile'], 'heartime');
  assert.equal(calls[0].init.headers['accept-profile'], 'heartime');
  assert.equal(calls[0].init.headers.authorization, 'Bearer institutional-token');
  assert.equal(calls[0].init.headers.apikey, 'sb_publishable_test');
  assert.equal(calls[0].body.p_reconciler_ref, 'pf.reconciler.attention');
});


test('one permanent Heartime setting can be configured for the sedimentation reconciler', async () => {
  const { state, calls } = client(
    [{ body: '2026-08-24T01:00:00.000Z' }],
    null,
    'pf.reconciler.sedimentation',
  );
  await state.nextWake({ now: '2026-08-24T00:00:00.000Z' });
  assert.equal(calls[0].body.p_reconciler_ref, 'pf.reconciler.sedimentation');
});

test('prepare, finish and defer use the permanent cycle contract', async () => {
  const envelope = { contract_version: CYCLE_CONTRACT, beats: [], next_wake: null };
  const { state, calls } = client([
    { body: envelope },
    { body: { contract_version: CYCLE_CONTRACT, next_wake: null } },
    { body: { contract_version: CYCLE_CONTRACT, next_wake: '2026-08-23T12:01:00.000Z' } },
  ]);

  await state.prepareCycle({ now: '2026-08-23T12:00:00.000Z' });
  await state.finishCycle({ now: '2026-08-23T12:00:01.000Z', beat_refs: [], summaries: [] });
  await state.deferFailure({
    now: '2026-08-23T12:00:02.000Z',
    beat_refs: ['pf.beat.7'],
    retry_count: 2,
    error: 'Cards unavailable',
  });

  assert.match(calls[0].url, /prepare_cycle_v1$/);
  assert.equal(calls[0].body.p_reconciler_ref, 'pf.reconciler.attention');
  assert.deepEqual(calls[1].body.p_summaries, []);
  assert.deepEqual(calls[2].body.p_beat_refs, ['pf.beat.7']);
  assert.equal(calls[2].body.p_retry_count, 2);
});

test('operational trace is persisted through the Heartime schema without Card bodies', async () => {
  const { state, calls } = client([{ body: { accepted: true } }]);
  await state.recordTrace({
    trace_ref: 'pf.trace.card.market',
    event_name: 'heartime.beat.dispatch',
    observed_at: '2026-08-30T07:40:00.000Z',
    card_ref: 'pf.card.market',
    beat_ref: 'pf.beat.7',
    attempt_ref: 'pf.attempt.market',
    attributes: { reconciler_ref: 'pf.reconciler.attention' },
  });
  assert.match(calls[0].url, /record_trace_event_v1$/);
  assert.equal(calls[0].body.p_trace_ref, 'pf.trace.card.market');
  assert.equal(calls[0].body.p_component_ref, 'pf.runtime.heartime');
  assert.equal(calls[0].body.p_card_ref, 'pf.card.market');
  assert.equal('card_body' in calls[0].body, false);
});

test('401 invalidates runtime token and retries once with a fresh token', async () => {
  const { state, calls, tokens } = client([
    { body: { message: 'expired' }, status: 401 },
    { body: '2026-08-23T13:00:00.000Z' },
  ]);
  const next = await state.nextWake({ now: '2026-08-23T12:00:00.000Z' });
  assert.equal(next, '2026-08-23T13:00:00.000Z');
  assert.equal(tokens.invalidated, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.authorization, 'Bearer institutional-token');
  assert.equal(calls[1].init.headers.authorization, 'Bearer refreshed-token');
});

test('contract mismatch and HTTP failure fail closed', async () => {
  const mismatch = client([{ body: { contract_version: 'wrong' } }]).state;
  await assert.rejects(() => mismatch.prepareCycle({ now: '2026-08-23T12:00:00.000Z' }), /contract mismatch/);

  const failed = client([{ body: { message: 'forbidden' }, status: 403 }]).state;
  await assert.rejects(() => failed.nextWake({ now: '2026-08-23T12:00:00.000Z' }), /failed \(403\)/);
});

test('missing project credentials and token provider are rejected before network access', () => {
  const tokenProvider = { getToken: async () => 'token' };
  assert.throws(() => new PostgrestHeartimeState({ baseUrl: '', publishableKey: 'x', tokenProvider, expectedInstitutionRef: INSTITUTION_REF }), /SUPABASE_URL/);
  assert.throws(() => new PostgrestHeartimeState({ baseUrl: 'https://x', publishableKey: '', tokenProvider, expectedInstitutionRef: INSTITUTION_REF }), /SUPABASE_PUBLISHABLE_KEY/);
  assert.throws(() => new PostgrestHeartimeState({ baseUrl: 'https://x', publishableKey: 'a', expectedInstitutionRef: INSTITUTION_REF }), /tokenProvider/);
});


test('production PostgREST URL requires HTTPS and local HTTP needs explicit opt-in', () => {
  const tokenProvider = { getToken: async () => 'token' };
  assert.throws(() => new PostgrestHeartimeState({
    baseUrl: 'http://example.com',
    publishableKey: 'x',
    tokenProvider,
    expectedInstitutionRef: INSTITUTION_REF,
  }), /must use HTTPS/);
  assert.doesNotThrow(() => new PostgrestHeartimeState({
    baseUrl: 'http://localhost:54321',
    publishableKey: 'x',
    tokenProvider,
    allowInsecure: true,
    expectedInstitutionRef: INSTITUTION_REF,
  }));
  assert.throws(() => new PostgrestHeartimeState({
    baseUrl: 'https://example.com',
    publishableKey: 'x',
    tokenProvider,
    requestTimeoutMs: 10,
  }), /requestTimeoutMs/);
});

// --- which institution is this Heartime serving? ---------------------------
//
//   Genesis creates an institution. Recovery must never create one.
//
// Heartime carried no institutional identity at all, so a worker pointed at the
// wrong database had nothing to check and would have beaten on someone else's
// circulation without noticing.

const ANCHOR_DIGEST = 'c'.repeat(64);

function institutionState({ replies, expectedInstitutionRef = INSTITUTION_REF, expectedAnchorDigest = ANCHOR_DIGEST }) {
  const calls = [];
  const state = new PostgrestHeartimeState({
    baseUrl: 'https://example.supabase.co/',
    publishableKey: 'sb_publishable_test',
    tokenProvider: { getToken: async () => 'token' },
    expectedInstitutionRef,
    expectedAnchorDigest,
    fetchImpl: async (url, init) => {
      calls.push({ rpc: String(url).split('/rpc/')[1], body: JSON.parse(init.body) });
      const reply = replies.shift();
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return { state, calls };
}

test('Heartime refuses to start without a declared institution', () => {
  const tokenProvider = { getToken: async () => 'token' };
  assert.throws(
    () => new PostgrestHeartimeState({
      baseUrl: 'https://example.supabase.co/',
      publishableKey: 'x',
      tokenProvider,
    }),
    /HEARTIME_EXPECTED_INSTITUTION is required/,
  );
});

test('Heartime asserts its institution and carries the exact anchor to the database', async () => {
  const { state, calls } = institutionState({
    replies: [{
      body: {
        contract_version: 'powerfarm.heartime.institution-assert.v1',
        data: { institution_ref: INSTITUTION_REF, genesis_ref: `evt_${'2'.repeat(32)}`, anchor_digest: ANCHOR_DIGEST, protocol_version: 'powerfarm-continuum/v3' },
      },
    }],
  });
  const served = await state.assertInstitution();
  assert.equal(served.institution_ref, INSTITUTION_REF);
  assert.equal(calls[0].rpc, 'assert_institution_v1');
  assert.deepEqual(calls[0].body, { p_institution_ref: INSTITUTION_REF, p_anchor_digest: ANCHOR_DIGEST });

  // Memoized: the answer cannot change without a new deployment.
  await state.assertInstitution();
  assert.equal(calls.length, 1);
});

test('an undeclared Heartime database refuses the worker', async () => {
  const { state } = institutionState({
    replies: [{ status: 400, body: { message: 'heartime_institution_undeclared: this database serves no institution' } }],
  });
  await assert.rejects(() => state.assertInstitution(), /heartime_institution_undeclared/);
});

test('a Heartime database serving another institution refuses the worker', async () => {
  const { state } = institutionState({
    replies: [{ status: 400, body: { message: 'heartime_institution_mismatch: this database serves inst_other' } }],
  });
  await assert.rejects(() => state.assertInstitution(), /heartime_institution_mismatch/);
});

test('a database answering with a different institution is refused by the worker itself', async () => {
  const { state } = institutionState({
    replies: [{
      body: {
        contract_version: 'powerfarm.heartime.institution-assert.v1',
        data: { institution_ref: `inst_${'9'.repeat(32)}`, anchor_digest: ANCHOR_DIGEST },
      },
    }],
  });
  await assert.rejects(() => state.assertInstitution(), /returned a different institution/);
});

test('no cycle work happens before the institution is established', async () => {
  const { state, calls } = institutionState({
    replies: [{ status: 400, body: { message: 'heartime_institution_mismatch' } }],
  });
  const { runHeartimeAlarm } = await import('../src/alarm-core.mjs');
  const store = new Map();
  const storage = {
    async get(key) { return store.get(key); },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
    async setAlarm(value) { store.set('alarm', value); },
    async getAlarm() { return store.get('alarm') ?? null; },
    async deleteAlarm() { store.delete('alarm'); },
  };
  await assert.rejects(
    () => runHeartimeAlarm({ stateApi: state, reconcilerFor: () => { throw new Error('must not reconcile'); }, storage }),
    /heartime_institution_mismatch/,
  );
  assert.deepEqual(calls.map((c) => c.rpc), ['assert_institution_v1'], 'the cycle never reached prepare_cycle_v1');
});
