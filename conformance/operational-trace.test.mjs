import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Heartime production trace persistence is narrow and runtime-identity gated', async () => {
  const sql = (await readFile(new URL('../heartime/migrations/20260830074000_heartime_operational_projections.sql', import.meta.url), 'utf8')).toLowerCase();
  assert.match(sql, /create table heartime\.trace_events/);
  assert.match(sql, /heartime\.current_identity_is\('pf\.runtime\.heartime'\)/);
  assert.match(sql, /create or replace view heartime\.circulation_pressure_v1/);
  assert.match(sql, /trace_attributes_forbidden/);
  assert.doesNotMatch(sql, /authority_ref|run_grant|create table .*cards/);
});
