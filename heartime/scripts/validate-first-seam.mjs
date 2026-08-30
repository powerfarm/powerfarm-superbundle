import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../migrations/20260823190000_heartime_first_seam.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

const checks = [
  ['migration creates/admits its own Heartime schema safely', /create schema if not exists heartime/i],
  ['contracts persist outside the scheduler engine', /create table heartime\.reconciliation_contracts/i],
  ['durable failure count survives provider retry windows', /failure_count\s+integer not null default 0 check \(failure_count >= 0\)/i],
  ['observations preserve reconciliation history', /create table heartime\.reconciliation_observations/i],
  ['each observation is unique per emitted beat', /unique index reconciliation_observations_one_per_beat/i],
  ['contract deadlines are indexed per reconciler', /\(reconciler_ref, next_expected, id\)/i],
  ['beats carry contract refs and hints, never Card payload', /add column contract_id[\s\S]*add column reconciler_ref[\s\S]*add column resource_hint/i],
  ['beat contract shape includes the resource hint', /contract_id is null and reconciler_ref is null and resource_hint is null and contract_generation is null/i],
  ['semantic contract changes advance generation', /create or replace function heartime\.bump_reconciliation_contract_generation[\s\S]*new\.generation := greatest\(new\.generation, old\.generation \+ 1\)[\s\S]*create trigger reconciliation_contracts_revision/i],
  ['contract generation cannot move backwards', /new\.generation < old\.generation[\s\S]*contract generation cannot move backwards/i],
  ['global Heartime next_wake is not narrowed by this seam', !/^create or replace function heartime\.next_wake\s*\(/im.test(sql)],
  ['First Seam has a reconciler-scoped next wake', /create or replace function heartime\.next_reconciliation_wake_v1/i],
  ['reconciler-scoped next wake can return no obligation', /when min\((?:next_expected|deadline)\) is null then null/i],
  ['prepare_cycle is level-triggered over current durable state', /create or replace function heartime\.prepare_cycle_v1[\s\S]*next_expected <= p_now/i],
  ['prepare_cycle claims only its supported reconciler', /prepare_cycle_v1[\s\S]*reconciler_ref = p_reconciler_ref/i],
  ['prepare_cycle uses concurrency-safe row claiming', /for update(?: of [a-z]+)? skip locked/i],
  ['open beats are replayed before new work is emitted', /Open beats are durable current state[\s\S]*left join heartime\.reconciliation_observations[\s\S]*o\.id is null/i],
  ['superseded contract generations are closed explicitly', /'superseded'[\s\S]*contract_generation_changed/i],
  ['new beats are not emitted while the same generation remains open', /not exists \([\s\S]*b\.contract_generation = c\.generation[\s\S]*o\.id is null/i],
  ['next deadline is written when the beat is emitted', /set last_started_at = p_now,[\s\S]*next_expected = v_due/i],
  ['wake contains refs and hint only', /jsonb_build_object\([\s\S]*'reconciler_ref'[\s\S]*'resource_hint'[\s\S]*'contract_generation'/i],
  ['finish_cycle is idempotent per beat', /on conflict \(beat_id\) do nothing/i],
  ['finish_cycle rejects NULL or non-array summaries', /jsonb_typeof\(p_summaries\) is distinct from 'array'/i],
  ['successful completion resets durable failure count', /finish_cycle_v1[\s\S]*failure_count = 0/i],
  ['old results cannot advance a new contract generation', /and generation = v_generation/i],
  ['failure reopens obligation before provider retries are exhausted', /create or replace function heartime\.defer_failure_v1[\s\S]*least\(next_expected/i],
  ['failure backoff compounds from durable contract state', /defer_failure_v1[\s\S]*c\.failure_count[\s\S]*v_failure_count := greatest\(coalesce\(v_failure_count, 0\) \+ 1, p_retry_count \+ 1\)/i],
  ['failure backoff remains bounded', /v_delay := least\(300,[\s\S]*power\(2/i],
  ['failure persists the exact emitted BeatRefs', /defer_failure_v1[\s\S]*p_beat_refs[\s\S]*foreach v_ref/i],
  ['summary state is constrained', /state\s+text not null check \(state in \('reconciled', 'blocked', 'failed', 'unknown', 'superseded'\)\)/i],
  ['summary size is bounded', /octet_length\(summary::text\) <= 65536/i],
  ['summary payload is recursively guarded', /reconciliation_summary_is_compact[\s\S]*jsonb_each[\s\S]*jsonb_array_elements/i],
  ['Card/WakePack/response bodies are forbidden in summaries', /'card'[\s\S]*'wake_pack'[\s\S]*'response'[\s\S]*'workflow_state'/i],
  ['new tables have RLS', /alter table heartime\.reconciliation_contracts enable row level security[\s\S]*alter table heartime\.reconciliation_observations enable row level security/i],
  ['update policy checks both old and new row', /reconciliation_contracts_update[\s\S]*using \(public\.eh_membro\(\)\) with check \(public\.eh_membro\(\)\)/i],
  ['PostgREST objects are denied to public and anon', /revoke all on heartime\.reconciliation_contracts, heartime\.reconciliation_observations from public, anon/i],
  ['only versioned First Seam functions are granted to authenticated', /grant execute on function heartime\.prepare_cycle_v1[\s\S]*grant execute on function heartime\.defer_failure_v1/i],
  ['migration does not broadly grant every Heartime function', !/grant execute on all functions in schema heartime/i.test(sql)],
  ['new tables carry created_by', /create table heartime\.reconciliation_contracts[\s\S]*created_by[\s\S]*create table heartime\.reconciliation_observations[\s\S]*created_by/i],
  ['write functions execute as caller', /prepare_cycle_v1[\s\S]*security invoker[\s\S]*finish_cycle_v1[\s\S]*security invoker[\s\S]*defer_failure_v1[\s\S]*security invoker/i],
  ['cycle responses carry the permanent contract version', (sql.match(/'powerfarm\.heartime\.cycle\.v1'/g) ?? []).length >= 3],
  ['no broker tables or queue offsets were introduced', !/create table[^;]*(queue|message|offset|dead.?letter)/i.test(sql)],
  ['dollar-quoted function bodies are paired', (sql.match(/\$\$/g) ?? []).length % 2 === 0],
  ['migration ends with a complete statement', /;\s*$/.test(sql)],
  ['no accidental duplicate FROM clause exists', !/\bfrom\s+heartime\.[\w.]+\s+from\b/i.test(sql)],
];

console.log('\nHEARTIME FIRST SEAM: migration verification\n');
let failures = 0;
for (const [label, condition] of checks) {
  const passed = condition instanceof RegExp ? condition.test(sql) : Boolean(condition);
  if (passed) console.log(`  ok    ${label}`);
  else {
    failures += 1;
    console.log(`  FALHA ${label}`);
  }
}

if (failures > 0) {
  console.error(`\nHEARTIME FIRST SEAM MIGRATION: FALHA · ${failures} problema(s)\n`);
  process.exit(1);
}
console.log(`\nHEARTIME FIRST SEAM MIGRATION: PASSA · ${checks.length} verificacoes\n`);
