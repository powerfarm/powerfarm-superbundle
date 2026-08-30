import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipped = new Set(['.git', 'node_modules', 'evidence']);

function collect(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collect(absolute));
    else if (/\.(?:mjs|js)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

const files = collect(root).sort();
const failures = [];
for (const file of files) {
  const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (run.status !== 0) failures.push({ file: path.relative(root, file), stderr: run.stderr });
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`SOURCE CHECK FAILED: ${failure.file}`);
    console.error(failure.stderr);
  }
  process.exit(1);
}
console.log(`SOURCE CHECK: PASS · ${files.length} JavaScript modules`);
