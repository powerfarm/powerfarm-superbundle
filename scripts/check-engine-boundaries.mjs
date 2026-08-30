import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aiSdkSettingSource = path.join(root, 'process', 'continuum-ai-sdk', 'src');
const mafSettingSource = path.join(root, 'process', 'continuum-maf', 'src');
const institutionalRoots = [
  'heartime', 'circulation', 'roster', 'conformance',
  'process/continuum', 'process/continuum-adk',
].map(rel => path.join(root, rel));
const codeExt = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py']);
const aiSdkPatterns = [/@ai-sdk\//, /from\s+['"]ai['"]/, /require\(['"]ai['"]\)/, /engines\/ai-sdk\/upstream/];
const mafPatterns = [/\bfrom\s+agent_framework\b/, /\bimport\s+agent_framework\b/, /agent-framework-core/];
const authorityMintPatterns = [/office\.create/, /occupancy\.assign/, /authority\.grant/, /identity\.key\.register/];
const memoryAuthorityPatterns = [/epistemic\./, /powerfarm\.epistemic-record/, /MEMORY\s*=\s*['"]authoritative['"]/i];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && codeExt.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

for (const dir of institutionalRoots) {
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of [...aiSdkPatterns, ...mafPatterns]) {
      assert.equal(pattern.test(text), false, `engine ontology leaked across boundary: ${path.relative(root, file)} matched ${pattern}`);
    }
  }
}

for (const [label, settingSource] of [['AI SDK', aiSdkSettingSource], ['Microsoft Agent Framework', mafSettingSource]]) {
  for (const file of walk(settingSource)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of authorityMintPatterns) {
      assert.equal(pattern.test(text), false, `${label} Setting must spend, not mint authority: ${path.relative(root, file)} matched ${pattern}`);
    }
  }
}

for (const file of walk(mafSettingSource)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of memoryAuthorityPatterns) {
    assert.equal(pattern.test(text), false, `MAF engine-local memory must not become PowerFarm MEMORY: ${path.relative(root, file)} matched ${pattern}`);
  }
}

const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/runtime-engine-boundary.v1.json'), 'utf8'));
assert.equal(contract.owner, 'Process');
assert.equal(contract.institutional_kernel, 'Continuum');
assert.equal(contract.engines['vercel-ai-sdk'].setting, 'process/continuum-ai-sdk');
assert.equal(contract.engines['google-adk'].setting, 'process/continuum-adk');
assert.equal(contract.engines['microsoft-agent-framework'].setting, 'process/continuum-maf');
assert.equal(contract.engines['microsoft-agent-framework'].tested_pin, 'agent-framework-core==1.16.0');
assert.ok(contract.invariants.some(value => value.includes('never the PowerFarm MEMORY organ')));
console.log('Engine boundaries verified: ADK, AI SDK and Microsoft Agent Framework remain replaceable Settings; none can mint authority or own PowerFarm MEMORY.');
