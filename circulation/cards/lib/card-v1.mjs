import { digestValue } from './canonical.mjs';
import { validateEpistemicCollections, verifyEpistemicRecordRef } from './epistemic-schema.mjs';
import { emptyCostConsumption, emptyEnergyConsumption, validateCardResources } from './resource-schema.mjs';

export const CARD_CONTRACT_VERSION = 'powerfarm.card.v1';
export const CARD_SCHEMA_VERSION = 1;
export const CARD_TERMINAL_STATES = Object.freeze(new Set(['settled', 'terminal']));
export const CARD_STATES = Object.freeze(new Set([
  'prepared',
  'emitted',
  'acknowledged',
  'executing',
  'evidence_pending',
  'settled',
  'deferred',
  'challenged',
  'blocked',
  'orphaned',
  'reconciling',
  'failed',
  'terminal',
]));

const INSTITUTIONAL_REF = /^pf(?:\.[a-z0-9][a-z0-9-]*)+$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX_SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const ROOT_FIELDS = new Set([
  'contract_version', 'schema_version', 'ref', 'generation', 'revision', 'scope',
  'created_at', 'updated_at', 'lineage', 'institutional', 'attention', 'circulation',
  'epistemic', 'energy', 'cost', 'execution', 'evidence', 'health', 'content_sha256',
]);
const CIRCULATION_FIELDS = new Set([
  'state', 'priority', 'deadline', 'next_expected', 'beat_ref', 'attempt_ref',
  'retry_count', 'emitted_at', 'acknowledged_at', 'last_progress_at',
  'blocked_reason', 'reconciliation_ref',
]);
const INSTITUTIONAL_FIELDS = new Set([
  'identity_ref', 'office_ref', 'occupancy_ref', 'direction_ref', 'responsibility_ref',
  'authority_ref', 'run_ref', 'run_grant_ref', 'ecs_sha256',
]);
const LINEAGE_FIELDS = new Set(['parent_card_ref', 'transition_refs']);
const EVIDENCE_FIELDS = new Set(['refs']);
const ENERGY_FIELDS = new Set(['authorization', 'consumption']);
const COST_FIELDS = new Set(['authorization', 'consumption']);
const EPISTEMIC_FIELDS = new Set([
  'observations', 'claims', 'uncertainties', 'conflicts', 'freshness', 'next_sample', 'evidence_refs',
]);

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function only(value, allowed, label) {
  plain(value, label);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function institutionalRef(value, label) {
  if (typeof value !== 'string' || !INSTITUTIONAL_REF.test(value)) {
    throw new TypeError(`${label} must use canonical pf.* reference syntax`);
  }
}

function iso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
}

function positiveInt(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
}

function nonNegativeInt(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
}

function validateRefArray(value, label, { digest = false } = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const seen = new Set();
  for (const [index, ref] of value.entries()) {
    nonEmpty(ref, `${label}[${index}]`);
    if (digest && !SHA256.test(ref)) throw new TypeError(`${label}[${index}] must be a sha256: reference`);
    if (seen.has(ref)) throw new Error(`${label} contains duplicate reference: ${ref}`);
    seen.add(ref);
  }
}

function validateCirculation(circulation, card) {
  only(circulation, CIRCULATION_FIELDS, 'Card.circulation');
  if (!CARD_STATES.has(circulation.state)) throw new Error(`unsupported Card circulation state: ${circulation.state}`);
  if (!Number.isSafeInteger(circulation.priority) || circulation.priority < 0) {
    throw new TypeError('Card.circulation.priority must be a non-negative safe integer');
  }
  nonNegativeInt(circulation.retry_count, 'Card.circulation.retry_count');
  for (const field of ['deadline', 'next_expected', 'emitted_at', 'acknowledged_at', 'last_progress_at']) {
    if (circulation[field] != null) iso(circulation[field], `Card.circulation.${field}`);
  }
  for (const field of ['beat_ref', 'attempt_ref', 'reconciliation_ref']) {
    if (circulation[field] != null) institutionalRef(circulation[field], `Card.circulation.${field}`);
  }
  if (circulation.blocked_reason != null) nonEmpty(circulation.blocked_reason, 'Card.circulation.blocked_reason');

  const terminal = CARD_TERMINAL_STATES.has(circulation.state);
  if (!terminal && circulation.state !== 'blocked' && circulation.next_expected == null) {
    throw new Error(`live Card ${card.ref} must carry circulation.next_expected`);
  }
  if (circulation.state === 'blocked' && !circulation.blocked_reason) {
    throw new Error(`blocked Card ${card.ref} must carry circulation.blocked_reason`);
  }
  if (circulation.state === 'emitted') {
    if (!circulation.beat_ref) throw new Error(`emitted Card ${card.ref} must carry circulation.beat_ref`);
    if (!circulation.emitted_at) throw new Error(`emitted Card ${card.ref} must carry circulation.emitted_at`);
  }
  if (['executing', 'evidence_pending'].includes(circulation.state) && !circulation.attempt_ref) {
    throw new Error(`${circulation.state} Card ${card.ref} must carry circulation.attempt_ref`);
  }
}

export function validateCardV1(card, { requireSeal = false } = {}) {
  plain(card, 'Card');
  only(card, ROOT_FIELDS, 'Card');
  if (card.contract_version !== CARD_CONTRACT_VERSION) throw new Error(`unsupported Card contract: ${card.contract_version}`);
  if (card.schema_version !== CARD_SCHEMA_VERSION) throw new Error(`unsupported Card schema version: ${card.schema_version}`);
  institutionalRef(card.ref, 'Card.ref');
  institutionalRef(card.scope, 'Card.scope');
  positiveInt(card.generation, 'Card.generation');
  positiveInt(card.revision, 'Card.revision');
  iso(card.created_at, 'Card.created_at');
  iso(card.updated_at, 'Card.updated_at');
  if (Date.parse(card.updated_at) < Date.parse(card.created_at)) throw new Error('Card.updated_at cannot precede created_at');

  only(card.lineage, LINEAGE_FIELDS, 'Card.lineage');
  if (card.lineage.parent_card_ref != null) institutionalRef(card.lineage.parent_card_ref, 'Card.lineage.parent_card_ref');
  validateRefArray(card.lineage.transition_refs, 'Card.lineage.transition_refs', { digest: true });

  only(card.institutional, INSTITUTIONAL_FIELDS, 'Card.institutional');
  for (const field of ['identity_ref', 'office_ref', 'occupancy_ref', 'direction_ref', 'responsibility_ref']) {
    if (card.institutional[field] != null) institutionalRef(card.institutional[field], `Card.institutional.${field}`);
  }
  for (const field of ['authority_ref', 'run_ref', 'run_grant_ref']) {
    if (card.institutional[field] != null) nonEmpty(card.institutional[field], `Card.institutional.${field}`);
  }
  if (card.institutional.ecs_sha256 != null && !HEX_SHA256.test(card.institutional.ecs_sha256)) {
    throw new TypeError('Card.institutional.ecs_sha256 must be a SHA-256 digest');
  }

  if (card.attention != null) plain(card.attention, 'Card.attention');
  validateCirculation(card.circulation, card);

  only(card.epistemic, EPISTEMIC_FIELDS, 'Card.epistemic');
  for (const field of ['observations', 'claims', 'uncertainties', 'conflicts', 'evidence_refs']) {
    if (!Array.isArray(card.epistemic[field])) throw new TypeError(`Card.epistemic.${field} must be an array`);
  }
  validateEpistemicCollections(card.epistemic);
  validateRefArray(card.epistemic.evidence_refs, 'Card.epistemic.evidence_refs');
  if (card.epistemic.next_sample != null) iso(card.epistemic.next_sample, 'Card.epistemic.next_sample');
  if (card.epistemic.freshness != null) {
    plain(card.epistemic.freshness, 'Card.epistemic.freshness');
    const allowedFreshness = new Set(['assessed_at', 'status', 'stale_refs']);
    for (const key of Object.keys(card.epistemic.freshness)) {
      if (!allowedFreshness.has(key)) throw new Error(`Card.epistemic.freshness contains unsupported field: ${key}`);
    }
    if (card.epistemic.freshness.assessed_at != null) iso(card.epistemic.freshness.assessed_at, 'Card.epistemic.freshness.assessed_at');
    if (card.epistemic.freshness.status != null && !['FRESH', 'STALE', 'UNKNOWN'].includes(card.epistemic.freshness.status)) {
      throw new Error(`unsupported Card epistemic freshness status: ${card.epistemic.freshness.status}`);
    }
    if (card.epistemic.freshness.stale_refs != null) validateRefArray(card.epistemic.freshness.stale_refs, 'Card.epistemic.freshness.stale_refs');
  }

  only(card.energy, ENERGY_FIELDS, 'Card.energy');
  only(card.cost, COST_FIELDS, 'Card.cost');
  validateCardResources(card);
  plain(card.execution, 'Card.execution');
  only(card.evidence, EVIDENCE_FIELDS, 'Card.evidence');
  validateRefArray(card.evidence.refs, 'Card.evidence.refs');
  plain(card.health, 'Card.health');

  if (card.content_sha256 != null && !SHA256.test(card.content_sha256)) {
    throw new TypeError('Card.content_sha256 must be a sha256: reference');
  }
  if (requireSeal && card.content_sha256 == null) throw new Error(`Card ${card.ref} must be content-addressed`);
  return card;
}

export function unsealedCard(card) {
  const clone = structuredClone(card);
  delete clone.content_sha256;
  return clone;
}

export async function cardDigest(card) {
  validateCardV1(card);
  return digestValue(unsealedCard(card));
}

async function epistemicRefsValid(card) {
  const records = [
    ...card.epistemic.observations,
    ...card.epistemic.claims,
    ...card.epistemic.uncertainties,
    ...card.epistemic.conflicts,
  ];
  const checks = await Promise.all(records.map((record) => verifyEpistemicRecordRef(record)));
  return checks.every(Boolean);
}

export async function sealCard(card) {
  const clone = structuredClone(card);
  delete clone.content_sha256;
  validateCardV1(clone);
  if (!(await epistemicRefsValid(clone))) throw new Error(`Card ${clone.ref} contains an epistemic record whose content-addressed ref does not match its body`);
  clone.content_sha256 = await digestValue(clone);
  return clone;
}

export async function verifyCardSeal(card) {
  validateCardV1(card, { requireSeal: true });
  if (!(await epistemicRefsValid(card))) return false;
  return card.content_sha256 === await digestValue(unsealedCard(card));
}

export async function createCardV1(input) {
  plain(input, 'Card input');
  const now = input.created_at ?? new Date().toISOString();
  const card = {
    contract_version: CARD_CONTRACT_VERSION,
    schema_version: CARD_SCHEMA_VERSION,
    ref: input.ref,
    generation: input.generation ?? 1,
    revision: input.revision ?? 1,
    scope: input.scope,
    created_at: now,
    updated_at: input.updated_at ?? now,
    lineage: {
      parent_card_ref: input.lineage?.parent_card_ref ?? null,
      transition_refs: [...(input.lineage?.transition_refs ?? [])],
    },
    institutional: { ...(input.institutional ?? {}) },
    attention: { ...(input.attention ?? {}) },
    circulation: {
      state: 'prepared',
      priority: 0,
      deadline: null,
      next_expected: input.circulation?.next_expected ?? now,
      beat_ref: null,
      attempt_ref: null,
      retry_count: 0,
      emitted_at: null,
      acknowledged_at: null,
      last_progress_at: null,
      blocked_reason: null,
      reconciliation_ref: null,
      ...(input.circulation ?? {}),
    },
    epistemic: {
      observations: [], claims: [], uncertainties: [], conflicts: [], freshness: {}, next_sample: null, evidence_refs: [],
      ...(input.epistemic ?? {}),
    },
    energy: {
      authorization: { ...(input.energy?.authorization ?? {}) },
      consumption: { ...emptyEnergyConsumption(), ...(input.energy?.consumption ?? {}) },
    },
    cost: {
      authorization: { ...(input.cost?.authorization ?? {}) },
      consumption: { ...emptyCostConsumption(input.cost?.authorization?.currency ?? input.cost?.consumption?.currency ?? 'USD'), ...(input.cost?.consumption ?? {}) },
    },
    execution: { ...(input.execution ?? {}) },
    evidence: { refs: [...(input.evidence?.refs ?? [])] },
    health: { ...(input.health ?? {}) },
  };
  return sealCard(card);
}
