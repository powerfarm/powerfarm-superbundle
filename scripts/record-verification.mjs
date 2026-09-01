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

// Every recorded command declares what class of proof it produces, so a reader
// never has to infer it from the command name:
//
//   structural            — inspects source, shape, digests or documents; proves
//                           the artifact looks right, not that an interface works
//   derived               — recomputes derived metadata and compares it to what
//                           is committed
//   executable-local      — runs code in-process against in-memory or SQLite
//                           doubles
//   executable-integration— runs code across a real interface (a real PostgreSQL
//                           engine, a real pinned engine runtime, a subprocess)
//
// `reporter` says how assertion counts are read out of stdout. `null` means the
// command reports no assertion counts at all, so `assertions_passed: null` must
// never be read as "zero tests passed".
//
// `npm run check:release-integrity` is deliberately absent: it verifies this
// report and the release manifest, so running it here would be circular. It is a
// gate over the finished evidence, not an input to it, and `npm run verify` runs
// it after this report has been written.
const commands = [
  { id: 'derive-check', command: 'npm', args: ['run', 'derive:check'], kind: 'derived', reporter: null },
  { id: 'first-seam-contract', command: 'npm', args: ['run', 'contract:check'], kind: 'structural', reporter: null },
  { id: 'capability-learning-contract', command: 'npm', args: ['run', 'contract:learning'], kind: 'structural', reporter: null },
  { id: 'card-contract', command: 'npm', args: ['run', 'contract:card'], kind: 'structural', reporter: null },
  { id: 'execution-slice-contract', command: 'npm', args: ['run', 'contract:execution'], kind: 'structural', reporter: null },
  { id: 'recovery-contract', command: 'npm', args: ['run', 'contract:recovery'], kind: 'structural', reporter: null },
  { id: 'epistemic-continuity-contract', command: 'npm', args: ['run', 'contract:epistemic'], kind: 'structural', reporter: null },
  { id: 'energy-cost-contract', command: 'npm', args: ['run', 'contract:energy-cost'], kind: 'structural', reporter: null },
  { id: 'production-circulation-contract', command: 'npm', args: ['run', 'contract:production'], kind: 'structural', reporter: null },
  { id: 'legacy-removal-contract', command: 'npm', args: ['run', 'contract:legacy-removal'], kind: 'structural', reporter: null },
  { id: 'source-check', command: 'npm', args: ['run', 'source:check'], kind: 'structural', reporter: null },
  { id: 'permanent-checks', command: 'npm', args: ['run', 'check:permanent'], kind: 'structural', reporter: null },
  { id: 'roster-tests', command: 'npm', args: ['run', 'test:roster'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'card-tests', command: 'npm', args: ['run', 'test:cards'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'first-seam-tests', command: 'npm', args: ['run', 'test:first-seam'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'attention-setting-tests', command: 'npm', args: ['run', 'test:attention-worker'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'first-seam-integration', command: 'npm', args: ['run', 'test:first-seam-integration'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'card-circulation-integration', command: 'npm', args: ['run', 'test:card-circulation-integration'], kind: 'executable-integration', reporter: 'node-test' },
  { id: 'sedimentation-tests', command: 'npm', args: ['run', 'test:sedimentation'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'sedimentation-setting-tests', command: 'npm', args: ['run', 'test:sedimentation-worker'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'capability-learning-integration', command: 'npm', args: ['run', 'test:capability-learning-integration'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'heartime-setting-tests', command: 'npm', args: ['run', 'test:heartime-worker'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'heartime-verify', command: 'npm', args: ['--prefix', 'heartime', 'run', 'verify'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'database-policy', command: process.execPath, args: ['scripts/db-policy.mjs'], kind: 'structural', reporter: null },
  { id: 'production-conformance', command: 'npm', args: ['run', 'test:production-conformance'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'process-continuum', command: 'npm', args: ['run', 'test:process-continuum'], kind: 'executable-local', reporter: 'pytest' },
  { id: 'process-adk', command: 'npm', args: ['run', 'test:process-adk'], kind: 'executable-integration', reporter: 'pytest' },
  { id: 'process-maf', command: 'npm', args: ['run', 'test:process-maf'], kind: 'executable-integration', reporter: 'pytest' },
  { id: 'process-ai-sdk', command: 'npm', args: ['run', 'test:process-ai-sdk'], kind: 'executable-integration', reporter: 'node-test' },
  { id: 'process-writer-setting', command: 'npm', args: ['run', 'test:process-worker'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'ai-sdk-pin', command: 'npm', args: ['run', 'check:ai-sdk-pin'], kind: 'structural', reporter: null },
  { id: 'maf-pin', command: 'npm', args: ['run', 'check:maf-pin'], kind: 'structural', reporter: null },
  { id: 'engine-boundaries', command: 'npm', args: ['run', 'check:engine-boundaries'], kind: 'structural', reporter: null },
  { id: 'documentation-conformance', command: 'npm', args: ['run', 'docs:check'], kind: 'structural', reporter: null },
  { id: 'release-integrity-tests', command: 'npm', args: ['run', 'test:release-integrity'], kind: 'executable-local', reporter: 'node-test' },
  { id: 'heartime-migration-structure', command: 'npm', args: ['run', 'test:heartime-migrations'], kind: 'structural', reporter: null },
  { id: 'heartime-postgres-integration', command: 'npm', args: ['run', 'test:heartime-postgres'], kind: 'executable-integration', reporter: 'node-test' },
  { id: 'process-postgres-integration', command: 'npm', args: ['run', 'test:process-postgres'], kind: 'executable-integration', reporter: 'node-test' },
];

// Assertion counts are only meaningful when the command actually reports them.
// A command with no reporter gets null, never 0: "this command reports no counts"
// and "this command ran zero tests" are different facts and must not be conflated.
function assertionCounts(reporter, stdout) {
  if (reporter === 'node-test') {
    // `node --test` reports through TAP (`# pass N`) or through the spec reporter
    // (`\u2139 pass N`) depending on Node version and whether stdout is a TTY.
    // Match both, and return null rather than 0 when neither is present, so a
    // reporter change can never silently degrade into "ran zero tests".
    const passed = stdout.match(/^# pass (\d+)$/m) ?? stdout.match(/^\u2139 pass (\d+)$/m);
    const failed = stdout.match(/^# fail (\d+)$/m) ?? stdout.match(/^\u2139 fail (\d+)$/m);
    return {
      assertions_passed: passed ? Number(passed[1]) : null,
      assertions_failed: failed ? Number(failed[1]) : null,
    };
  }
  if (reporter === 'pytest') {
    const passed = stdout.match(/(\d+) passed/);
    const failed = stdout.match(/(\d+) failed/);
    const skipped = stdout.match(/(\d+) skipped/);
    return {
      assertions_passed: passed ? Number(passed[1]) : null,
      assertions_failed: failed ? Number(failed[1]) : 0,
      assertions_skipped: skipped ? Number(skipped[1]) : 0,
    };
  }
  return { assertions_passed: null, assertions_failed: null };
}

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
    kind: item.kind,
    command: [item.command, ...item.args],
    exit_code: run.status,
    signal: run.signal,
    duration_ms: Date.now() - start,
    stdout_sha256: sha256(stdout),
    stderr_sha256: sha256(stderr),
    assertion_reporter: item.reporter,
    ...assertionCounts(item.reporter, stdout),
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

const byKind = (name) => results.filter((entry) => entry.kind === name);
// Summing over commands that report nothing must yield null, not 0. A class with
// no reported assertions has not "passed zero assertions"; it reports none.
const sumOrNull = (entries, field) => {
  const numbers = entries.map((entry) => entry[field]).filter((value) => typeof value === 'number');
  return numbers.length === 0 ? null : numbers.reduce((sum, value) => sum + value, 0);
};
const summarize = (name) => {
  const entries = byKind(name);
  return {
    commands: entries.length,
    all_exit_zero: entries.length > 0 && entries.every((entry) => entry.exit_code === 0),
    commands_reporting_assertions: entries.filter((entry) => typeof entry.assertions_passed === 'number').length,
    assertions_passed: sumOrNull(entries, 'assertions_passed'),
    assertions_failed: sumOrNull(entries, 'assertions_failed'),
  };
};

const report = {
  kind: 'powerfarm.superbundle.verification.v10',
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  source_tree_sha256: sourceTreeSha256,
  source_manifest_sha256: sha256(manifestLines.join('\n')),
  source_file_count: manifestLines.length,
  command_count: commands.length,
  status: failed ? 'FAILED' : 'BUILT AND VERIFIED',
  scope: 'local deterministic source, contract, controller, setting, integration, and migration-structure verification; no deployment claim',
  // What each class of recorded command does and does not prove. Read this
  // before reading `status`.
  evidence_semantics: {
    structural: 'inspects source, shape, digests or documents. Proves the artifact looks right. Does NOT prove any interface works.',
    derived: 'recomputes derived metadata from source and compares it to what is committed. Proves the committed metadata is current, not that the underlying behaviour is correct.',
    'executable-local': 'runs code in-process against in-memory or SQLite doubles. Proves in-process behaviour. Does NOT prove behaviour against a production interface.',
    'executable-integration': 'runs code across a real interface — a real PostgreSQL engine, a pinned real engine runtime, or a subprocess boundary. Proves the wire, not the deployment.',
    external: 'NOT PRESENT IN THIS REPORT. Nothing here runs against a deployed PowerFarm, a live Registry, a live Cloudflare binding, or a hosted PostgreSQL instance.',
    assertion_counts: 'assertions_passed is null when the command reports no counts. null is not zero.',
    status_meaning: '"BUILT AND VERIFIED" means every recorded command exited zero at the recorded source digest. It is not a deployment readiness claim.',
  },
  proof_classes: {
    structural: summarize('structural'),
    derived: summarize('derived'),
    'executable-local': summarize('executable-local'),
    'executable-integration': summarize('executable-integration'),
    external: { commands: 0, all_exit_zero: false, commands_reporting_assertions: 0, assertions_passed: null, assertions_failed: null },
  },
  contracts: [
    'pf.contract.first-seam.v1',
    'pf.contract.capability-learning.v1',
    'pf.contract.card.v1',
    'pf.contract.execution-slice.v4',
    'pf.contract.card-recovery.v1',
    'pf.contract.epistemic-continuity.v1',
    'pf.contract.energy-cost.v1',
    'pf.contract.production-circulation.v1',
    'pf.contract.legacy-removal.v1',
    'powerfarm.operational-trace.v1',
  ],
  commands: results,
  deployment: {
    heartime_postgres_migrations: 'APPLIED IN ORDER AGAINST A DISPOSABLE IN-PROCESS POSTGRESQL (pglite); NOT RUN AGAINST A HOSTED DATABASE',
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
    process_postgres_admission_writer: 'WIRE VERIFIED AGAINST A DISPOSABLE IN-PROCESS POSTGRESQL (pglite) THROUGH THE WORKER PostgREST TRANSPORT; NOT DEPLOYED. The in-process Continuum Kernel still makes the canonical admission decision, so this path persists already-admitted acts and is not itself the admission boundary.',
    process_writer_service_binding: 'BUILT AND VERIFIED; NOT DEPLOYED',
    registry_runtime_token_binding: 'BUILT AND VERIFIED IN PAIRED REGISTRY; NOT DEPLOYED',
    heartime_operational_trace_projection: 'RPC SIGNATURE AND REDACTION VERIFIED AGAINST A DISPOSABLE IN-PROCESS POSTGRESQL (pglite); NOT DEPLOYED',
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
    canonical_process_commit_decision: 'UNRESOLVED. SQLite-versus-PostgreSQL canonical commit is an open constitutional decision; no dual-write was introduced to hide it.',
    delegated_authority_decision: 'UNRESOLVED. Authority grant/revoke remains root-only in the kernel; canon describes descending Authority.',
    execution_slice_resource_window: 'ENFORCED LOCALLY. powerfarm.execution-slice.v4 seals resources.evaluated_at and both authorization windows, and AI SDK, ADK and MAF revalidate them against an injectable clock immediately before the external effect. Negative controls cover expiry after derivation, the exclusive expires_at boundary, a rewound clock, and occupant/engine identity failing to widen a window.',
    production_observation: productionObservation,
  },
};

fs.writeFileSync(path.join(evidenceRoot, 'source-manifest.txt'), manifestLines.join('\n') + '\n');
fs.writeFileSync(path.join(evidenceRoot, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
if (!failed && results.length === commands.length) fs.rmSync(progressPath, { force: true });
console.log(`${report.status}: ${results.length}/${commands.length} commands · source ${sourceTreeSha256}`);
if (failed || results.length !== commands.length) process.exitCode = 1;
