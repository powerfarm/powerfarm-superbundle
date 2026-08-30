import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterSource = path.join(root, 'process', 'continuum-ai-sdk', 'src');
const institutionalRoots = [
  'heartime', 'circulation', 'roster', 'conformance',
  'process/continuum', 'process/continuum-adk',
].map(rel => path.join(root, rel));
const codeExt = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py']);
const enginePatterns = [/@ai-sdk\//, /from\s+['"]ai['"]/, /require\(['"]ai['"]\)/, /engines\/ai-sdk\/upstream/];
const authorityMintPatterns = [/office\.create/, /occupancy\.assign/, /authority\.grant/, /identity\.key\.register/];

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
    for (const pattern of enginePatterns) {
      assert.equal(pattern.test(text), false, `engine ontology leaked across boundary: ${path.relative(root, file)} matched ${pattern}`);
    }
  }
}

for (const file of walk(adapterSource)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of authorityMintPatterns) {
    assert.equal(pattern.test(text), false, `AI SDK Setting must spend, not mint authority: ${path.relative(root, file)} matched ${pattern}`);
  }
}

const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/runtime-engine-boundary.v1.json'), 'utf8'));
assert.equal(contract.owner, 'Process');
assert.equal(contract.institutional_kernel, 'Continuum');
assert.equal(contract.engines['vercel-ai-sdk'].setting, 'process/continuum-ai-sdk');
assert.equal(contract.engines['google-adk'].setting, 'process/continuum-adk');
console.log('Engine boundaries verified: institutional code is engine-neutral; Settings cannot mint authority.');
