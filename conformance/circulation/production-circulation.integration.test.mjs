import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PRODUCTION_INSTITUTION_REF = `inst_${'1'.repeat(32)}`;
const PRODUCTION_ANCHOR_DIGEST = 'c'.repeat(64);

import { createCardV1 } from '../../circulation/cards/lib/index.mjs';
import { createOccupanciesRpcPort } from '../../circulation/attention/lib/rpc-ports.mjs';
import { traceRefForCard } from '../../circulation/lib/trace.mjs';
import { persistAdmittedBatch, PROCESS_ADMISSION_PORT } from '../../process/worker/src/core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLDEN = path.join(ROOT, 'conformance/circulation/golden/production-circulation.golden.json');
const T0 = '2026-08-30T08:00:00.000Z';

function registryBinding(observed) {
  return {
    async resolveCurrentOccupancy(request) {
      observed.push({ kind: 'registry.occupancy', request });
      return {
        contract_version: 'powerfarm.registry.occupancy.v1',
        data: { ref: 'pf.occupancy.production', principal_ref: 'pf.agent.production', office_ref: request.scope, observed_at: request.observedAt },
      };
    },
    async issueRuntimeToken(request) {
      observed.push({ kind: 'registry.runtime-token', request });
      return {
        contract_version: 'powerfarm.registry.runtime-token.v1',
        data: { access_token: 'runtime-jwt-redacted', subject_ref: 'pf.runtime.process-writer', expires_at: '2026-08-30T08:03:00.000Z' },
      };
    },
  };
}

test('golden production circulation: Registry identity reality, private runtime token, Process writer and trace share one Card spine', async () => {
  const observed = [];
  const registry = registryBinding(observed);
  const card = await createCardV1({
    ref: 'pf.card.production-circulation', scope: 'pf.office.operations', created_at: T0,
    institutional: { identity_ref: 'pf.agent.production', office_ref: 'pf.office.operations', occupancy_ref: 'pf.occupancy.production' },
    circulation: { state: 'prepared', priority: 10, next_expected: T0 },
  });

  const traceRef = traceRefForCard(card.ref);
  const occupancyPort = createOccupanciesRpcPort(registry, { identity_ref: 'pf.runtime.heartime', component_ref: 'pf.reconciler.attention', trace_ref: traceRef });
  const occupancy = await occupancyPort.resolve(card.scope, { observedAt: T0 });
  assert.equal(occupancy.principal_ref, 'pf.agent.production');

  const admission = {
    contract_version: 'powerfarm.process.admission-write.v2',
    data: {
      request_id: 'req-production-circulation-001', request_sha256: 'a'.repeat(64), institution_id: `inst_${'1'.repeat(32)}`,
      timeline_id: 'main', expected_prev_sha256: '0'.repeat(64), acts: [{ sha256: 'b'.repeat(64) }],
      card_ref: card.ref, beat_ref: 'pf.beat.production-circulation', attempt_ref: 'pf.attempt.production-circulation',
      execution_slice_sha256: `sha256:${'c'.repeat(64)}`, trace_ref: traceRef,
    },
  };
  let postgrest;
  const env = {
    SUPABASE_URL: 'https://process.example.test', SUPABASE_PUBLISHABLE_KEY: 'publishable',
    PROCESS_WRITER_CALLERS: 'pf.runtime.process-writer', REGISTRY_IDENTITY: registry,
    // Which institution is this writer serving? Declared before anything is
    // persisted on that institution's behalf.
    PROCESS_EXPECTED_INSTITUTION: PRODUCTION_INSTITUTION_REF,
    PROCESS_EXPECTED_ANCHOR_DIGEST: PRODUCTION_ANCHOR_DIGEST,
  };
  const writer = await persistAdmittedBatch({
    request: {
      contract_version: PROCESS_ADMISSION_PORT,
      caller: { identity_ref: 'pf.runtime.process-writer', component_ref: 'pf.setting.process-writer', trace_ref: traceRef },
      admission, trace_ref: traceRef, card_ref: card.ref, beat_ref: 'pf.beat.production-circulation', attempt_ref: 'pf.attempt.production-circulation',
    },
    env,
    fetchImpl: async (url, init) => {
      if (String(url).includes('assert_institution_v1')) {
        return new Response(JSON.stringify({
          contract_version: 'powerfarm.process.institution-assert.v1',
          data: { institution_ref: PRODUCTION_INSTITUTION_REF, anchor_digest: PRODUCTION_ANCHOR_DIGEST },
        }), { status: 200 });
      }
      postgrest = { url, headers: init.headers, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ contract_version: 'powerfarm.process.admission-write.v2', data: { request_id: admission.data.request_id, replayed: false } }), { status: 200 });
    },
  });
  assert.equal(writer.data.request_id, admission.data.request_id);
  assert.equal(postgrest.headers['x-powerfarm-trace-ref'], traceRef);
  assert.equal(postgrest.headers['x-powerfarm-card-ref'], card.ref);

  const tokenObservation = observed.find((row) => row.kind === 'registry.runtime-token');
  const actual = {
    contract_version: 'powerfarm.production-circulation-golden.v1',
    card_ref: card.ref,
    trace_ref: traceRef,
    occupancy_ref: occupancy.ref,
    occupant_ref: occupancy.principal_ref,
    runtime_subject: tokenObservation.request.subject_ref,
    runtime_audience: tokenObservation.request.audience,
    process_rpc: new URL(postgrest.url).pathname,
    process_profile: postgrest.headers['content-profile'],
    propagated_refs: {
      trace_ref: postgrest.headers['x-powerfarm-trace-ref'],
      card_ref: postgrest.headers['x-powerfarm-card-ref'],
      beat_ref: postgrest.headers['x-powerfarm-beat-ref'],
      attempt_ref: postgrest.headers['x-powerfarm-attempt-ref'],
    },
    registry_calls: observed.map((row) => row.kind),
    authority_created_by_runtime_token: false,
  };
  if (process.env.UPDATE_POWERFARM_GOLDEN === '1') fs.writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
  const expected = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(actual, expected);
});
