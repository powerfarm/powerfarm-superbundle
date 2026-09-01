import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (message) => console.log(`  ok    ${message}`);
const fail = (message) => {
  failures.push(message);
  console.log(`  FALHA ${message}`);
};

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(target));
    else out.push(target);
  }
  return out;
};
const jsFiles = (relative, { productionOnly = false } = {}) => walk(path.join(root, relative))
  .filter((file) => /\.(?:mjs|js)$/.test(file))
  .filter((file) => !productionOnly || !file.includes(`${path.sep}tests${path.sep}`));

console.log('\nORGANISM — permanent-foundation guards\n');

for (const seam of ['attention', 'sedimentation']) {
  const production = jsFiles(`circulation/${seam}`, { productionOnly: true });
  const testImports = production.filter((file) => /tests\/fixtures|testing\/in-memory|\/fixtures\/in-memory/.test(fs.readFileSync(file, 'utf8')));
  if (testImports.length) {
    fail(`production ${seam} code imports test doubles: ${testImports.map((file) => path.relative(root, file)).join(', ')}`);
  } else {
    ok(`production ${seam} code is independent of test doubles`);
  }

  const portable = jsFiles(`circulation/${seam}/lib`);
  const nodeImports = portable.filter((file) => /from ['"]node:/.test(fs.readFileSync(file, 'utf8')));
  if (nodeImports.length) {
    fail(`portable ${seam} core imports Node-only modules: ${nodeImports.map((file) => path.relative(root, file)).join(', ')}`);
  } else {
    ok(`portable ${seam} core has no Node-only imports`);
  }
}

const heartimeSource = read('heartime/worker/src/index.js');
const heartimeRouter = read('heartime/worker/src/rpc-ports.mjs');
const postgrestState = read('heartime/worker/src/postgrest-state.mjs');
const alarmCore = read('heartime/worker/src/alarm-core.mjs');
const attentionSource = read('circulation/attention/worker/src/index.js');
const attentionCore = read('circulation/attention/worker/src/core.mjs');
const sedimentationSource = read('circulation/sedimentation/worker/src/index.js');
const sedimentationCore = read('circulation/sedimentation/worker/src/core.mjs');
const sedimentationController = read('circulation/sedimentation/lib/controller.mjs');
const sedimentationContract = read('circulation/sedimentation/lib/contract.mjs');

if (/pathname\s*===\s*['"]\/arm/.test(heartimeSource)) fail('Heartime exposes a public /arm route');
else ok('Heartime control remains private RPC');
for (const [label, source] of [['attention', attentionSource], ['sedimentation', sedimentationSource]]) {
  if (!/status:\s*404/.test(source)) fail(`${label} Worker lacks a closed public HTTP surface`);
  else ok(`${label} Worker public HTTP surface is closed`);
}

if (!/FORBIDDEN_WAKE_FIELDS/.test(alarmCore) || !/wake_pack/.test(alarmCore)) fail('Heartime wake payload guard is absent');
else ok('Heartime wake rejects Card/WakePack payloads');
if (!/validateSummary/.test(alarmCore)) fail('Heartime does not delegate compact-summary validation to each reconciler contract');
else ok('Heartime validates summaries through reconciler-specific contracts');

const firstContractSource = read('circulation/attention/lib/contract.mjs');
const firstContractManifest = read('contracts/first-seam.v1.json');
if (/FIRST_SEAM_VERSION\b/.test(firstContractSource) || /powerfarm\.first-seam\.v1/.test(firstContractManifest)) {
  fail('obsolete duplicate First Seam version identity remains');
} else ok('First Seam has one canonical contract identity and schema version');
if (!/pf\.contract\.capability-learning\.v1/.test(read('contracts/capability-learning.v1.json'))) {
  fail('Capability Learning lacks a permanent machine contract identity');
} else ok('Capability Learning has a permanent machine contract identity');

if (!/beat_ref:\s*hint\?\.beat_ref/.test(heartimeRouter) || !/validatedCaller\.beat_ref !== wake\.beat_ref/.test(attentionCore)) {
  fail('Heartime-to-attention caller attribution is not bound to the exact BeatRef');
} else ok('Heartime-to-attention caller attribution is bound to the exact BeatRef');
if (!/validatedCaller\.beat_ref !== wake\.beat_ref/.test(sedimentationCore)) {
  fail('Heartime-to-sedimentation caller attribution is not bound to the exact BeatRef');
} else ok('Heartime-to-sedimentation caller attribution is bound to the exact BeatRef');

if (!/EXPECTED_CONTROL_IDENTITY_REF/.test(heartimeSource)) fail('Heartime private control port lacks explicit caller identity admission');
else ok('Heartime private control port admits an explicit canonical caller identity');

if (!/attentionBinding/.test(heartimeRouter) || !/sedimentationBinding/.test(heartimeRouter)) {
  fail('Heartime router does not admit both permanent reconciler bindings');
} else ok('Heartime router admits attention and sedimentation as separate versioned bindings');
if (!/HEARTIME_RECONCILER_REF/.test(postgrestState) || !/reconcilerRef/.test(postgrestState)) {
  fail('physical Heartime cannot be configured by canonical ReconcilerRef');
} else ok('one permanent Heartime setting can serve multiple reconciler identities');

if (!exists('conformance/first-seam/first-seam.integration.test.mjs')) fail('First Seam has no vertical Heartime-to-Card integration test');
else ok('First Seam includes a vertical Heartime-to-Card integration test');
if (!exists('conformance/capability-learning/capability-learning.integration.test.mjs')) fail('Capability Learning has no vertical harden/soften integration test');
else ok('Capability Learning includes a vertical harden/soften integration test');

const forbiddenDirectConsequence = /\b(?:activate|promote|replaceOccupancy|setActiveImplementation|updateOccupancy)\s*\(/;
if (forbiddenDirectConsequence.test(sedimentationController) || forbiddenDirectConsequence.test(sedimentationCore)) {
  fail('sedimentation reconciler can directly activate or promote an implementation');
} else ok('sedimentation reconciler can propose but cannot activate or promote');
if (!/ensureConstruction/.test(sedimentationController) || !/ensureEvaluation/.test(sedimentationController)) {
  fail('sedimentation does not route construction and independent evaluation through Imagineering');
} else ok('sedimentation routes construction and independent evaluation through Imagineering');
if (!/ensureTransitionProposal/.test(sedimentationController)) {
  fail('sedimentation does not route succession through Process');
} else ok('sedimentation routes succession through Process');
if (!/assessment\.evaluated_by === candidate\.authored_by/.test(sedimentationContract)) {
  fail('candidate authorship is not separated from independent evaluation');
} else ok('candidate author cannot serve as independent evaluator');
if (!/fallback_implementation_ref/.test(sedimentationContract)) {
  fail('hardened occupancy has no formal fallback reference');
} else ok('hardened occupancy carries a formal fallback path');
if (!/SUBSTRATES = Object\.freeze\(\['inference', 'configuration', 'fixed'\]\)/.test(sedimentationContract)) {
  fail('digital substrate order is absent or unstable');
} else ok('substrate succession is explicit and entirely digital');

const migrations = walk(path.join(root, 'heartime/migrations')).filter((file) => file.endsWith('.sql'));
if (migrations.length < 6) fail('Heartime hardening/capability learning/production/identity migrations are incomplete');
else ok('Heartime evolves through six timestamped migrations');
const migrationNames = migrations.map((file) => path.basename(file)).sort();
const nonCanonicalMigrationNames = migrationNames.filter((name) => !/^\d{14}_[a-z][a-z0-9_]*\.sql$/.test(name));
if (nonCanonicalMigrationNames.length) fail(`Heartime migration names do not use full timestamps: ${nonCanonicalMigrationNames.join(', ')}`);
else ok('Heartime migration order uses unambiguous full timestamps');
const expectedMigrationOrder = [
  '20260823000000_heartime_genesis.sql',
  '20260823190000_heartime_first_seam.sql',
  '20260824120000_heartime_capability_learning.sql',
  '20260830012500_heartime_writer_hardening.sql',
  '20260830074000_heartime_operational_projections.sql',
  // Which institution does this Heartime database serve? Genesis creates an
  // institution; recovery never does.
  '20260901120000_heartime_institution_identity.sql',
];
if (JSON.stringify(migrationNames) !== JSON.stringify(expectedMigrationOrder)) {
  fail(`Heartime migration set/order differs from the admitted permanent sequence: ${migrationNames.join(', ')}`);
} else ok('Heartime migrations preserve the admitted permanent sequence');

const docs = [
  'README.md',
  'proposals/first-seam.md',
  'circulation/attention/README.md',
  'circulation/sedimentation/README.md',
  'contracts/capability-learning.md',
  'operations/capability-learning-admission.md',
].map((file) => [file, read(file)]);
const prototypeLanguage = docs.filter(([, text]) => /status:\s*prototype|disposable prototype|throwaway prototype|proof[- ]of[- ]concept|(?:is|as) (?:a )?reference implementation/i.test(text));
if (prototypeLanguage.length) fail(`permanent foundation is described as a prototype/reference implementation: ${prototypeLanguage.map(([file]) => file).join(', ')}`);
else ok('permanent foundations are not described as prototypes');

const dependencySources = ['package.json', 'heartime/package.json', ...jsFiles('circulation/sedimentation', { productionOnly: true })]
  .map((file) => path.isAbsolute(file) ? fs.readFileSync(file, 'utf8') : read(file))
  .join('\n');
if (/kafka|nats|rabbit|redis|bullmq|sqs|pubsub/i.test(dependencySources)) fail('authoritative message-broker dependency introduced');
else ok('no authoritative message-broker dependency exists');
if (/verilog|vhdl|vivado|yosys|circt|calyx|fpga|asic|cuda/i.test(dependencySources)) fail('physical hardware or accelerator toolchain entered the digital learning seam');
else ok('no physical hardware or accelerator toolchain is present');

if (failures.length) {
  console.error(`\nORGANISM PERMANENCE: FALHA — ${failures.length} problema(s)\n`);
  process.exit(1);
}
console.log('\nORGANISM PERMANENCE: PASSA\n');
