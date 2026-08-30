import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bannedDirectories = new Set(['node_modules', '.next', '.pytest_cache', '__pycache__', '.venv', 'coverage']);
const bannedExtensions = new Set(['.woff', '.woff2', '.ttf', '.otf', '.pyc', '.pyo', '.tsbuildinfo']);
const privateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const maxGitHubFileBytes = 95 * 1024 * 1024;
const violations = [];
let files = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (bannedDirectories.has(entry.name)) violations.push(`${rel}/: generated/cache directory must not be committed`);
      else walk(abs);
      continue;
    }
    files += 1;
    const ext = path.extname(entry.name).toLowerCase();
    if (bannedExtensions.has(ext)) violations.push(`${rel}: binary font/build artifact must not be committed in this GitHub package`);
    if (entry.name === '.env') violations.push(`${rel}: live environment file must not be committed`);
    const stat = fs.statSync(abs);
    if (stat.size > maxGitHubFileBytes) violations.push(`${rel}: exceeds 95 MiB GitHub package guard`);
    const sealedUpstream = rel.startsWith('engines/ai-sdk/upstream/');
    if (!sealedUpstream && stat.size <= 2 * 1024 * 1024 && !['.png', '.jpg', '.jpeg', '.webp', '.ico', '.pdf', '.zip', '.gz'].includes(ext)) {
      const text = fs.readFileSync(abs, 'utf8');
      if (privateKeyPattern.test(text)) violations.push(`${rel}: private key material detected`);
    }
  }
}
walk(root);
assert.equal(violations.length, 0, `GitHub package hygiene failed:\n- ${violations.join('\n- ')}`);
console.log(`GITHUB PACKAGE: PASS · ${files} files · no font binaries, caches, private keys, or oversized files`);
