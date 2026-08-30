import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.resolve(here, '../migrations/20260830012500_heartime_writer_hardening.sql'), 'utf8').toLowerCase();

test('Heartime durable writes require the admitted runtime identity, not ordinary membership', () => {
  assert.match(sql, /current_identity_is\('pf\.runtime\.heartime'\)/);
  assert.match(sql, /drop policy if exists organs_escrita/);
  assert.match(sql, /drop policy if exists reconciliation_contracts_insert/);
  assert.doesNotMatch(sql, /eh_membro\(\)/);
});

test('Heartime hardening covers all mutable circulation surfaces', () => {
  for (const policy of [
    'organs_heartime_insert', 'organs_heartime_update', 'beats_heartime_insert',
    'echoes_heartime_insert', 'signals_heartime_insert',
    'reconciliation_contracts_heartime_insert', 'reconciliation_contracts_heartime_update',
    'reconciliation_observations_heartime_insert',
  ]) assert.match(sql, new RegExp(`create policy ${policy}`));
});
