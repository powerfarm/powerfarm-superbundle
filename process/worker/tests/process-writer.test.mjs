import assert from 'node:assert/strict';
import test from 'node:test';
import { persistAdmittedBatch, PROCESS_ADMISSION_PORT } from '../src/core.mjs';

const admission = {
  contract_version: 'powerfarm.process.admission-write.v2',
  data: {
    request_id: 'req-production-001', request_sha256: 'a'.repeat(64),
    institution_id: `inst_${'1'.repeat(32)}`, timeline_id: 'main', expected_prev_sha256: '0'.repeat(64), acts: [{}],
    card_ref: 'pf.card.production', beat_ref: 'pf.beat.production', attempt_ref: 'pf.attempt.production',
    execution_slice_sha256: `sha256:${'a'.repeat(64)}`, trace_ref: 'pf.trace.card.production',
  },
};

function portRequest(identityRef = 'pf.runtime.process-writer') {
  return {
    contract_version: PROCESS_ADMISSION_PORT,
    caller: { identity_ref: identityRef },
    admission: structuredClone(admission),
    trace_ref: 'pf.trace.card.production',
    card_ref: 'pf.card.production',
    beat_ref: 'pf.beat.production',
    attempt_ref: 'pf.attempt.production',
  };
}

function env() {
  const tokenCalls = [];
  return {
    tokenCalls,
    SUPABASE_URL: 'https://process.example.test',
    SUPABASE_PUBLISHABLE_KEY: 'publishable',
    PROCESS_WRITER_CALLERS: 'pf.runtime.process-writer',
    REGISTRY_IDENTITY: {
      async issueRuntimeToken(request) {
        tokenCalls.push(request);
        return { contract_version: 'powerfarm.registry.runtime-token.v1', data: { access_token: 'short-lived-process-token', subject_ref: 'pf.runtime.process-writer', expires_at: '2026-08-30T08:00:00Z' } };
      },
    },
  };
}

test('Process Service Binding spends a Registry-issued runtime credential and preserves trace correlation', async () => {
  const e = env();
  let call;
  const fetchImpl = async (url, init) => {
    call = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ contract_version: 'powerfarm.process.admission-write.v2', data: { request_id: 'req-production-001', replayed: false } }), { status: 200 });
  };
  const out = await persistAdmittedBatch({
    request: {
      contract_version: PROCESS_ADMISSION_PORT,
      caller: { identity_ref: 'pf.runtime.process-writer', component_ref: 'pf.setting.process-writer' },
      admission,
      trace_ref: 'pf.trace.card.production', card_ref: 'pf.card.production', beat_ref: 'pf.beat.production', attempt_ref: 'pf.attempt.production',
    }, env: e, fetchImpl,
  });
  assert.equal(out.contract_version, PROCESS_ADMISSION_PORT);
  assert.equal(e.tokenCalls[0].subject_ref, 'pf.runtime.process-writer');
  assert.equal(e.tokenCalls[0].caller.identity_ref, 'pf.runtime.process-writer');
  assert.match(call.url, /\/rest\/v1\/rpc\/admit_card_batch_v2$/);
  assert.equal(call.init.headers.authorization, 'Bearer short-lived-process-token');
  assert.equal(call.init.headers['content-profile'], 'continuum');
  assert.equal(call.init.headers['x-powerfarm-trace-ref'], 'pf.trace.card.production');
  assert.equal(call.init.headers['x-powerfarm-card-ref'], 'pf.card.production');
  assert.deepEqual(call.body, { p_request: admission });
});

test('Process Service Binding fails closed on caller, Registry token and response contract drift', async () => {
  const e = env();
  await assert.rejects(() => persistAdmittedBatch({ request: portRequest('pf.runtime.other'), env: e, fetchImpl: async () => { throw new Error('no'); } }), /caller not admitted/);
  const noRegistry = { ...e, REGISTRY_IDENTITY: null };
  await assert.rejects(() => persistAdmittedBatch({ request: portRequest(), env: noRegistry, fetchImpl: async () => { throw new Error('no'); } }), /REGISTRY_IDENTITY/);
  await assert.rejects(() => persistAdmittedBatch({ request: portRequest(), env: e, fetchImpl: async () => new Response(JSON.stringify({ contract_version: 'wrong' }), { status: 200 }) }), /response contract mismatch/);
});


test('Process writer refuses any admitted batch that is not bound to the circulating Card', async () => {
  const e = env();
  const request = {
    contract_version: PROCESS_ADMISSION_PORT,
    caller: { identity_ref: 'pf.runtime.process-writer' },
    admission: structuredClone(admission),
    trace_ref: 'pf.trace.card.production', card_ref: 'pf.card.production', beat_ref: 'pf.beat.production', attempt_ref: 'pf.attempt.production',
  };
  delete request.admission.data.card_ref;
  await assert.rejects(() => persistAdmittedBatch({ request, env: e, fetchImpl: async () => { throw new Error('must not reach PostgREST'); } }), /card_ref mismatch/);
});
