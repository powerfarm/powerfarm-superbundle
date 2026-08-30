import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EPISTEMIC_CLASS,
  EPISTEMIC_RECORD_CONTRACT_VERSION,
} from '../circulation/cards/lib/epistemic-schema.mjs';
import { ownershipFor } from '../circulation/cards/lib/patch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (label, condition) => {
  if (!condition) throw new Error(`Epistemic continuity contract failed: ${label}`);
  checks.push(label);
};

const manifest = JSON.parse(read('contracts/epistemic-continuity.v1.json'));
const schemaSource = read('circulation/cards/lib/epistemic-schema.mjs');
const epistemicSource = read('circulation/cards/lib/epistemic.mjs');
const stateSource = read('circulation/cards/lib/state-machine.mjs');
const gateSource = read('circulation/cards/lib/gate.mjs');
const driverSource = read('conformance/circulation/support/epistemic-occupant-driver.mjs');
const goldenTest = read('conformance/circulation/epistemic-continuity.integration.test.mjs');

check('contract identity is permanent v1', manifest.contract_id === 'pf.contract.epistemic-continuity.v1');
check('record wire version matches source', manifest.record_version === EPISTEMIC_RECORD_CONTRACT_VERSION);
check('wake context version is pinned', manifest.wake_context_version === 'powerfarm.epistemic-wake-context.v1');
check('classification list matches source', JSON.stringify(manifest.classifications) === JSON.stringify(Object.values(EPISTEMIC_CLASS)));
check('Memory owns durable epistemic records', ['epistemic.observations', 'epistemic.claims', 'epistemic.uncertainties', 'epistemic.conflicts', 'epistemic.freshness', 'epistemic.evidence_refs'].every((field) => ownershipFor('memory').includes(field)));
check('Heartime owns next_sample but not observations', ownershipFor('heartime').includes('epistemic.next_sample') && !ownershipFor('heartime').includes('epistemic.observations'));
check('OBSERVED requires durable evidence', /OBSERVED/.test(schemaSource) && /evidence_refs.*min: 1/.test(schemaSource));
check('OBSERVED requires source attribution', /EpistemicObservation\.source_ref/.test(schemaSource));
check('INFERRED requires supporting epistemic records', /INFERRED claim must cite at least one supporting epistemic record/.test(schemaSource));
check('REPORTED requires source and evidence', /classification === EPISTEMIC_CLASS\.REPORTED/.test(schemaSource) && /EpistemicClaim\.source_ref/.test(schemaSource));
check('UNKNOWN resolution is reference based rather than destructive', /claim\.resolves/.test(epistemicSource) && /unresolvedUncertainties/.test(epistemicSource));
check('epistemic records use content-addressed pf.epistemic refs', /pf\.epistemic\./.test(schemaSource) && /verifyEpistemicRecordRef/.test(schemaSource));
check('wake context preserves classification legend', /classification_legend/.test(epistemicSource) && /OBSERVED/.test(epistemicSource) && /INFERRED/.test(epistemicSource));
check('Heartime detects due epistemic samples', /epistemic_sample_due/.test(gateSource));
check('Heartime detects stale observations', /epistemic_stale/.test(gateSource));
check('deferred unresolved uncertainty requires next_sample', /unresolved epistemic uncertainty requires epistemic\.next_sample/.test(stateSource));
check('Card epistemic surface excludes raw prompt/transcript fields', !/epistemic\.(?:prompt|messages|transcript|chain_of_thought|reasoning)/.test(`${schemaSource}\n${epistemicSource}`));
check('occupant driver records world state and later reconstructs it', /Occupant A recorded the world for a future occupant/.test(driverSource) && /Occupant B sampled the changed world from durable Card state only/.test(driverSource));
check('cross-occupant golden uses separate OS processes', /spawnSync/.test(goldenTest) && /occupant_a_pid_shared: false/.test(goldenTest));
check('cross-occupant process receives durable Card only', /occupant_b_input: 'durable_card_only'/.test(goldenTest));
check('epistemic continuity golden fixture is pinned', fs.existsSync(path.join(root, 'conformance/circulation/golden/epistemic-continuity.golden.json')));

console.log(`EPISTEMIC CONTINUITY: PASS · ${checks.length} checks`);
for (const label of checks) console.log(`  ok    ${label}`);
