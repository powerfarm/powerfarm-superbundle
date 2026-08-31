import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyReleaseIntegrity } from './lib/release-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = verifyReleaseIntegrity(root);
assert.equal(
  result.violations.length,
  0,
  `Release integrity failed:\n- ${result.violations.join('\n- ')}`,
);
console.log(
  `RELEASE INTEGRITY: PASS · ${result.fileCount} tracked files · source ${result.sourceDigest}`,
);
