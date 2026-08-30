import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../src/index.js'), 'utf8');

test('Heartime control is private RPC and no public arm endpoint exists', () => {
  assert.match(source, /class HeartimeControl extends WorkerEntrypoint/);
  assert.match(source, /getByName\(key\)\.arm\(\)/);
  assert.match(source, /PORT_VERSIONS\.heartime_control/);
  assert.match(source, /EXPECTED_CONTROL_IDENTITY_REF/);
  assert.match(source, /createReconcilerRouter/);
  assert.match(source, /attentionBinding: this\.env\.ATTENTION_RECONCILER/);
  assert.doesNotMatch(source, /pathname\s*===\s*['"]\/arm['"]/);
  assert.match(source, /return new Response\('Not found', \{ status: 404 \}\)/);
});
