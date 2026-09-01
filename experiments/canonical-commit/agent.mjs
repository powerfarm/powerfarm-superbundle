// One "Process" instance. It performs a single admission and exits, or is
// hard-killed part way through by its own SIGKILL at the requested point.
//
// It exists as a separate process so that "kill Process" means what it says.
// Nothing here is caught, flushed or unwound after the signal.
//
// Usage: node agent.mjs '<json request>'
//   { shape, canonicalDir, projectionDir, branch, requestId, body, expectedHead,
//     killAt, poison, project }

import fs from 'node:fs';
import path from 'node:path';

import { admitBatch, mintAnchor, openInstitution, projectFromCanonical, projectFromOutbox } from './admission.mjs';
import { openSqliteStore } from './store-sqlite.mjs';
import { openPostgresStore } from './store-postgres.mjs';

const request = JSON.parse(process.argv[2]);
const { shape } = request;

async function openCanonical() {
  return shape === 'A'
    ? openSqliteStore(request.canonicalPath)
    : openPostgresStore(request.canonicalPath);
}

async function openProjection() {
  return shape === 'A'
    ? openPostgresStore(request.projectionPath)
    : openSqliteStore(request.projectionPath);
}

function writeResult(value) {
  fs.mkdirSync(path.dirname(request.resultPath), { recursive: true });
  fs.writeFileSync(request.resultPath, JSON.stringify(value));
}

const canonical = await openCanonical();
let result;
try {
  // OPEN. Stated before anything else happens, so an empty or foreign store is
  // refused rather than admitted into.
  if (request.expect && !request.init) {
    const opened = await openInstitution(canonical, request.expect);
    if (!opened.ok) {
      result = { outcome: 'REFUSED_WRONG_INSTITUTION', reason: opened.reason };
      writeResult(result);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      await canonical.close();
      process.exit(0);
    }
  }
  if (request.init) {
    // CREATE. A handle that names the institution it expects is an operational
    // handle, not a founding one, and may never run genesis.
    if (request.expect) {
      result = { outcome: 'REFUSED_GENESIS_ON_AN_OPEN_HANDLE', reason: 'this handle expects an existing institution and cannot create one' };
    } else {
      const existing = await canonical.institution();
      if (existing === null) {
        const anchor = mintAnchor();
        await canonical.initInstitution(anchor);
        result = { outcome: 'INITIALIZED', anchor };
      } else {
        result = { outcome: 'ALREADY_INITIALIZED', anchor: existing };
      }
    }
    writeResult(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    await canonical.close();
    process.exit(0);
  }
  result = await admitBatch(canonical, {
    branch: request.branch ?? 'main',
    requestId: request.requestId,
    body: request.body,
    kind: request.kind,
    expectedHead: request.expectedHead,
    shape,
    killAt: request.killAt ?? 'none',
    poison: Boolean(request.poison),
    expectAnchor: request.expect ?? null,
    ackBeforeCommit: request.ackBeforeCommit
      ? () => writeResult({ outcome: 'ADMITTED', premature: true })
      : null,
  });

  if (request.killAt === 'after-commit-before-projection') {
    process.kill(process.pid, 'SIGKILL');
  }

  if (request.project !== false && result.outcome === 'ADMITTED') {
    const projection = await openProjection();
    const projected = shape === 'A'
      ? await projectFromOutbox(canonical, projection, request.branch ?? 'main')
      : await projectFromCanonical(canonical, projection, request.branch ?? 'main');
    result.projected = projected;
    await projection.close();
  }
} finally {
  await canonical.close();
}

writeResult(result);
process.stdout.write(`${JSON.stringify(result)}\n`);
