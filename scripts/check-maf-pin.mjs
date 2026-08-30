import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(fs.readFileSync(path.join(root, 'engines/microsoft-agent-framework/PIN.json'), 'utf8'));
const constraints = fs.readFileSync(path.join(root, 'process/continuum-maf/constraints/tested-py312.txt'), 'utf8');
const pyproject = fs.readFileSync(path.join(root, 'process/continuum-maf/pyproject.toml'), 'utf8');

assert.equal(pin.format, 'powerfarm.engine-pin/v1');
assert.equal(pin.engine, 'microsoft-agent-framework');
assert.equal(pin.distribution, 'agent-framework-core');
assert.equal(pin.version, '1.16.0');
assert.equal(pin.released, '2026-08-28');
assert.equal(pin.license, 'MIT');
assert.equal(pin.powerfarm_setting, 'process/continuum-maf');
assert.equal(pin.engine_local_memory_is_authoritative, false);
assert.equal(pin.artifacts.sdist.sha256, '47ee37b4f6201add7a8a8f9cc39ffe43438c24360b53b116f61ba075e6962d94');
assert.equal(pin.artifacts.wheel.sha256, '382a6a0332cdc3144ffcf14b07a9a38c3ef42afc06dde8230226b850fe4cc76e');
assert.match(constraints, /^agent-framework-core==1\.16\.0$/m);
assert.match(pyproject, /agent-framework-core>=1\.16,<2/);
console.log('Microsoft Agent Framework pin verified: agent-framework-core==1.16.0 with exact PyPI artifact digests.');
