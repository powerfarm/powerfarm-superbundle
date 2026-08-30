import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const recovery = JSON.parse(read('contracts/recovery.v1.json'));
const execution = JSON.parse(read('contracts/execution-slice.v3.json'));
const checks = [];
function check(label, condition) { assert.equal(Boolean(condition), true, label); checks.push(label); }

check('recovery contract is pinned', recovery.contract_id === 'pf.contract.card-recovery.v1');
check('recovery uses canonical Card v1', recovery.carrier === 'powerfarm.card.v1');
check('recovery uses current ExecutionSlice v3', recovery.execution_slice === execution.contract_version);
check('recovery freezes orphaned state', recovery.states.includes('orphaned'));
check('recovery freezes reconciling state', recovery.states.includes('reconciling'));
check('recovery freezes takeover before Registry Card refresh', recovery.sequence.indexOf('Process admits run.takeover when the Registry current occupant changed') < recovery.sequence.indexOf('Registry refreshes identity_ref and occupancy_ref on the Card'));

const recoverySource = read('circulation/cards/lib/recovery.mjs');
const stateMachine = read('circulation/cards/lib/state-machine.mjs');
const kernel = read('process/continuum/powerfarm/kernel.py');
const registry = read('process/continuum/powerfarm/registry.py');
const aiBridge = read('process/continuum-ai-sdk/tests/support/bridge.py');
const adkPlugin = read('process/continuum-adk/src/continuum_adk/plugin.py');
check('Card recovery source compares Registry occupancy', recoverySource.includes('assessOccupancy'));
check('Card recovery produces a deterministic reconciliation ref', recoverySource.includes('occupancyReconciliationRef'));
check('Heartime recovery reissue preserves attempt ref', recoverySource.includes("attemptRef: card.circulation.attempt_ref"));
check('Heartime recovery reissue increments retry count', stateMachine.includes("from === 'reconciling'") && stateMachine.includes('retry_count'));
check('Continuum implements run.takeover', kernel.includes('kind == "run.takeover"'));
check('Continuum implements run.resume', kernel.includes('kind == "run.resume"'));
check('Continuum continuation checks current occupancy', kernel.includes('never inherits stale occupancy'));
check('Registry directory exposes bitemporal occupancy observation', registry.includes('current_occupancy') && registry.includes('occupancy_history'));
check('AI SDK Setting blocks duplicate same-beat delivery', aiBridge.includes('POWERFARM_ALREADY_IN_FLIGHT'));
check('AI SDK Setting requires takeover for successor occupancy', aiBridge.includes('POWERFARM_TAKEOVER_REQUIRED'));
check('ADK Setting blocks duplicate same-beat delivery', adkPlugin.includes('POWERFARM_ALREADY_IN_FLIGHT'));
check('ADK Setting requires takeover for successor occupancy', adkPlugin.includes('POWERFARM_TAKEOVER_REQUIRED'));
check('recovery golden is pinned', fs.existsSync(path.join(root, 'conformance/circulation/golden/recovery.golden.json')));
check('recovery integration test is part of circulation conformance', fs.existsSync(path.join(root, 'conformance/circulation/recovery.integration.test.mjs')));

console.log(`RECOVERY CONTRACT: PASS · ${checks.length} checks`);
for (const label of checks) console.log(`  ok    ${label}`);
