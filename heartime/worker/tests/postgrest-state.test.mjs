import test from 'node:test';
import assert from 'node:assert/strict';
import { CYCLE_CONTRACT, PostgrestHeartimeState } from '../src/postgrest-state.mjs';

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
  assert.throws(() => new PostgrestHeartimeState({ baseUrl: '', publishableKey: 'x', tokenProvider }), /SUPABASE_URL/);
  assert.throws(() => new PostgrestHeartimeState({ baseUrl: 'https://x', publishableKey: '', tokenProvider }), /SUPABASE_PUBLISHABLE_KEY/);
  assert.throws(() => new PostgrestHeartimeState({ baseUrl: 'https://x', publishableKey: 'a' }), /tokenProvider/);
});


test('production PostgREST URL requires HTTPS and local HTTP needs explicit opt-in', () => {
  const tokenProvider = { getToken: async () => 'token' };
  assert.throws(() => new PostgrestHeartimeState({
    baseUrl: 'http://example.com',
    publishableKey: 'x',
    tokenProvider,
  }), /must use HTTPS/);
  assert.doesNotThrow(() => new PostgrestHeartimeState({
    baseUrl: 'http://localhost:54321',
    publishableKey: 'x',
    tokenProvider,
    allowInsecure: true,
  }));
  assert.throws(() => new PostgrestHeartimeState({
    baseUrl: 'https://example.com',
    publishableKey: 'x',
    tokenProvider,
    requestTimeoutMs: 10,
  }), /requestTimeoutMs/);
});
