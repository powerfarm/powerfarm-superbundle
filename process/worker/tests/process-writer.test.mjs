import assert from 'node:assert/strict';
import test from 'node:test';
import { persistAdmittedBatch, PROCESS_ADMISSION_PORT } from '../src/core.mjs';

const INSTITUTION_REF = `inst_${'1'.repeat(32)}`;
const ANCHOR_DIGEST = 'c'.repeat(64);

// Every request now begins with the institution assertion, so a stub must answer
// it before it answers anything else.
function respond(url, payload) {
  if (String(url).includes('assert_institution_v1')) {
    return new Response(JSON.stringify({
      contract_version: 'powerfarm.process.institution-assert.v1',
      data: { institution_ref: INSTITUTION_REF, genesis_ref: `evt_${'2'.repeat(32)}`, anchor_digest: ANCHOR_DIGEST, protocol_version: 'powerfarm-continuum/v3', canonical_timeline: 'main' },
    }), { status: 200 });
  }
  return payload();
}

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
    PROCESS_EXPECTED_INSTITUTION: INSTITUTION_REF,
    PROCESS_EXPECTED_ANCHOR_DIGEST: ANCHOR_DIGEST,
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
  const fetchImpl = async (url, init) => respond(url, () => {
    call = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ contract_version: 'powerfarm.process.admission-write.v2', data: { request_id: 'req-production-001', replayed: false } }), { status: 200 });
  });
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
  await assert.rejects(() => persistAdmittedBatch({ request: portRequest(), env: e, fetchImpl: async (url) => respond(url, () => new Response(JSON.stringify({ contract_version: 'wrong' }), { status: 200 })) }), /response contract mismatch/);
});


// --- which institution is this worker serving? ----------------------------
//
//   Genesis creates an institution. Recovery must never create one.

test('a Process writer that does not declare its institution refuses before persisting', async () => {
  const e = env();
  delete e.PROCESS_EXPECTED_INSTITUTION;
  let reached = false;
  await assert.rejects(
    () => persistAdmittedBatch({ request: portRequest(), env: e, fetchImpl: async () => { reached = true; throw new Error('must not reach PostgREST'); } }),
    /PROCESS_EXPECTED_INSTITUTION is required/,
  );
  assert.equal(reached, false, 'an undeclared worker must not reach the database at all');
});

test('a Process writer pointed at a database serving another institution refuses', async () => {
  const e = env();
  let admitted = false;
  await assert.rejects(
    () => persistAdmittedBatch({
      request: portRequest(),
      env: e,
      fetchImpl: async (url) => {
        if (String(url).includes('assert_institution_v1')) {
          return new Response(JSON.stringify({ message: 'institution_not_present: this database does not serve inst_...' }), { status: 400 });
        }
        admitted = true;
        return new Response(JSON.stringify({ contract_version: 'powerfarm.process.admission-write.v2', data: {} }), { status: 200 });
      },
    }),
    /institution_not_present|assert_institution_v1/,
  );
  assert.equal(admitted, false, 'nothing may be persisted once the institution assertion fails');
});

test('a Process writer refuses when the database answers with a different institution', async () => {
  const e = env();
  let admitted = false;
  await assert.rejects(
    () => persistAdmittedBatch({
      request: portRequest(),
      env: e,
      fetchImpl: async (url) => {
        if (String(url).includes('assert_institution_v1')) {
          return new Response(JSON.stringify({
            contract_version: 'powerfarm.process.institution-assert.v1',
            data: { institution_ref: `inst_${'9'.repeat(32)}`, anchor_digest: ANCHOR_DIGEST },
          }), { status: 200 });
        }
        admitted = true;
        return new Response(JSON.stringify({ contract_version: 'powerfarm.process.admission-write.v2', data: {} }), { status: 200 });
      },
    }),
    /returned a different institution/,
  );
  assert.equal(admitted, false);
});

test('the institution assertion precedes admission on the wire', async () => {
  const e = env();
  const rpcs = [];
  const fetchImpl = async (url) => {
    rpcs.push(String(url).split('/rpc/')[1]);
    return respond(url, () => new Response(JSON.stringify({ contract_version: 'powerfarm.process.admission-write.v2', data: {} }), { status: 200 }));
  };
  await persistAdmittedBatch({ request: portRequest(), env: e, fetchImpl });
  assert.deepEqual(rpcs, ['assert_institution_v1', 'admit_card_batch_v2']);
});

test('genesis requires the anchor and is a separate ceremony from persistence', async () => {
  const e = env();
  const { bootstrapInstitution } = await import('../src/core.mjs');
  const base = {
    contract_version: PROCESS_ADMISSION_PORT,
    caller: { identity_ref: 'pf.runtime.process-writer' },
    data: { institution_id: INSTITUTION_REF, title: 'PowerFarm' },
  };
  await assert.rejects(
    () => bootstrapInstitution({ request: base, env: e, fetchImpl: async () => { throw new Error('must not reach PostgREST'); } }),
    /requires genesis_ref/,
  );

  const complete = {
    ...base,
    data: { ...base.data, genesis_ref: `evt_${'2'.repeat(32)}`, anchor_digest: ANCHOR_DIGEST, protocol_version: 'powerfarm-continuum/v3' },
  };
  let rpc;
  const out = await bootstrapInstitution({
    request: complete,
    env: e,
    fetchImpl: async (url) => {
      rpc = String(url).split('/rpc/')[1];
      return new Response(JSON.stringify({
        contract_version: 'powerfarm.process.bootstrap.v3',
        data: { institution_id: INSTITUTION_REF, timeline_id: 'main', anchor_digest: ANCHOR_DIGEST },
      }), { status: 200 });
    },
  });
  assert.equal(rpc, 'bootstrap_institution_v3');
  assert.equal(out.data.institution_id, INSTITUTION_REF);
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
