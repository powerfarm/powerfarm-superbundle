import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { trackedFiles } from './lib/release-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bannedDirectories = new Set(['node_modules', '.next', '.pytest_cache', '__pycache__', '.venv', 'coverage']);
const bannedExtensions = new Set(['.woff', '.woff2', '.ttf', '.otf', '.pyc', '.pyo', '.tsbuildinfo']);
const privateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const maxGitHubFileBytes = 95 * 1024 * 1024;
const violations = [];
const tracked = trackedFiles(root);
for (const [rel, bytes] of tracked) {
  const parts = rel.split('/');
  const bannedDirectory = parts.slice(0, -1).find((part) => bannedDirectories.has(part));
  if (bannedDirectory) {
    violations.push(`${rel}: generated/cache directory must not be committed`);
  }
  const name = parts.at(-1);
  const ext = path.extname(name).toLowerCase();
  if (bannedExtensions.has(ext)) violations.push(`${rel}: binary font/build artifact must not be committed in this GitHub package`);
  if (name === '.env') violations.push(`${rel}: live environment file must not be committed`);
  if (bytes.length > maxGitHubFileBytes) violations.push(`${rel}: exceeds 95 MiB GitHub package guard`);
  const sealedUpstream = rel.startsWith('engines/ai-sdk/upstream/');
  if (!sealedUpstream && bytes.length <= 2 * 1024 * 1024 && !['.png', '.jpg', '.jpeg', '.webp', '.ico', '.pdf', '.zip', '.gz'].includes(ext)) {
    if (privateKeyPattern.test(bytes.toString('utf8'))) violations.push(`${rel}: private key material detected`);
  }
}
assert.equal(violations.length, 0, `GitHub package hygiene failed:\n- ${violations.join('\n- ')}`);
console.log(`GITHUB PACKAGE: PASS · ${tracked.size} tracked files · no font binaries, caches, private keys, or oversized files`);
