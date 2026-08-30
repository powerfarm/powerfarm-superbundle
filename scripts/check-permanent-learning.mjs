import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (message) => console.log(`  ok    ${message}`);
const fail = (message) => { failures.push(message); console.log(`  FALHA ${message}`); };
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const walk = (directory) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else files.push(target);
  }
  return files;
};

console.log('\nCAPABILITY LEARNING — permanent-foundation guards\n');

const required = [
  'canon/02-capability-learning-and-sedimentation.md',
  'canon/02.release.json',
  'contracts/capability-learning.v1.json',
  'contracts/capability-learning.md',
  'contracts/capability-learning-ports.md',
  'circulation/sedimentation/lib/contract.mjs',
  'circulation/sedimentation/lib/controller.mjs',
  'circulation/sedimentation/lib/rpc-ports.mjs',
  'circulation/sedimentation/worker/src/index.js',
  'heartime/migrations/20260824120000_heartime_capability_learning.sql',
  'conformance/capability-learning/capability-learning.integration.test.mjs',
  'operations/capability-learning-admission.md',
];
const missing = required.filter((file) => !exists(file));
if (missing.length) fail(`permanent learning artifact set is incomplete: ${missing.join(', ')}`);
else ok('permanent learning artifact set is complete');

if (exists('circulation/learning')) fail('a competing prototype learning controller remains beside sedimentation');
else ok('one canonical capability-learning implementation exists');

const production = walk(path.join(root, 'circulation/sedimentation'))
  .filter((file) => /\.(?:mjs|js)$/.test(file))
  .filter((file) => !file.includes(`${path.sep}tests${path.sep}`));
const testImports = production.filter((file) => /tests\/fixtures|in-memory/.test(fs.readFileSync(file, 'utf8')));
if (testImports.length) fail(`production learning code imports test doubles: ${testImports.map((f) => path.relative(root, f)).join(', ')}`);
else ok('production learning code is independent of test doubles');

const portable = walk(path.join(root, 'circulation/sedimentation/lib'))
  .filter((file) => /\.(?:mjs|js)$/.test(file));
const nodeImports = portable.filter((file) => /from ['"]node:/.test(fs.readFileSync(file, 'utf8')));
if (nodeImports.length) fail(`portable learning core imports Node-only modules: ${nodeImports.map((f) => path.relative(root, f)).join(', ')}`);
else ok('portable learning core has no Node-only imports');

const controller = read('circulation/sedimentation/lib/controller.mjs');
const contract = read('circulation/sedimentation/lib/contract.mjs');
const worker = read('circulation/sedimentation/worker/src/index.js');
const machine = read('contracts/capability-learning.v1.json');
if (/active_occupancy\s*=(?!=)|\.active_occupancy\.[a-z_]+\s*=(?!=)/.test(controller)) fail('controller mutates Registry occupancy directly');
else ok('controller cannot mutate Registry occupancy directly');
if (/\b(?:activate|promote)\s*\(/.test(controller + worker)) fail('learning setting exposes direct activation or promotion');
else ok('promotion remains outside the learning controller');
if (!/process\.ensureTransitionProposal/.test(controller)) fail('Process-owned proposal boundary is absent');
else ok('Process owns transition proposals');
if (!/imagineering\.ensureConstruction/.test(controller) || !/imagineering\.ensureEvaluation/.test(controller)) {
  fail('Imagineering-owned construction/evaluation boundary is absent');
} else ok('Imagineering owns provisional construction and evaluation');
if (!/assessment\.observed_cost_per_run/.test(controller)
    || !/assessment\.observed_quality_score/.test(contract)
    || !/assessment\.observed_latency_ms/.test(controller)
    || !/assessment\.observed_cognition_fraction/.test(controller)) {
  fail('promotion still depends on candidate narration rather than observed assessment');
} else ok('promotion criteria use independently observed economics and cognition');
if (!/from_occupancy_ref:\s*scope\.active_occupancy\.ref/.test(controller)
    || !/to_cognition_fraction:\s*toCognitionFraction/.test(controller)
    || !/Process returned proposal with mismatched/.test(controller)) {
  fail('transition proposal does not bind exact source occupancy and target strategy');
} else ok('transition proposals bind exact source occupancy and target strategy');
if (!/fallback_implementation_revision/.test(contract) || !/fallback_substrate/.test(contract)) {
  fail('fallback lineage is not exact');
} else ok('fallback lineage names implementation, revision, and substrate');
if (!/status: 404/.test(worker)) fail('sedimentation Worker public HTTP surface is open');
else ok('sedimentation Worker public HTTP surface is closed');
if (/vivado|verilator|yosys|circt|calyx|fpga toolchain|asic toolchain/i.test(controller + contract + worker)) {
  fail('physical hardware toolchain leaked into the digital protocol');
} else ok('capability learning remains 100% digital');

const docs = [
  'README.md',
  'canon/02-capability-learning-and-sedimentation.md',
  'contracts/capability-learning.md',
  'circulation/sedimentation/README.md',
  'operations/capability-learning-admission.md',
].map((file) => [file, read(file)]);
const prototypeLanguage = docs.filter(([, text]) => /status:\s*prototype|disposable prototype|proof[- ]of[- ]concept|\bPOC\b/i.test(text));
if (prototypeLanguage.length) fail(`permanent learning seam is described as a prototype: ${prototypeLanguage.map(([f]) => f).join(', ')}`);
else ok('learning seam is not described as a prototype');

const parsed = JSON.parse(machine);
if (parsed.status !== 'permanent') fail('machine contract is not marked permanent');
else ok('machine contract is marked permanent');
if (!parsed.laws?.includes('All substrates are digital; hardware terminology is analogy only.')) {
  fail('digital-only law is absent from the machine contract');
} else ok('digital-only law is machine-readable');

if (failures.length) {
  console.error(`\nCAPABILITY LEARNING PERMANENCE: FALHA — ${failures.length} problema(s)\n`);
  process.exit(1);
}
console.log('\nCAPABILITY LEARNING PERMANENCE: PASSA\n');
