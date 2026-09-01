// A configuration that validated the anchor once must not be able to let a
// child process open the store without carrying that expectation.
//
// The AI SDK Setting reaches Continuum through a Python child process: Node owns
// the database path and spawns the bridge. That is exactly the shape where a
// parent-side check proves nothing, because the child is what actually opens the
// store. So the child re-derives the anchor from what it was pointed at and
// refuses on its own.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { PythonContinuumPort } from './support/python-port.mjs';

const REGISTRY = {
  offices: ['director', 'operations'],
  occupancies: { director: 'human-1', operations: 'agent-1' },
};

function workspace(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `pf-propagation-${name}-`));
  return { root, dbPath: path.join(root, 'institution.db') };
}

async function foundInstitution(name) {
  const ws = workspace(name);
  const port = new PythonContinuumPort({ dbPath: ws.dbPath, registry: REGISTRY });
  const created = await port.bootstrap({
    root_actor: 'human-1',
    grants: [{ office: 'operations', action: 'tool.invoke.search', subject: 'tool:search' }],
  });
  assert.equal(created.ok, true);
  return { ws, port, anchor: created.anchor };
}

test('genesis publishes an anchor and the port carries it from then on', async () => {
  const { port, anchor } = await foundInstitution('genesis');
  assert.match(anchor.institution_ref, /^inst_[0-9a-f]{32}$/);
  assert.match(anchor.genesis_ref, /^evt_[0-9a-f]{32}$/);
  assert.match(anchor.anchor_digest, /^[0-9a-f]{64}$/);
  // The anchor names nothing physical.
  assert.equal(JSON.stringify(anchor).includes('.db'), false);
  assert.equal(port.institution.institution_ref, anchor.institution_ref);

  const audited = await port.audit();
  assert.equal(audited.ok, true);
});

test('a child asked to work without a declared institution refuses', async () => {
  const { ws } = await foundInstitution('undeclared');

  // A second port over the same store that never learned the anchor. This is the
  // propagation hole: the parent validated once, and this child did not carry it.
  const unpinned = new PythonContinuumPort({ dbPath: ws.dbPath, registry: REGISTRY });
  assert.equal(unpinned.institution, null);

  await assert.rejects(
    () => unpinned.audit(),
    error => /POWERFARM_INSTITUTION_UNDECLARED|must be told which institution/.test(String(error.message)),
  );
});

test('a child pointed at a different institution refuses even with a valid anchor', async () => {
  const ours = await foundInstitution('ours');
  const theirs = await foundInstitution('theirs');

  // Our anchor, their store. The parent's expectation is real; the store is not
  // the one it describes.
  const crossed = new PythonContinuumPort({
    dbPath: theirs.ws.dbPath,
    registry: REGISTRY,
    expectInstitution: ours.anchor,
  });

  await assert.rejects(
    () => crossed.audit(),
    error => /not the expected institution|institution_ref differs/.test(String(error.message)),
  );
});

test('a child pointed at an empty store refuses instead of bootstrapping', async () => {
  const { ws, anchor } = await foundInstitution('lost');

  // The store is gone; something empty is where it used to be.
  fs.renameSync(ws.dbPath, `${ws.dbPath}.lost`);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${ws.dbPath}${suffix}`)) fs.renameSync(`${ws.dbPath}${suffix}`, `${ws.dbPath}.lost${suffix}`);
  }

  const pinned = new PythonContinuumPort({
    dbPath: ws.dbPath,
    registry: REGISTRY,
    expectInstitution: anchor,
  });

  await assert.rejects(
    () => pinned.audit(),
    error => /empty store is not authorization to bootstrap/.test(String(error.message)),
  );
});

test('the anchor a child carries is verified against the store, not trusted', async () => {
  const { ws, anchor } = await foundInstitution('tampered');

  // A caller that edits the anchor it passes down does not thereby change which
  // institution the store holds.
  const forged = { ...anchor, institution_ref: `inst_${'0'.repeat(32)}` };
  delete forged.anchor_digest;

  const lying = new PythonContinuumPort({
    dbPath: ws.dbPath,
    registry: REGISTRY,
    expectInstitution: forged,
  });

  await assert.rejects(
    () => lying.audit(),
    error => /institution_ref differs|not the expected institution/.test(String(error.message)),
  );
});
