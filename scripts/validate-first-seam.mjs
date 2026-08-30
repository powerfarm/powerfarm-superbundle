import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATTENTION_RECONCILER_REF,
  FIRST_SEAM_CONTRACT_ID,
  FIRST_SEAM_SCHEMA_VERSION,
  HEARTIME_CYCLE_VERSION,
  PORT_VERSIONS,
} from '../circulation/attention/lib/contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (label, condition) => {
  if (!condition) throw new Error(`First Seam contract failed: ${label}`);
  checks.push(label);
};

const manifest = JSON.parse(read('contracts/first-seam.v1.json'));
check('machine contract identity matches source', manifest.$id === FIRST_SEAM_CONTRACT_ID);
check('machine contract schema version is permanent v1', manifest.version === FIRST_SEAM_SCHEMA_VERSION);
check('reconciler identity matches source', manifest.reconciler_ref === ATTENTION_RECONCILER_REF);
check('Heartime cycle version matches source', manifest.heartime_cycle?.contract_version === HEARTIME_CYCLE_VERSION);
check('Heartime cycle is scoped and provider alarm remains non-canonical', manifest.heartime_cycle?.scope_key === 'reconciler_ref' && manifest.heartime_cycle?.provider_alarm_is_canonical === false);
check('compact summary limit matches source', manifest.summary_contract?.max_bytes === 65536);
for (const [name, version] of Object.entries(PORT_VERSIONS)) {
  check(`${name} port version matches source`, manifest.ports[name]?.contract_version === version);
}

const controller = read('circulation/attention/lib/controller.mjs');
const alarmCore = read('heartime/worker/src/alarm-core.mjs');
const heartimeIndex = read('heartime/worker/src/index.js');
const attentionIndex = read('circulation/attention/worker/src/index.js');
const postgrestState = read('heartime/worker/src/postgrest-state.mjs');
const tokenProvider = read('heartime/worker/src/token-provider.mjs');
const firstSeamMigration = read('heartime/migrations/20260823190000_heartime_first_seam.sql');
const productionSources = [
  controller,
  read('circulation/attention/lib/contract.mjs'),
  read('circulation/attention/lib/rpc-ports.mjs'),
  read('circulation/attention/worker/src/core.mjs'),
  attentionIndex,
  alarmCore,
  heartimeIndex,
  postgrestState,
  tokenProvider,
].join('\n');

check('test fixtures do not live in production lib', !fs.existsSync(path.join(root, 'circulation/attention/lib/in-memory.mjs')));
check('controller does not import test fixtures', !/fixtures|in-memory/.test(controller));
check('Heartime-facing result does not return a WakePack body', !/\bwake_pack\s*:/.test(controller));
check('Heartime has no public arm route', !/pathname\s*===\s*['"]\/arm['"]/.test(heartimeIndex));
check('Heartime control uses private WorkerEntrypoint', /HeartimeControl extends WorkerEntrypoint/.test(heartimeIndex));
check('attention control uses private WorkerEntrypoint', /AttentionReconciler extends WorkerEntrypoint/.test(attentionIndex));
check('Heartime beat hints use a strict reference-only allowlist', /const BEAT_FIELDS = new Set/.test(alarmCore) && /assertOnlyFields\(beat, BEAT_FIELDS/.test(alarmCore) && /resource_hint/.test(alarmCore));

check('Heartime routes the attention Service Binding through the versioned reconciler port', /createReconcilerRouter/.test(heartimeIndex) && /attentionBinding: this\.env\.ATTENTION_RECONCILER/.test(heartimeIndex));
check('physical Heartime reads only reconciler-scoped deadlines', /next_reconciliation_wake_v1/.test(postgrestState) && /p_reconciler_ref/.test(postgrestState));
check('physical clock is re-armed before an organ boundary and emission is durable', /Rearm before crossing an organ boundary/.test(alarmCore) && /next_expected = v_due/.test(firstSeamMigration) && /Open beats are durable current state/.test(firstSeamMigration));
check('canonical-state outage leaves a provider-local fallback alarm', /scheduleProviderFallback/.test(alarmCore) && /provider_fallback/.test(alarmCore));
check('summary guards recurse below the top level', /assertNoForbiddenKeys/.test(alarmCore) && /assertSummaryIsCompact/.test(read('circulation/attention/lib/contract.mjs')));
check('First Seam migration does not replace global Heartime next_wake', !/^create or replace function heartime\.next_wake\s*\(/im.test(firstSeamMigration));
check('open emitted beats are rediscovered from durable state', /Open beats are durable current state/.test(firstSeamMigration) && /reconciliation_observations o on o\.beat_id = b\.id/.test(firstSeamMigration));
check('PostgreSQL rejects non-compact summaries', /reconciliation_summary_is_compact/.test(firstSeamMigration) && /octet_length\(summary::text\) <= 65536/.test(firstSeamMigration));
check('runtime token is Registry-owned and versioned', /RegistryRuntimeTokenProvider/.test(tokenProvider) && /PORT_VERSIONS\.runtime_token/.test(tokenProvider));
check('production token path is short-lived rather than implicit static bearer', /REGISTRY_IDENTITY/.test(tokenProvider) && /HEARTIME_ALLOW_STATIC_BEARER/.test(tokenProvider));
check('PostgREST refreshes once on unauthorized token', /response\.status === 401/.test(postgrestState) && /forceRefresh: true/.test(postgrestState));
check('custom Heartime schema is selected explicitly', /content-profile': 'heartime'/.test(postgrestState) && /accept-profile': 'heartime'/.test(postgrestState));
check('First Seam grants custom-schema objects explicitly', /grant select, insert, update on heartime\.reconciliation_contracts/.test(firstSeamMigration) && /grant execute on function heartime\.prepare_cycle_v1/.test(firstSeamMigration));

const forbiddenMechanisms = [
  /from ['"]kafkajs['"]/,
  /from ['"]nats['"]/,
  /from ['"]ioredis['"]/,
  /from ['"]bullmq['"]/,
  /consumer[_-]?offset/i,
  /dead[_-]?letter/i,
  /reply[_-]?topic/i,
];
for (const pattern of forbiddenMechanisms) {
  check(`production seam does not depend on bus primitive ${pattern}`, !pattern.test(productionSources));
}

console.log(`FIRST SEAM CONTRACT: PASS · ${checks.length} checks`);
for (const label of checks) console.log(`  ok    ${label}`);
