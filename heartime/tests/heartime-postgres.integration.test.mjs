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
];
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
