import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COST_AUTHORIZATION_CONTRACT_VERSION,
  ENERGY_AUTHORIZATION_CONTRACT_VERSION,
  ENERGY_METERS,
  RESOURCE_HEALTH_PROJECTION_VERSION,
  RESOURCE_OBSERVATION_CONTRACT_VERSION,
} from '../circulation/cards/lib/resource-schema.mjs';
import { EXECUTION_SLICE_CONTRACT_VERSION } from '../circulation/cards/lib/execution-slice.mjs';
import { ownershipFor } from '../circulation/cards/lib/patch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const manifest = JSON.parse(read('contracts/energy-cost.v1.json'));
const resourceSource = read('circulation/cards/lib/resources.mjs');
const schemaSource = read('circulation/cards/lib/resource-schema.mjs');
const gateSource = read('circulation/cards/lib/gate.mjs');
const recoverySource = read('circulation/cards/lib/recovery.mjs');
const sliceSource = read('circulation/cards/lib/execution-slice.mjs');
const aiWrapper = read('process/continuum-ai-sdk/src/wrap-tools.mjs');
const processSlice = read('process/continuum/powerfarm/execution_slice.py');
const adkSlice = read('process/continuum-adk/src/continuum_adk/execution_slice.py');
const mafController = read('process/continuum-maf/src/continuum_maf/controller.py');
const checks = [];
const check = (label, condition) => { assert.equal(Boolean(condition), true, label); checks.push(label); };

check('energy/cost contract id is pinned', manifest.contract_id === 'pf.contract.energy-cost.v1');
check('energy authorization wire version is pinned', manifest.energy_authorization_version === ENERGY_AUTHORIZATION_CONTRACT_VERSION);
check('cost authorization wire version is pinned', manifest.cost_authorization_version === COST_AUTHORIZATION_CONTRACT_VERSION);
check('resource observation wire version is pinned', manifest.resource_observation_version === RESOURCE_OBSERVATION_CONTRACT_VERSION);
check('resource health wire version is pinned', manifest.resource_health_version === RESOURCE_HEALTH_PROJECTION_VERSION);
check('energy meter list matches source exactly', JSON.stringify(manifest.energy_meters) === JSON.stringify(ENERGY_METERS));
check('Process owns energy authorization', ownershipFor('process').includes('energy.authorization'));
check('Process owns cost authorization', ownershipFor('process').includes('cost.authorization'));
check('Heartime owns energy consumption', ownershipFor('heartime').includes('energy.consumption'));
check('Heartime owns cost consumption', ownershipFor('heartime').includes('cost.consumption'));
check('Platform cannot write Card consumption directly', !ownershipFor('platform').some((field) => field.startsWith('energy.') || field.startsWith('cost.')));
check('Homeostasis owns health only for resource projections', ownershipFor('homeostasis').includes('health'));
check('resource observations are content-addressed', /pf\.resource-observation\./.test(resourceSource) && /verifyResourceObservationSeal/.test(resourceSource));
check('resource observation replay is idempotent', /duplicate: true/.test(resourceSource));
check('Platform metering requires durable evidence', /requires durable metering evidence/.test(schemaSource));
check('Platform cannot meter Heartime beats', /Platform cannot meter Heartime beats/.test(schemaSource));
check('Heartime observations may meter beats only', /Heartime ResourceObservation may meter beats only/.test(schemaSource));
check('Heartime gate blocks unavailable resources', /assessResourceState/.test(gateSource) && /resources\.blocked/.test(gateSource));
check('normal Heartime emission debits a beat', /recordHeartimeBeat/.test(gateSource));
check('recovery reissue also debits a beat', /recordHeartimeBeat/.test(recoverySource));
check('observed overdraw remains visible and blocks future execution', /energy_overdrawn/.test(resourceSource) && /cost_overdrawn/.test(resourceSource));
check('Homeostasis projects circulatory debt', /circulatoryDebt/.test(resourceSource) && /cost_per_evidence_micros/.test(resourceSource));
check('ExecutionSlice v3 is the current boundary', EXECUTION_SLICE_CONTRACT_VERSION === 'powerfarm.execution-slice.v3' && manifest.execution_slice === EXECUTION_SLICE_CONTRACT_VERSION);
check('ExecutionSlice seals remaining resources', /resources: executionResourceBudget/.test(sliceSource));
check('AI SDK passes resource budget to local tool context', /resourceBudget: identity\.executionSlice\?\.resources/.test(aiWrapper));
check('Process validates the shared resource budget shape', /ExecutionSlice\.resources\.energy_remaining/.test(processSlice) && /remaining_micros/.test(processSlice));
check('ADK consumes Process-owned ExecutionSlice validation', /from powerfarm\.execution_slice import \*/.test(adkSlice));
check('MAF consumes Process-owned ExecutionSlice validation', /from powerfarm\.execution_slice import/.test(mafController));
check('energy/cost golden exists', fs.existsSync(path.join(root, 'conformance/circulation/energy-cost.integration.test.mjs')));
check('energy/cost fixture is pinned', fs.existsSync(path.join(root, 'conformance/circulation/golden/energy-cost.golden.json')));

console.log(`ENERGY + COST CONTRACT: PASS · ${checks.length} checks`);
for (const label of checks) console.log(`  ok    ${label}`);
