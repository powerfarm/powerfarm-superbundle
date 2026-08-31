import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ATTESTATION_PATHS,
  sha256,
  sourceTreeManifestLines,
  trackedFiles,
} from './lib/release-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = path.join(root, 'evidence', 'organism-verification');
const logsRoot = path.join(evidenceRoot, 'logs');
const progressPath = path.join(evidenceRoot, 'progress.json');
const resumeRequested = process.env.POWERFARM_EVIDENCE_RESUME === '1';
if (!resumeRequested) fs.rmSync(evidenceRoot, { recursive: true, force: true });
fs.mkdirSync(logsRoot, { recursive: true });

const manifestLines = sourceTreeManifestLines(
  trackedFiles(root, { allowMissing: ATTESTATION_PATHS }),
);
const sourceTreeSha256 = sha256(manifestLines.join('\n'));

const commands = [
  { id: 'derive-check', command: 'npm', args: ['run', 'derive:check'] },
  { id: 'first-seam-contract', command: 'npm', args: ['run', 'contract:check'] },
  { id: 'capability-learning-contract', command: 'npm', args: ['run', 'contract:learning'] },
  { id: 'card-contract', command: 'npm', args: ['run', 'contract:card'] },
  { id: 'execution-slice-contract', command: 'npm', args: ['run', 'contract:execution'] },
  { id: 'recovery-contract', command: 'npm', args: ['run', 'contract:recovery'] },
  { id: 'epistemic-continuity-contract', command: 'npm', args: ['run', 'contract:epistemic'] },
  { id: 'energy-cost-contract', command: 'npm', args: ['run', 'contract:energy-cost'] },
  { id: 'production-circulation-contract', command: 'npm', args: ['run', 'contract:production'] },
  { id: 'legacy-removal-contract', command: 'npm', args: ['run', 'contract:legacy-removal'] },
  { id: 'source-check', command: 'npm', args: ['run', 'source:check'] },
  { id: 'permanent-checks', command: 'npm', args: ['run', 'check:permanent'] },
  { id: 'roster-tests', command: 'npm', args: ['run', 'test:roster'] },
  { id: 'card-tests', command: 'npm', args: ['run', 'test:cards'] },
  { id: 'first-seam-tests', command: 'npm', args: ['run', 'test:first-seam'] },
  { id: 'attention-setting-tests', command: 'npm', args: ['run', 'test:attention-worker'] },
  { id: 'first-seam-integration', command: 'npm', args: ['run', 'test:first-seam-integration'] },
  { id: 'card-circulation-integration', command: 'npm', args: ['run', 'test:card-circulation-integration'] },
  { id: 'sedimentation-tests', command: 'npm', args: ['run', 'test:sedimentation'] },
  { id: 'sedimentation-setting-tests', command: 'npm', args: ['run', 'test:sedimentation-worker'] },
  { id: 'capability-learning-integration', command: 'npm', args: ['run', 'test:capability-learning-integration'] },
  { id: 'heartime-setting-tests', command: 'npm', args: ['run', 'test:heartime-worker'] },
  { id: 'heartime-verify', command: 'npm', args: ['--prefix', 'heartime', 'run', 'verify'] },
  { id: 'database-policy', command: process.execPath, args: ['scripts/db-policy.mjs'] },
  { id: 'production-conformance', command: 'npm', args: ['run', 'test:production-conformance'] },
  { id: 'process-continuum', command: 'npm', args: ['run', 'test:process-continuum'] },
  { id: 'process-adk', command: 'npm', args: ['run', 'test:process-adk'] },
  { id: 'process-maf', command: 'npm', args: ['run', 'test:process-maf'] },
  { id: 'process-ai-sdk', command: 'npm', args: ['run', 'test:process-ai-sdk'] },
  { id: 'process-writer-setting', command: 'npm', args: ['run', 'test:process-worker'] },
  { id: 'ai-sdk-pin', command: 'npm', args: ['run', 'check:ai-sdk-pin'] },
  { id: 'maf-pin', command: 'npm', args: ['run', 'check:maf-pin'] },
  { id: 'engine-boundaries', command: 'npm', args: ['run', 'check:engine-boundaries'] },
  { id: 'documentation-conformance', command: 'npm', args: ['run', 'docs:check'] },
  { id: 'release-integrity-tests', command: 'npm', args: ['run', 'test:release-integrity'] },
];

let startedAt = new Date().toISOString();
let results = [];
if (resumeRequested && fs.existsSync(progressPath)) {
  const previous = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  if (previous.source_tree_sha256 === sourceTreeSha256 && Array.isArray(previous.commands)) {
    startedAt = previous.started_at ?? startedAt;
    results = previous.commands.filter((entry) => entry.exit_code === 0);
    console.log(`Resuming evidence: ${results.length}/${commands.length} commands already verified for source ${sourceTreeSha256}`);
  } else {
    fs.rmSync(evidenceRoot, { recursive: true, force: true });
    fs.mkdirSync(logsRoot, { recursive: true });
  }
}

function persistProgress() {
  fs.writeFileSync(progressPath, JSON.stringify({
    kind: 'powerfarm.superbundle.verification-progress.v1',
    started_at: startedAt,
    updated_at: new Date().toISOString(),
    source_tree_sha256: sourceTreeSha256,
    command_count: commands.length,
    commands: results,
  }, null, 2) + '\n');
}

const completed = new Set(results.map((entry) => entry.id));
let failed = false;
for (const item of commands) {
  if (completed.has(item.id)) continue;
  const start = Date.now();
  const run = spawnSync(item.command, item.args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTEST_ADDOPTS: `${process.env.PYTEST_ADDOPTS ?? ''} -p no:cacheprovider`.trim() },
  });
  const stdout = run.stdout ?? '';
  const stderr = run.stderr ?? '';
  fs.writeFileSync(path.join(logsRoot, `${item.id}.stdout.log`), stdout);
  fs.writeFileSync(path.join(logsRoot, `${item.id}.stderr.log`), stderr);
  const result = {
    id: item.id,
    command: [item.command, ...item.args],
    exit_code: run.status,
    signal: run.signal,
    duration_ms: Date.now() - start,
    stdout_sha256: sha256(stdout),
    stderr_sha256: sha256(stderr),
    tap_passes: Number((stdout.match(/^# pass (\d+)$/m) ?? [])[1] ?? 0),
    tap_failures: Number((stdout.match(/^# fail (\d+)$/m) ?? [])[1] ?? 0),
  };
  results.push(result);
  persistProgress();
  console.log(`${item.id}: ${run.status === 0 ? 'PASS' : 'FAIL'} (${result.duration_ms} ms)`);
  if (run.status !== 0) {
    failed = true;
    break;
  }
}

const productionObservationPath = path.join(root, 'evidence', 'supabase-production-observation-2026-08-23.json');
const productionObservation = fs.existsSync(productionObservationPath)
  ? {
      file: path.relative(root, productionObservationPath),
      sha256: sha256(fs.readFileSync(productionObservationPath)),
    }
  : null;

const report = {
  kind: 'powerfarm.superbundle.verification.v9',
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  source_tree_sha256: sourceTreeSha256,
  source_manifest_sha256: sha256(manifestLines.join('\n')),
  source_file_count: manifestLines.length,
  command_count: commands.length,
  status: failed ? 'FAILED' : 'BUILT AND VERIFIED',
  scope: 'local deterministic source, contract, controller, setting, integration, and migration-structure verification; no deployment claim',
  contracts: [
    'pf.contract.first-seam.v1',
    'pf.contract.capability-learning.v1',
    'pf.contract.card.v1',
    'pf.contract.execution-slice.v3',
    'pf.contract.card-recovery.v1',
    'pf.contract.epistemic-continuity.v1',
    'pf.contract.energy-cost.v1',
    'pf.contract.production-circulation.v1',
    'pf.contract.legacy-removal.v1',
    'powerfarm.operational-trace.v1',
  ],
  commands: results,
  deployment: {
    heartime_postgres_migrations: 'NOT RUN',
    heartime_cloudflare_settings: 'NOT DEPLOYED',
    attention_target_organ_ports: 'NOT DEPLOYED',
    capability_learning_registry_port: 'NOT DEPLOYED',
    capability_learning_evidence_port: 'NOT DEPLOYED',
    capability_learning_imagineering_port: 'NOT DEPLOYED',
    capability_learning_process_port: 'NOT DEPLOYED',
    admitted_learning_scope: 'NOT RUN',
    card_snapshot_store: 'NOT DEPLOYED',
    card_transition_ledger: 'NOT DEPLOYED',
    registry_directory_production_binding: 'BUILT AND VERIFIED; NOT DEPLOYED',
    process_postgres_admission_writer: 'BUILT AND VERIFIED; NOT DEPLOYED',
    process_writer_service_binding: 'BUILT AND VERIFIED; NOT DEPLOYED',
    registry_runtime_token_binding: 'BUILT AND VERIFIED IN PAIRED REGISTRY; NOT DEPLOYED',
    heartime_operational_trace_projection: 'BUILT AND VERIFIED; NOT DEPLOYED',
    recovery_runtime_path: 'LOCAL GOLDEN ONLY',
    epistemic_continuity_runtime: 'LOCAL MULTI-PROCESS GOLDEN ONLY',
    memory_evidence_production_binding: 'NOT DEPLOYED',
    platform_resource_metering_binding: 'LOCAL GOLDEN ONLY',
    homeostasis_resource_projection_runtime: 'LOCAL GOLDEN ONLY',
    live_cost_billing_source: 'NOT DEPLOYED',
    legacy_execution_bypasses: 'REMOVED AND VERIFIED LOCALLY',
    microsoft_agent_framework_setting: 'BUILT AND VERIFIED WITH THE PINNED REAL PACKAGE RUNTIME; NOT DEPLOYED',
    maf_memory_projection: 'BUILT AND VERIFIED READ-ONLY WITH THE PINNED REAL CONTEXTPROVIDER; NOT DEPLOYED',
    three_engine_equivalence: 'LOCAL THREE-ENGINE GOLDEN VERIFIED WITH PINNED ADK, AI SDK AND MAF RUNTIMES',
    whole_system_test: 'NOT RUN',
    production_observation: productionObservation,
  },
};

fs.writeFileSync(path.join(evidenceRoot, 'source-manifest.txt'), manifestLines.join('\n') + '\n');
fs.writeFileSync(path.join(evidenceRoot, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
if (!failed && results.length === commands.length) fs.rmSync(progressPath, { force: true });
console.log(`${report.status}: ${results.length}/${commands.length} commands · source ${sourceTreeSha256}`);
if (failed || results.length !== commands.length) process.exitCode = 1;
