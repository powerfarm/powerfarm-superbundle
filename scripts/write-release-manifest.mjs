import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RELEASE_MANIFEST_PATH,
  renderReleaseManifest,
  trackedFiles,
} from './lib/release-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = renderReleaseManifest(trackedFiles(root));
fs.writeFileSync(path.join(root, RELEASE_MANIFEST_PATH), output);
console.log(`WROTE ${RELEASE_MANIFEST_PATH}`);
