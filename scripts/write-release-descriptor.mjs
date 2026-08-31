import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReleaseVerification,
  EVIDENCE_REPORT_PATH,
  RELEASE_DESCRIPTOR_PATH,
} from './lib/release-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceBytes = fs.readFileSync(path.join(root, EVIDENCE_REPORT_PATH));
const evidence = JSON.parse(evidenceBytes.toString('utf8'));
const descriptorPath = path.join(root, RELEASE_DESCRIPTOR_PATH);
const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));

descriptor.built_at = evidence.finished_at;
descriptor.verification = buildReleaseVerification(evidence, evidenceBytes);
fs.writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
console.log(`WROTE ${RELEASE_DESCRIPTOR_PATH}`);
