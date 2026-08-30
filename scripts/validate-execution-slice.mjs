import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXECUTION_SLICE_CONTRACT_VERSION,
  createCardV1,
  deriveExecutionSlice,
  emitCard,
  makeCostAuthorization,
  makeEnergyAuthorization,
  executionRefsFromSlice,
  sealExecutionSlice,
  transitionCard,
  verifyExecutionSliceSeal,
} from '../circulation/cards/lib/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
function check(label, condition) {
  assert.equal(Boolean(condition), true, label);
  checks.push(label);
}

const sliceContract = JSON.parse(read('contracts/execution-slice.v3.json'));
const receiptContract = JSON.parse(read('contracts/execution-receipt.v1.json'));
const runtimeBoundary = JSON.parse(read('contracts/runtime-engine-boundary.v1.json'));
check('ExecutionSlice contract id is pinned', sliceContract.contract_id === 'pf.contract.execution-slice.v3');
check('ExecutionSlice wire version matches implementation', sliceContract.contract_version === EXECUTION_SLICE_CONTRACT_VERSION);
check('ExecutionSlice is explicitly engine-neutral', sliceContract.identity.engine_neutral === true);
check('ExecutionSlice identity is explicitly occupancy-independent', sliceContract.identity.occupancy_independent === true);
check('Runtime boundary points to ExecutionSlice contract', runtimeBoundary.execution_contracts?.slice === 'contracts/execution-slice.v3.json');
check('Runtime boundary points to common receipt contract', runtimeBoundary.execution_contracts?.receipt === 'contracts/execution-receipt.v1.json');
check('ExecutionReceipt is owned by Process', receiptContract.owner === 'Process');
check('ExecutionReceipt uses common Continuum RuntimeReceipt type', receiptContract.wire_type === 'powerfarm.runtime.RuntimeReceipt');

let card = await createCardV1({
  ref: 'pf.card.execution-contract-validation',
  scope: 'pf.office.operations',
  created_at: '2026-08-30T03:00:00.000Z',
  institutional: {
    identity_ref: 'pf.identity.agent-1', office_ref: 'pf.office.operations', occupancy_ref: 'pf.occupancy.agent-1',
    direction_ref: 'pf.direction.execution-contract-validation', ecs_sha256: 'd'.repeat(64),
  },
  energy: { authorization: makeEnergyAuthorization({
    authorizationRef: 'pf.energy-authorization.execution-contract-validation',
    effectiveAt: '2026-08-30T03:00:00.000Z',
    limits: { beats: 4, model_tokens: 100000, tool_calls: 20, network_calls: 20, compute_ms: 600000, sandbox_ms: 600000, wall_ms: 900000, human_attention_ms: 600000 },
  }) },
  cost: { authorization: makeCostAuthorization({
    authorizationRef: 'pf.cost-authorization.execution-contract-validation', currency: 'USD', mode: 'capped',
    ceilingMicros: 10_000_000, effectiveAt: '2026-08-30T03:00:00.000Z',
  }) },
  circulation: { state: 'prepared', priority: 1, next_expected: '2026-08-30T03:00:00.000Z' },
});
card = (await emitCard(card, {
  at: '2026-08-30T03:00:00.000Z', beatRef: 'pf.beat.execution-contract-validation', nextExpected: '2026-08-30T03:01:00.000Z',
})).card;
card = (await transitionCard(card, {
  to: 'acknowledged', at: '2026-08-30T03:01:00.000Z', nextExpected: '2026-08-30T03:02:00.000Z',
})).card;
card = (await transitionCard(card, {
  to: 'executing', at: '2026-08-30T03:02:00.000Z', attemptRef: 'pf.attempt.execution-contract-validation', nextExpected: '2026-08-30T03:03:00.000Z',
})).card;
const slice = await deriveExecutionSlice(card, {
  actor: 'agent-1', office: 'operations', toolName: 'search', kind: 'tool.invoke.search', subject: 'tool:search',
});
check('derived ExecutionSlice is content-addressed', await verifyExecutionSliceSeal(slice));
check('ExecutionSlice carries engine-neutral remaining energy', slice.resources.energy_remaining.beats === 3 && slice.resources.energy_remaining.tool_calls === 20);
check('ExecutionSlice carries remaining monetary budget', slice.resources.cost.currency === 'USD' && slice.resources.cost.remaining_micros === 10_000_000);
for (const forbidden of sliceContract.engine_fields_forbidden) {
  check(`ExecutionSlice excludes engine field ${forbidden}`, !(forbidden in slice));
}
const refs = await executionRefsFromSlice(slice);
check('ExecutionSlice carries its derived institutional run_ref', slice.institutional.run_ref === refs.runRef);

const successor = structuredClone(slice);
successor.principal.actor = 'agent-2';
delete successor.slice_sha256;
const successorRefs = await executionRefsFromSlice(await sealExecutionSlice(successor));
check('occupant replacement does not redefine institutional run_ref', successorRefs.runRef === refs.runRef);

const reissued = structuredClone(slice);
reissued.card.revision += 1;
reissued.circulation.beat_ref = 'pf.beat.execution-contract-reissue';
delete reissued.slice_sha256;
const reissuedSealed = await sealExecutionSlice(reissued);
const reissuedRefs = await executionRefsFromSlice(reissuedSealed);
check('Heartime reissue beat does not redefine institutional run_ref', reissuedRefs.runRef === refs.runRef);
check('Heartime reissue beat receives a distinct resume request id', reissuedRefs.resumeRequestId !== refs.resumeRequestId);

const aiWrapper = read('process/continuum-ai-sdk/src/wrap-tools.mjs');
const aiBridge = read('process/continuum-ai-sdk/tests/support/bridge.py');
const adkPlugin = read('process/continuum-adk/src/continuum_adk/plugin.py');
const adkSlice = read('process/continuum-adk/src/continuum_adk/execution_slice.py');
const adkReceipts = read('process/continuum-adk/src/continuum_adk/receipts.py');
check('AI SDK Setting validates and derives refs from ExecutionSlice', aiWrapper.includes('executionRefsFromSlice') && aiWrapper.includes('verifyExecutionSliceSeal'));
check('AI SDK admission persists execution slice digest', aiBridge.includes('execution_slice_sha256'));
check('ADK Setting validates and derives refs from ExecutionSlice', adkPlugin.includes('execution_refs_from_slice') && adkPlugin.includes('_resolve_execution_slice'));
check('ADK and JS pin the same ExecutionSlice version', adkSlice.includes(`EXECUTION_SLICE_CONTRACT_VERSION = "${EXECUTION_SLICE_CONTRACT_VERSION}"`));
check('AI SDK consequence uses Continuum RuntimeReceipt', aiBridge.includes('RuntimeReceipt('));
check('ADK consequence uses Continuum RuntimeReceipt', adkReceipts.includes('RuntimeReceipt('));
check('engine equivalence integration golden exists', fs.existsSync(path.join(root, 'conformance/circulation/engine-equivalence.integration.test.mjs')));
check('engine equivalence fixture is pinned', fs.existsSync(path.join(root, 'conformance/circulation/golden/engine-equivalence.golden.json')));

console.log(`EXECUTION SLICE CONTRACT: PASS · ${checks.length} checks`);
for (const label of checks) console.log(`  ok    ${label}`);
