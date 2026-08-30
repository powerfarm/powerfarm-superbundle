import {
  CARD_CONTRACT_VERSION,
  validateCardV1,
} from '../../cards/lib/card-v1.mjs';
import {
  BASE_RECONCILIATION_FORBIDDEN_KEYS,
  HEARTIME_CYCLE_VERSION,
  HEARTIME_PORT_VERSIONS,
  HEARTIME_RUNTIME_REF,
  MAX_RECONCILIATION_SUMMARY_BYTES,
  assertCompactJson,
  assertGeneration,
  assertInstitutionalRef,
  assertNonNegativeInteger,
  assertOnlyFields,
  assertOptionalInstitutionalRef,
  assertPlainObject,
  assertIsoTimestamp,
  validateCallerContext,
  validateWakeHintBase,
} from '../../lib/contract.mjs';

export const FIRST_SEAM_CONTRACT_ID = 'pf.contract.first-seam.v1';
export const FIRST_SEAM_SCHEMA_VERSION = 1;
export const ATTENTION_RECONCILER_REF = 'pf.reconciler.attention';
export const ATTENTION_RECONCILER_RUNTIME_REF = 'pf.runtime.attention-reconciler';

export const PORT_VERSIONS = Object.freeze({
  cards: 'powerfarm.cards.attention.v1',
  registry: 'powerfarm.registry.occupancy.v1',
  authority: 'powerfarm.process.authority-projection.v1',
  runs: 'powerfarm.platform.attention-runs.v1',
  evidence: 'powerfarm.evidence.recording.v1',
  reconciler: 'powerfarm.first-seam.reconciler.v1',
  ...HEARTIME_PORT_VERSIONS,
});

const responseContracts = new Set([
  'none',
  'acknowledge',
  'answer',
  'investigate',
  'choose',
  'abstain',
  'act',
]);
const reconciliationStates = new Set(['reconciled', 'blocked']);
const summaryFields = new Set([
  'state',
  'reason',
  'scope',
  'beat_ref',
  'recipient_ref',
  'observed_at',
  'wake_pack_ref',
  'wake_pack_card_count',
  'returned',
  'returned_count',
  'observations',
  'observation_count',
]);
const returnedFields = new Set([
  'card_ref',
  'observed_generation',
  'current_generation',
  'response_ref',
  'stale',
  'disposition',
]);
const observationFields = new Set([
  'card_ref',
  'generation',
  'obligation_ref',
  'attempt_ref',
  'state',
  'successor_of',
]);
const ATTENTION_FORBIDDEN_SUMMARY_KEYS = new Set(BASE_RECONCILIATION_FORBIDDEN_KEYS);

export function assertSummaryIsCompact(summary) {
  return assertCompactJson(summary, {
    label: 'reconciliation summary',
    maxBytes: MAX_RECONCILIATION_SUMMARY_BYTES,
    forbiddenKeys: ATTENTION_FORBIDDEN_SUMMARY_KEYS,
  });
}

export function normalizeCard(card, expectedScope) {
  assertPlainObject(card, 'Card object');
  if (card.contract_version === CARD_CONTRACT_VERSION) {
    validateCardV1(card, { requireSeal: true });
    card = {
      ref: card.ref,
      generation: card.generation,
      scope: card.scope,
      obligation_ref: card.attention?.obligation_ref,
      condition: card.attention?.condition ?? (card.circulation.state === 'settled' ? 'resolved' : 'pending'),
      response_contract: card.attention?.response_contract ?? 'none',
      title: card.attention?.title,
      why: card.attention?.why,
      evidence_refs: card.evidence?.refs ?? [],
      affordances: card.attention?.affordances ?? [],
      expires_at: card.attention?.expires_at ?? card.circulation?.deadline ?? null,
      source_contract_version: CARD_CONTRACT_VERSION,
      source_content_sha256: card.content_sha256,
    };
  }
  assertInstitutionalRef(card.ref, 'CardRef');
  assertGeneration(card.generation, 'Card generation');
  assertInstitutionalRef(card.scope, 'Card scope');
  if (expectedScope != null && card.scope !== expectedScope) {
    throw new Error(`Card ${card.ref} belongs to ${card.scope}, expected ${expectedScope}`);
  }
  const responseContract = card.response_contract ?? 'none';
  if (!responseContracts.has(responseContract)) {
    throw new Error(`unsupported response contract for ${card.ref}: ${responseContract}`);
  }
  if (card.evidence_refs != null) {
    if (!Array.isArray(card.evidence_refs)) throw new TypeError(`evidence_refs must be an array for ${card.ref}`);
    for (const ref of card.evidence_refs) assertInstitutionalRef(ref, 'EvidenceRef');
  }
  return {
    condition: 'pending',
    evidence_refs: [],
    affordances: [],
    ...card,
    response_contract: responseContract,
    obligation_ref: card.obligation_ref ?? `${card.ref}@${card.generation}`,
  };
}

export function normalizeCirculatingCard(card, expectedScope) {
  assertPlainObject(card, 'circulating Card');
  if (card.contract_version !== CARD_CONTRACT_VERSION) {
    throw new Error(`Cards.listCurrent must return sealed ${CARD_CONTRACT_VERSION}; legacy attention-shaped Cards cannot circulate`);
  }
  validateCardV1(card, { requireSeal: true });
  return normalizeCard(card, expectedScope);
}

export function validateWakeHint(hint) {
  return validateWakeHintBase(hint, { reconcilerRef: ATTENTION_RECONCILER_REF });
}

export function summarizeReturnedResponse(record = {}) {
  return {
    card_ref: record.card_ref ?? null,
    observed_generation: record.observed_generation ?? null,
    current_generation: record.current_generation ?? null,
    response_ref: record.response_ref ?? record.ref ?? null,
    stale: Boolean(record.stale),
    disposition: record.disposition ?? record.response?.disposition ?? 'response',
  };
}

function validateReturned(item, index) {
  assertPlainObject(item, `returned[${index}]`);
  assertOnlyFields(item, returnedFields, `returned[${index}]`);
  assertOptionalInstitutionalRef(item.card_ref, `returned[${index}].card_ref`);
  if (item.observed_generation != null) assertGeneration(item.observed_generation, `returned[${index}].observed_generation`);
  if (item.current_generation != null) assertGeneration(item.current_generation, `returned[${index}].current_generation`);
  assertOptionalInstitutionalRef(item.response_ref, `returned[${index}].response_ref`);
  if (typeof item.stale !== 'boolean') throw new TypeError(`returned[${index}].stale must be boolean`);
  if (typeof item.disposition !== 'string' || item.disposition.length === 0) {
    throw new TypeError(`returned[${index}].disposition must be a non-empty string`);
  }
}

function validateObservation(item, index) {
  assertPlainObject(item, `observations[${index}]`);
  assertOnlyFields(item, observationFields, `observations[${index}]`);
  assertInstitutionalRef(item.card_ref, `observations[${index}].card_ref`);
  assertGeneration(item.generation, `observations[${index}].generation`);
  assertOptionalInstitutionalRef(item.attempt_ref, `observations[${index}].attempt_ref`);
  assertOptionalInstitutionalRef(item.successor_of, `observations[${index}].successor_of`);
  if (item.obligation_ref != null && (typeof item.obligation_ref !== 'string' || item.obligation_ref.length === 0)) {
    throw new TypeError(`observations[${index}].obligation_ref must be a non-empty string`);
  }
  if (typeof item.state !== 'string' || item.state.length === 0) {
    throw new TypeError(`observations[${index}].state must be a non-empty string`);
  }
}

export function validateReconciliationSummary(summary) {
  assertPlainObject(summary, 'reconciliation summary');
  assertSummaryIsCompact(summary);
  assertOnlyFields(summary, summaryFields, 'reconciliation summary');
  if (!reconciliationStates.has(summary.state)) throw new Error(`invalid reconciliation state: ${summary.state}`);
  assertInstitutionalRef(summary.scope, 'summary scope');
  assertInstitutionalRef(summary.beat_ref, 'BeatRef');
  assertOptionalInstitutionalRef(summary.recipient_ref, 'OccupancyRef');
  assertOptionalInstitutionalRef(summary.wake_pack_ref, 'WakePackRef');
  assertIsoTimestamp(summary.observed_at, 'summary observed_at');
  if (summary.reason != null && typeof summary.reason !== 'string') throw new TypeError('summary reason must be a string');

  const returned = summary.returned ?? [];
  const observations = summary.observations ?? [];
  if (!Array.isArray(returned)) throw new TypeError('summary returned must be an array');
  if (!Array.isArray(observations)) throw new TypeError('summary observations must be an array');
  returned.forEach(validateReturned);
  observations.forEach(validateObservation);

  assertNonNegativeInteger(summary.returned_count, 'returned_count');
  assertNonNegativeInteger(summary.observation_count, 'observation_count');
  if (summary.returned_count !== returned.length) throw new Error('returned_count does not match returned length');
  if (summary.observation_count !== observations.length) throw new Error('observation_count does not match observations length');
  if (summary.wake_pack_card_count != null) {
    assertNonNegativeInteger(summary.wake_pack_card_count, 'wake_pack_card_count');
  }
  return summary;
}

export {
  HEARTIME_CYCLE_VERSION,
  HEARTIME_RUNTIME_REF,
  MAX_RECONCILIATION_SUMMARY_BYTES as MAX_SUMMARY_BYTES,
  assertGeneration,
  assertInstitutionalRef,
  validateCallerContext,
};
