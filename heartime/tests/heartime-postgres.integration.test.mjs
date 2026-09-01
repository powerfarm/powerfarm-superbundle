import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = [
  'heartime/migrations/20260823000000_heartime_genesis.sql',
  'heartime/migrations/20260823190000_heartime_first_seam.sql',
  'heartime/migrations/20260824120000_heartime_capability_learning.sql',
  'heartime/migrations/20260830012500_heartime_writer_hardening.sql',
  'heartime/migrations/20260830074000_heartime_operational_projections.sql',
  'heartime/migrations/20260901120000_heartime_institution_identity.sql',
];
const INSTITUTION_REF = `inst_${'1'.repeat(32)}`;
const GENESIS_REF = `evt_${'3'.repeat(32)}`;
const ANCHOR_DIGEST = 'f'.repeat(64);
const HEARTIME_UID = '22222222-2222-4222-8222-222222222222';

async function disposablePostgres() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create table public.identities (
      id uuid primary key,
      name text not null,
      institutional_ref text
    );
    create function public.identidade_atual() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function public.eh_membro() returns boolean language sql stable as $$
      select public.identidade_atual() is not null
    $$;
  `);
  for (const relative of MIGRATIONS) {
    await db.exec(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  }
  await db.query(
    'insert into public.identities(id, name, institutional_ref) values ($1, $2, $3)',
    [HEARTIME_UID, 'pf.runtime.heartime', 'pf.runtime.heartime'],
  );
  await db.exec(`select set_config('request.jwt.claim.sub', '${HEARTIME_UID}', false)`);
  return db;
}

test('Heartime migrations and trace RPC execute against disposable PostgreSQL', async () => {
  const db = await disposablePostgres();
  try {
    const result = await db.query(`
      select heartime.record_trace_event_v1(
        p_trace_ref => $1,
        p_component_ref => $2,
        p_event_name => $3,
        p_observed_at => $4::timestamptz,
        p_card_ref => $5,
        p_beat_ref => $6,
        p_attempt_ref => $7,
        p_attributes => $8::jsonb
      ) as id
    `, [
      'pf.trace.card.market',
      'pf.runtime.heartime',
      'heartime.beat.dispatch',
      '2026-08-30T08:00:00.000Z',
      'pf.card.market',
      'pf.beat.market',
      'pf.attempt.market',
      JSON.stringify({ reconciler_ref: 'pf.reconciler.attention' }),
    ]);
    assert.equal(result.rows[0].id, 1);

    const stored = await db.query(`
      select trace_ref, component_ref, event_name, card_ref, beat_ref, attempt_ref, attributes
      from heartime.trace_events where id = $1
    `, [result.rows[0].id]);
    assert.deepEqual(stored.rows, [{
      trace_ref: 'pf.trace.card.market',
      component_ref: 'pf.runtime.heartime',
      event_name: 'heartime.beat.dispatch',
      card_ref: 'pf.card.market',
      beat_ref: 'pf.beat.market',
      attempt_ref: 'pf.attempt.market',
      attributes: { reconciler_ref: 'pf.reconciler.attention' },
    }]);

    await assert.rejects(
      () => db.query(`
        select heartime.record_trace_event_v1(
          $1, $2, $3, $4::timestamptz, null, null, null, $5::jsonb
        )
      `, [
        'pf.trace.card.secret',
        'pf.runtime.heartime',
        'heartime.trace.test',
        '2026-08-30T08:00:00.000Z',
        JSON.stringify({ safe: { nested: { access_token: 'must-not-persist' } } }),
      ]),
      /trace_attributes_forbidden/,
    );

    await assert.rejects(
      () => db.query(`
        select heartime.record_trace_event_v1(
          p_trace_ref => $1,
          p_event_name => $2,
          p_observed_at => $3::timestamptz
        )
      `, ['pf.trace.missing-component', 'heartime.trace.test', '2026-08-30T08:00:00.000Z']),
      /does not exist/,
    );
  } finally {
    await db.close();
  }
});


// --- which institution does this Heartime database serve? -------------------
//
//   Genesis creates an institution. Recovery must never create one.
//
// Heartime carried no institutional identity at all until this migration, so a
// worker pointed at the wrong database had nothing to check. These run against
// the real PostgreSQL functions.

async function declared() {
  const db = await disposablePostgres();
  await db.query(
    'select heartime.declare_institution_v1($1, $2, $3, $4)',
    [INSTITUTION_REF, GENESIS_REF, ANCHOR_DIGEST, 'powerfarm-continuum/v3'],
  );
  return db;
}

test('an undeclared Heartime database refuses the startup assertion instead of declaring itself', async () => {
  const db = await disposablePostgres();
  try {
    await assert.rejects(
      () => db.query('select heartime.assert_institution_v1($1, $2)', [INSTITUTION_REF, ANCHOR_DIGEST]),
      /heartime_institution_undeclared/,
    );
    const rows = await db.query('select count(*)::int as n from heartime.institution');
    assert.equal(rows.rows[0].n, 0, 'a failed assertion must not have declared anything');
  } finally {
    await db.close();
  }
});

test('a Heartime database serving another institution refuses the worker', async () => {
  const db = await declared();
  try {
    await assert.rejects(
      () => db.query('select heartime.assert_institution_v1($1, $2)', [`inst_${'9'.repeat(32)}`, ANCHOR_DIGEST]),
      /heartime_institution_mismatch/,
    );
  } finally {
    await db.close();
  }
});

test('a Heartime database with a different anchor refuses even under the right name', async () => {
  const db = await declared();
  try {
    await assert.rejects(
      () => db.query('select heartime.assert_institution_v1($1, $2)', [INSTITUTION_REF, 'a'.repeat(64)]),
      /heartime_institution_anchor_mismatch/,
    );
  } finally {
    await db.close();
  }
});

test('the correct institution and anchor start the worker', async () => {
  const db = await declared();
  try {
    const result = await db.query('select heartime.assert_institution_v1($1, $2) as result', [INSTITUTION_REF, ANCHOR_DIGEST]);
    const envelope = result.rows[0].result;
    assert.equal(envelope.contract_version, 'powerfarm.heartime.institution-assert.v1');
    assert.equal(envelope.data.institution_ref, INSTITUTION_REF);
    assert.equal(envelope.data.genesis_ref, GENESIS_REF);
    assert.equal(envelope.data.anchor_digest, ANCHOR_DIGEST);
  } finally {
    await db.close();
  }
});

test('declaring a second, different institution in the same database is refused', async () => {
  const db = await declared();
  try {
    // Idempotent for the same institution.
    await db.query(
      'select heartime.declare_institution_v1($1, $2, $3, $4)',
      [INSTITUTION_REF, GENESIS_REF, ANCHOR_DIGEST, 'powerfarm-continuum/v3'],
    );
    await assert.rejects(
      () => db.query(
        'select heartime.declare_institution_v1($1, $2, $3, $4)',
        [`inst_${'7'.repeat(32)}`, GENESIS_REF, ANCHOR_DIGEST, 'powerfarm-continuum/v3'],
      ),
      /heartime_institution_conflict/,
    );
    const rows = await db.query('select institution_ref from heartime.institution where id = 1');
    assert.equal(rows.rows[0].institution_ref, INSTITUTION_REF);
  } finally {
    await db.close();
  }
});
