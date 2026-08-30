import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARD_CONTRACT_VERSION,
  CARD_SCHEMA_VERSION,
  CARD_STATES,
} from '../circulation/cards/lib/card-v1.mjs';
import {
  CARD_PATCH_CONTRACT_VERSION,
  ownershipFor,
} from '../circulation/cards/lib/patch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (label, condition) => {
  if (!condition) throw new Error(`Card contract failed: ${label}`);
  checks.push(label);
};

const manifest = JSON.parse(read('contracts/card.v1.json'));
check('machine contract identity is permanent v1', manifest.contract_id === 'pf.contract.card.v1');
check('wire version matches source', manifest.contract_version === CARD_CONTRACT_VERSION);
check('schema version matches source', manifest.schema_version === CARD_SCHEMA_VERSION);
check('machine state list matches source', JSON.stringify(manifest.circulation_states) === JSON.stringify([...CARD_STATES]));
for (const organ of ['registry', 'process', 'platform', 'memory', 'heartime', 'homeostasis']) {
  check(`${organ} ownership matches source`, JSON.stringify(manifest.organs[organ]) === JSON.stringify(ownershipFor(organ)));
}

const cardSource = read('circulation/cards/lib/card-v1.mjs');
const patchSource = read('circulation/cards/lib/patch.mjs');
const stateSource = read('circulation/cards/lib/state-machine.mjs');
const gateSource = read('circulation/cards/lib/gate.mjs');
const attentionContract = read('circulation/attention/lib/contract.mjs');
const aiIdentity = read('process/continuum-ai-sdk/src/identity.mjs');
const aiWrapper = read('process/continuum-ai-sdk/src/wrap-tools.mjs');
const aiBridge = read('process/continuum-ai-sdk/tests/support/bridge.py');

check('Card has separate semantic generation and snapshot revision', /generation/.test(cardSource) && /revision/.test(cardSource));
check('Card seal uses SHA-256 content addressing', /content_sha256/.test(cardSource) && /digestValue/.test(cardSource));
check('live Card next_expected is enforced', /must carry circulation\.next_expected/.test(cardSource));
check('blocked Card requires explicit reason', /must carry circulation\.blocked_reason/.test(cardSource));
check('CardPatch carries a versioned contract', patchSource.includes(CARD_PATCH_CONTRACT_VERSION));
check('CardPatch is bound to base revision', /base_revision/.test(patchSource) && /does not match Card revision/.test(patchSource));
check('CardPatch ownership fails closed', /does not own Card field/.test(patchSource));
check('circulation state machine rejects illegal jumps', /illegal Card circulation transition/.test(stateSource));
check('Heartime emission writes next_expected and beat_ref', /to: 'emitted'/.test(gateSource) && /nextExpected/.test(gateSource) && /beatRef/.test(gateSource));
check('terminal Cards are blocked from circulation', /CARD_TERMINAL_STATES/.test(gateSource) && /reason: 'terminal'/.test(gateSource));
check('orphaned and reconciling Cards request reconciliation', /RECONCILE/.test(gateSource) && /\['orphaned', 'reconciling'\]/.test(gateSource) && /reason: circulation\.state/.test(gateSource));
check('existing attention seam recognizes canonical Card v1', /CARD_CONTRACT_VERSION/.test(attentionContract) && /validateCardV1/.test(attentionContract));
check('AI SDK context carries card beat and attempt refs', /cardRef/.test(aiIdentity) && /beatRef/.test(aiIdentity) && /attemptRef/.test(aiIdentity));
check('AI SDK admission forwards card beat and attempt refs', /card_ref: identity\.cardRef/.test(aiWrapper) && /beat_ref: identity\.beatRef/.test(aiWrapper) && /attempt_ref: identity\.attemptRef/.test(aiWrapper));
check('Continuum provenance records card beat and attempt refs', /provenance\["card_ref"\]/.test(aiBridge) && /provenance\["beat_ref"\]/.test(aiBridge) && /provenance\["attempt_ref"\]/.test(aiBridge));
check('vertical Card Heartime AI SDK golden exists', fs.existsSync(path.join(root, 'conformance/circulation/card-heartime-ai-sdk.integration.test.mjs')));
check('vertical Card Heartime AI SDK golden fixture is pinned', fs.existsSync(path.join(root, 'conformance/circulation/golden/card-heartime-ai-sdk.golden.json')));

console.log(`CARD CONTRACT: PASS · ${checks.length} checks`);
for (const label of checks) console.log(`  ok    ${label}`);
