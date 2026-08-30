import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const writerMigration = new URL('../process/migrations/20260830130000_process_admission_writer.sql', import.meta.url);
const cardOnlyMigration = new URL('../process/migrations/20260830140000_process_card_only_admission.sql', import.meta.url);

test('Process production writer is transactional, runtime-identity gated and Card-bound at the authenticated boundary', async () => {
  const v1 = (await readFile(writerMigration, 'utf8')).toLowerCase();
  const v2 = (await readFile(cardOnlyMigration, 'utf8')).toLowerCase();
  assert.match(v1, /create table continuum\.admission_batches/);
  assert.match(v1, /create or replace function continuum\.admit_batch_v1/);
  assert.match(v1, /pf\.runtime\.process-writer/);
  assert.match(v1, /pg_advisory_xact_lock/);
  assert.match(v1, /admission_stale_head/);
  assert.match(v1, /admission_chain_break/);
  assert.match(v1, /actor_external_ref/);
  assert.match(v1, /office_external_ref/);
  assert.match(v2, /create table continuum\.card_admission_bindings/);
  assert.match(v2, /create or replace function continuum\.admit_card_batch_v2/);
  assert.match(v2, /card_ref/);
  assert.match(v2, /beat_ref/);
  assert.match(v2, /attempt_ref/);
  assert.match(v2, /execution_slice_sha256/);
  assert.match(v2, /revoke all on function continuum\.admit_batch_v1\(jsonb\) from authenticated/);
  assert.match(v2, /grant execute on function continuum\.admit_card_batch_v2\(jsonb\) to authenticated/);
  assert.doesNotMatch(v2, /grant execute on function continuum\.admit_batch_v1\(jsonb\) to authenticated/);
  assert.doesNotMatch(`${v1}\n${v2}`, /grant insert on continuum\.acts to authenticated/);
  assert.doesNotMatch(`${v1}\n${v2}`, /authority\.grant|create table .*grants|run_grants/);
});
