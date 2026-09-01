import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

import {
  bootstrapInstitution,
  persistAdmittedBatch,
  PROCESS_ADMISSION_PORT,
} from '../worker/src/core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = [
  'process/migrations/20260830120000_process_continuum_core.sql',
  'process/migrations/20260830130000_process_admission_writer.sql',
  'process/migrations/20260830140000_process_card_only_admission.sql',
  'process/migrations/20260901120000_process_institution_identity.sql',
];
const WRITER_UID = '11111111-1111-4111-8111-111111111111';
const INSTITUTION_ID = `inst_${'1'.repeat(32)}`;
const GENESIS_REF = `evt_${'3'.repeat(32)}`;
const ANCHOR_DIGEST = 'f'.repeat(64);
const PROTOCOL = 'powerfarm-continuum/v3';

async function disposablePostgres() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
  for (const relative of MIGRATIONS) {
    await db.exec(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  }
  await db.exec(`
    select set_config('request.jwt.claim.sub', '${WRITER_UID}', false);
    select set_config(
      'request.jwt.claims',
      '{"powerfarm_subject_ref":"pf.runtime.process-writer"}',
      false
    );
  `);
  return db;
}

function env() {
  return {
    SUPABASE_URL: 'https://process.integration.test',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
    PROCESS_WRITER_CALLERS: 'pf.runtime.process-writer',
    PROCESS_EXPECTED_INSTITUTION: INSTITUTION_ID,
    PROCESS_EXPECTED_ANCHOR_DIGEST: ANCHOR_DIGEST,
    REGISTRY_IDENTITY: {
      async issueRuntimeToken() {
        return {
          contract_version: 'powerfarm.registry.runtime-token.v1',
          data: {
            access_token: 'disposable-postgres-token',
            subject_ref: 'pf.runtime.process-writer',
          },
        };
      },
    },
  };
}

function caller() {
  return {
    identity_ref: 'pf.runtime.process-writer',
    component_ref: 'pf.setting.process-writer',
  };
}

function admissionRequest({
  requestId = 'request-postgres-0001',
  eventId = `evt_${'2'.repeat(32)}`,
  timelineIndex = 1,
  expectedPrevSha256 = '0'.repeat(64),
} = {}) {
  return {
    contract_version: 'powerfarm.process.admission-write.v2',
    data: {
      request_id: requestId,
      request_sha256: 'a'.repeat(64),
      institution_id: INSTITUTION_ID,
      timeline_id: 'main',
      expected_prev_sha256: expectedPrevSha256,
      acts: [{
        id: eventId,
        timeline_index: timelineIndex,
        request_id: 'event-postgres-0001',
        recorded_at: '2026-08-30T00:00:00.000Z',
        effective_at: '2026-08-30T00:00:00.000Z',
        actor_ref: 'pf.person.director',
        office_ref: 'pf.office.director',
        occupancy_ref: null,
        kind: 'institution.genesis',
        subject: 'institution:root',
        payload: {},
        causes: [],
        authority_ref: 'constitutional:genesis',
        direction_ref: null,
        effective_capability_set_sha256: null,
        intent_sha256: 'b'.repeat(64),
        prev_sha256: expectedPrevSha256,
        sha256: 'c'.repeat(64),
        local_seal: 'd'.repeat(64),
      }],
      card_ref: 'pf.card.postgres-boundary',
      beat_ref: 'pf.beat.postgres-boundary',
      attempt_ref: 'pf.attempt.postgres-boundary',
      execution_slice_sha256: `sha256:${'e'.repeat(64)}`,
      trace_ref: 'pf.trace.postgres-boundary',
    },
  };
}

function postgrestRpcFetch(db) {
  return async (url, init) => {
    const rpc = new URL(url).pathname.split('/').at(-1);
    const body = JSON.parse(init.body);
    let query;
    let params;
    if (rpc === 'bootstrap_institution_v3') {
      query = 'select continuum.bootstrap_institution_v3($1, $2, $3, $4, $5, $6) as result';
      params = [body.p_institution_id, body.p_title, body.p_genesis_ref, body.p_anchor_digest, body.p_protocol_version, body.p_timeline_id];
    } else if (rpc === 'assert_institution_v1') {
      query = 'select continuum.assert_institution_v1($1, $2) as result';
      params = [body.p_institution_ref, body.p_anchor_digest];
    } else if (rpc === 'admit_card_batch_v2') {
      query = 'select continuum.admit_card_batch_v2($1::jsonb) as result';
      params = [JSON.stringify(body.p_request)];
    } else {
      return new Response(JSON.stringify({ error: `unknown RPC ${rpc}` }), { status: 404 });
    }
    try {
      const result = await db.query(query, params);
      return new Response(JSON.stringify(result.rows[0].result), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ code: error.code, message: error.message }), { status: 400 });
    }
  };
}

test('Process writer migrations and RPC clients cross a disposable PostgreSQL boundary', async () => {
  const db = await disposablePostgres();
  try {
    const fetchImpl = postgrestRpcFetch(db);
    const boot = await bootstrapInstitution({
      request: {
        contract_version: PROCESS_ADMISSION_PORT,
        caller: caller(),
        data: {
          institution_id: INSTITUTION_ID,
          title: 'PowerFarm',
          timeline_id: 'main',
          genesis_ref: GENESIS_REF,
          anchor_digest: ANCHOR_DIGEST,
          protocol_version: PROTOCOL,
        },
      },
      env: env(),
      fetchImpl,
    });
    assert.equal(boot.data.institution_id, INSTITUTION_ID);

    const admission = admissionRequest();
    const request = {
      contract_version: PROCESS_ADMISSION_PORT,
      caller: caller(),
      admission,
      card_ref: admission.data.card_ref,
      beat_ref: admission.data.beat_ref,
      attempt_ref: admission.data.attempt_ref,
      trace_ref: admission.data.trace_ref,
    };
    const first = await persistAdmittedBatch({ request, env: env(), fetchImpl });
    assert.equal(first.data.first_act_id, admission.data.acts[0].id);
    assert.equal(first.data.last_act_id, admission.data.acts[0].id);
    assert.equal(first.data.replayed, false);

    const replay = await persistAdmittedBatch({ request, env: env(), fetchImpl });
    assert.equal(replay.data.replayed, true);

    const stored = await db.query(`
      select a.id, b.card_ref, b.beat_ref, b.attempt_ref, b.execution_slice_sha256
      from continuum.acts a
      join continuum.card_admission_bindings b on b.request_id = $1
    `, [admission.data.request_id]);
    assert.deepEqual(stored.rows, [{
      id: admission.data.acts[0].id,
      card_ref: admission.data.card_ref,
      beat_ref: admission.data.beat_ref,
      attempt_ref: admission.data.attempt_ref,
      execution_slice_sha256: admission.data.execution_slice_sha256,
    }]);

    const idColumn = await db.query(`
      select data_type from information_schema.columns
      where table_schema = 'continuum' and table_name = 'acts' and column_name = 'id'
    `);
    assert.equal(idColumn.rows[0].data_type, 'text');

    const invalid = admissionRequest({
      requestId: 'request-postgres-invalid-id',
      eventId: '22222222-2222-4222-8222-222222222222',
      timelineIndex: 2,
      expectedPrevSha256: 'c'.repeat(64),
    });
    await assert.rejects(
      () => db.query('select continuum.admit_card_batch_v2($1::jsonb)', [JSON.stringify(invalid)]),
      /admission_act_id_required/,
    );

    await assert.rejects(
      () => db.query('select continuum.bootstrap_institution_v1($1, $2, $3)', [INSTITUTION_ID, 'wrong version', 'main']),
      /does not exist/,
    );
  } finally {
    await db.close();
  }
});


// --- which institution does this database serve? ---------------------------
//
//   Genesis creates an institution. Recovery must never create one.
//
// These run against the real PostgreSQL functions, not against a client double.

async function founded() {
  const db = await disposablePostgres();
  const fetchImpl = postgrestRpcFetch(db);
  await bootstrapInstitution({
    request: {
      contract_version: PROCESS_ADMISSION_PORT,
      caller: caller(),
      data: {
        institution_id: INSTITUTION_ID, title: 'PowerFarm', timeline_id: 'main',
        genesis_ref: GENESIS_REF, anchor_digest: ANCHOR_DIGEST, protocol_version: PROTOCOL,
      },
    },
    env: env(),
    fetchImpl,
  });
  return { db, fetchImpl };
}

test('an empty Process database refuses the startup assertion instead of bootstrapping', async () => {
  const db = await disposablePostgres();
  try {
    await assert.rejects(
      () => db.query('select continuum.assert_institution_v1($1, $2)', [INSTITUTION_ID, ANCHOR_DIGEST]),
      /institution_not_present/,
    );
    const rows = await db.query('select count(*)::int as n from continuum.institutions');
    assert.equal(rows.rows[0].n, 0, 'a failed assertion must not have created anything');
  } finally {
    await db.close();
  }
});

test('a Process database serving another institution refuses the startup assertion', async () => {
  const { db } = await founded();
  try {
    await assert.rejects(
      () => db.query('select continuum.assert_institution_v1($1, $2)', [`inst_${'9'.repeat(32)}`, ANCHOR_DIGEST]),
      /institution_not_present/,
    );
  } finally {
    await db.close();
  }
});

test('a Process database with a different anchor refuses even under the right name', async () => {
  const { db } = await founded();
  try {
    await assert.rejects(
      () => db.query('select continuum.assert_institution_v1($1, $2)', [INSTITUTION_ID, 'a'.repeat(64)]),
      /institution_anchor_mismatch/,
    );
    // The name alone still passes, which is exactly why the anchor is carried.
    const named = await db.query('select continuum.assert_institution_v1($1, null) as result', [INSTITUTION_ID]);
    assert.equal(named.rows[0].result.data.institution_ref, INSTITUTION_ID);
  } finally {
    await db.close();
  }
});

test('genesis records the anchor and refuses to re-found the same id under a different one', async () => {
  const { db, fetchImpl } = await founded();
  try {
    const stored = await db.query('select genesis_ref, anchor_digest, protocol_version from continuum.institutions where id = $1', [INSTITUTION_ID]);
    assert.deepEqual(stored.rows[0], { genesis_ref: GENESIS_REF, anchor_digest: ANCHOR_DIGEST, protocol_version: PROTOCOL });

    await assert.rejects(
      () => bootstrapInstitution({
        request: {
          contract_version: PROCESS_ADMISSION_PORT,
          caller: caller(),
          data: {
            institution_id: INSTITUTION_ID, title: 'Impostor', timeline_id: 'main',
            genesis_ref: `evt_${'8'.repeat(32)}`, anchor_digest: 'b'.repeat(64), protocol_version: PROTOCOL,
          },
        },
        env: env(),
        fetchImpl,
      }),
      /institution_anchor_conflict/,
    );
  } finally {
    await db.close();
  }
});

test('a Process writer pointed at an empty database persists nothing', async () => {
  const db = await disposablePostgres();
  try {
    const fetchImpl = postgrestRpcFetch(db);
    const admission = admissionRequest();
    await assert.rejects(
      () => persistAdmittedBatch({
        request: {
          contract_version: PROCESS_ADMISSION_PORT,
          caller: caller(),
          admission,
          card_ref: admission.data.card_ref,
          beat_ref: admission.data.beat_ref,
          attempt_ref: admission.data.attempt_ref,
          trace_ref: admission.data.trace_ref,
        },
        env: env(),
        fetchImpl,
      }),
      /institution_not_present/,
    );
    const acts = await db.query('select count(*)::int as n from continuum.acts');
    assert.equal(acts.rows[0].n, 0, 'no act may be persisted into a database that is not the institution');
  } finally {
    await db.close();
  }
});
