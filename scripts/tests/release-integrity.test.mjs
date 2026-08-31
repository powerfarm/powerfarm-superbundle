import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ATTESTATION_PATHS,
  buildReleaseVerification,
  parseReleaseManifest,
  sourceTreeDigest,
  verifyManifestEntries,
} from '../lib/release-integrity.mjs';

test('release claim is derived from complete successful evidence', () => {
  const evidence = {
    status: 'BUILT AND VERIFIED',
    source_tree_sha256: 'a'.repeat(64),
    command_count: 2,
    commands: [{ exit_code: 0 }, { exit_code: 0 }],
  };

  assert.deepEqual(buildReleaseVerification(evidence, Buffer.from('evidence')), {
    full_verify: 'passed',
    source_tree_sha256: 'a'.repeat(64),
    evidence_file: 'evidence/organism-verification/verification.json',
    evidence_sha256: 'ee8250fb76e094b34b471f13a73dbbe51d1ae142e9df59d7c0d31ec20f0a0a8e',
    verified_commands: 2,
  });

  assert.throws(
    () => buildReleaseVerification({ ...evidence, commands: [{ exit_code: 1 }] }, Buffer.from('bad')),
    /incomplete or failed/,
  );
});

test('source digest excludes self-referential attestation files', () => {
  const files = new Map([
    ['src/app.js', Buffer.from('export const answer = 42;\n')],
    ['SUPERBUNDLE-RELEASE.json', Buffer.from('{"mutable":"claim"}\n')],
    ['RELEASE-MANIFEST.sha256', Buffer.from('mutable manifest\n')],
    ['evidence/organism-verification/verification.json', Buffer.from('{"mutable":"evidence"}\n')],
  ]);

  const first = sourceTreeDigest(files);
  files.set('SUPERBUNDLE-RELEASE.json', Buffer.from('{"mutable":"changed"}\n'));
  files.set('evidence/organism-verification/verification.json', Buffer.from('{"mutable":"changed"}\n'));

  assert.equal(sourceTreeDigest(files), first);
  assert.deepEqual(
    [...ATTESTATION_PATHS].sort(),
    [
      'RELEASE-MANIFEST.sha256',
      'SUPERBUNDLE-RELEASE.json',
      'evidence/organism-verification/source-manifest.txt',
      'evidence/organism-verification/verification.json',
    ],
  );
});

test('manifest parser and verifier reject missing, extra, duplicate, and stale entries', () => {
  const expected = new Map([
    ['a.txt', Buffer.from('a')],
    ['nested/b.txt', Buffer.from('b')],
  ]);
  const valid = parseReleaseManifest([
    'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb  ./a.txt',
    '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d  ./nested/b.txt',
  ].join('\n'));

  assert.deepEqual(verifyManifestEntries(valid, expected), []);

  const invalid = parseReleaseManifest([
    'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb  ./a.txt',
    'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb  ./a.txt',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  ./extra.txt',
  ].join('\n'));
  const violations = verifyManifestEntries(invalid, expected);

  assert.ok(violations.some((item) => item.includes('duplicate')));
  assert.ok(violations.some((item) => item.includes('missing nested/b.txt')));
  assert.ok(violations.some((item) => item.includes('unexpected extra.txt')));
});
