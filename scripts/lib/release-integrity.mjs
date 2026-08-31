import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const RELEASE_MANIFEST_PATH = 'RELEASE-MANIFEST.sha256';
export const RELEASE_DESCRIPTOR_PATH = 'SUPERBUNDLE-RELEASE.json';
export const EVIDENCE_REPORT_PATH = 'evidence/organism-verification/verification.json';
export const EVIDENCE_SOURCE_MANIFEST_PATH = 'evidence/organism-verification/source-manifest.txt';

export const ATTESTATION_PATHS = new Set([
  RELEASE_MANIFEST_PATH,
  RELEASE_DESCRIPTOR_PATH,
  EVIDENCE_REPORT_PATH,
  EVIDENCE_SOURCE_MANIFEST_PATH,
]);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function trackedFiles(root, { allowMissing = new Set() } = {}) {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'buffer',
  });
  const files = new Map();
  for (const raw of output.toString('utf8').split('\0')) {
    if (!raw) continue;
    const relative = raw.split(path.sep).join('/');
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) {
      if (allowMissing.has(relative)) continue;
      throw new Error(`tracked release file is missing: ${relative}`);
    }
    files.set(relative, fs.readFileSync(absolute));
  }
  return files;
}

export function sourceTreeManifestLines(files) {
  return [...files.entries()]
    .filter(([relative]) => !ATTESTATION_PATHS.has(relative))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relative, bytes]) => `${relative}\0${sha256(bytes)}`);
}

export function sourceTreeDigest(files) {
  return sha256(sourceTreeManifestLines(files).join('\n'));
}

export function parseReleaseManifest(text) {
  const entries = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line) continue;
    const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
    if (!match) throw new Error(`invalid release manifest line ${index + 1}`);
    entries.push({ sha256: match[1], path: match[2] });
  }
  return entries;
}

export function verifyManifestEntries(entries, expectedFiles) {
  const violations = [];
  const actual = new Map();
  for (const entry of entries) {
    if (actual.has(entry.path)) violations.push(`duplicate ${entry.path}`);
    actual.set(entry.path, entry.sha256);
  }
  for (const [relative, bytes] of expectedFiles) {
    if (relative === RELEASE_MANIFEST_PATH) continue;
    if (!actual.has(relative)) {
      violations.push(`missing ${relative}`);
      continue;
    }
    if (actual.get(relative) !== sha256(bytes)) violations.push(`stale hash ${relative}`);
  }
  for (const relative of actual.keys()) {
    if (relative === RELEASE_MANIFEST_PATH || !expectedFiles.has(relative)) {
      violations.push(`unexpected ${relative}`);
    }
  }
  return violations;
}

export function renderReleaseManifest(files) {
  return [...files.entries()]
    .filter(([relative]) => relative !== RELEASE_MANIFEST_PATH)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relative, bytes]) => `${sha256(bytes)}  ./${relative}`)
    .join('\n') + '\n';
}

export function buildReleaseVerification(evidence, evidenceBytes) {
  const complete = (
    evidence.status === 'BUILT AND VERIFIED'
    && Number.isInteger(evidence.command_count)
    && evidence.command_count > 0
    && Array.isArray(evidence.commands)
    && evidence.commands.length === evidence.command_count
    && evidence.commands.every((command) => command.exit_code === 0)
    && /^[0-9a-f]{64}$/.test(evidence.source_tree_sha256 ?? '')
  );
  if (!complete) throw new Error('verification evidence is incomplete or failed');
  return {
    full_verify: 'passed',
    source_tree_sha256: evidence.source_tree_sha256,
    evidence_file: EVIDENCE_REPORT_PATH,
    evidence_sha256: sha256(evidenceBytes),
    verified_commands: evidence.command_count,
  };
}

export function verifyReleaseIntegrity(root) {
  const violations = [];
  const files = trackedFiles(root);
  const manifest = parseReleaseManifest(
    fs.readFileSync(path.join(root, RELEASE_MANIFEST_PATH), 'utf8'),
  );
  violations.push(...verifyManifestEntries(manifest, files));

  const sourceLines = sourceTreeManifestLines(files);
  const sourceDigest = sha256(sourceLines.join('\n'));
  const storedSourceManifest = fs.readFileSync(
    path.join(root, EVIDENCE_SOURCE_MANIFEST_PATH),
    'utf8',
  );
  if (storedSourceManifest !== `${sourceLines.join('\n')}\n`) {
    violations.push(`${EVIDENCE_SOURCE_MANIFEST_PATH} does not describe the current source tree`);
  }

  const evidenceBytes = files.get(EVIDENCE_REPORT_PATH);
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  const release = JSON.parse(files.get(RELEASE_DESCRIPTOR_PATH).toString('utf8'));
  if (evidence.status !== 'BUILT AND VERIFIED') {
    violations.push(`${EVIDENCE_REPORT_PATH} status is not BUILT AND VERIFIED`);
  }
  if (evidence.source_tree_sha256 !== sourceDigest) {
    violations.push(`${EVIDENCE_REPORT_PATH} is bound to a different source tree`);
  }
  if (!Array.isArray(evidence.commands) || evidence.commands.length !== evidence.command_count) {
    violations.push(`${EVIDENCE_REPORT_PATH} command inventory is incomplete`);
  } else if (evidence.commands.some((command) => command.exit_code !== 0)) {
    violations.push(`${EVIDENCE_REPORT_PATH} contains a failed command`);
  }

  const verification = release.verification ?? {};
  if (verification.full_verify !== 'passed') {
    violations.push(`${RELEASE_DESCRIPTOR_PATH} does not claim a passed full verify`);
  }
  if (verification.source_tree_sha256 !== sourceDigest) {
    violations.push(`${RELEASE_DESCRIPTOR_PATH} is bound to a different source tree`);
  }
  if (verification.evidence_file !== EVIDENCE_REPORT_PATH) {
    violations.push(`${RELEASE_DESCRIPTOR_PATH} points to the wrong evidence file`);
  }
  if (verification.evidence_sha256 !== sha256(evidenceBytes)) {
    violations.push(`${RELEASE_DESCRIPTOR_PATH} evidence digest does not match`);
  }

  return { violations, sourceDigest, fileCount: files.size };
}
