import {
  FIRST_SEAM_CONTRACT_ID,
  assertGeneration,
  assertInstitutionalRef,
  normalizeCard,
  normalizeCirculatingCard,
  summarizeReturnedResponse,
  validateReconciliationSummary,
} from './contract.mjs';

const required = (object, method, label) => {
  if (!object || typeof object[method] !== 'function') throw new TypeError(`${label}.${method} is required`);
};

const hex = (buffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');

async function semanticDigest(parts) {
  const semantic = JSON.stringify(parts);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(semantic));
  return `sha256:${hex(digest)}`;
}

export async function obligationKey({ cardRef, generation, scope, responseContract, obligationRef }) {
  assertInstitutionalRef(cardRef, 'CardRef');
  assertGeneration(generation, 'Card generation');
  assertInstitutionalRef(scope, 'scope');
  return semanticDigest([
    FIRST_SEAM_CONTRACT_ID,
    'attention-obligation',
    cardRef,
    generation,
    obligationRef ?? `${cardRef}@${generation}`,
    scope,
    responseContract ?? 'none',
  ]);
}

async function responsePersistenceKey({ attemptRef, cardRef, generation, responseRef = null }) {
  assertInstitutionalRef(attemptRef, 'AttemptRef');
  assertInstitutionalRef(cardRef, 'CardRef');
  assertGeneration(generation, 'Card generation');
  if (responseRef != null) assertInstitutionalRef(responseRef, 'ResponseRef');
  return semanticDigest([
    FIRST_SEAM_CONTRACT_ID,
    'attention-response-persistence',
    attemptRef,
    cardRef,
    generation,
    responseRef,
  ]);
}

function validatePorts({ cards, occupancies, authority, runs, evidence }) {
  required(cards, 'listCurrent', 'cards');
  required(cards, 'compileWakePack', 'cards');
  required(cards, 'recordResponse', 'cards');
  required(occupancies, 'resolve', 'occupancies');
  required(authority, 'project', 'authority');
  required(runs, 'completedUnrecorded', 'runs');
  required(runs, 'markRecorded', 'runs');
  required(runs, 'ensureAttempt', 'runs');
  required(runs, 'observe', 'runs');
  required(evidence, 'record', 'evidence');
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function validateCompletedAttempt(value, scope) {
  const attempt = requireObject(value, 'completed attention attempt');
  assertInstitutionalRef(attempt.ref, 'AttemptRef');
  assertInstitutionalRef(attempt.card_ref, 'CardRef');
  assertGeneration(attempt.card_generation, 'Card generation');
  assertInstitutionalRef(attempt.scope, 'attempt scope');
  if (attempt.scope !== scope) throw new Error(`Attempt ${attempt.ref} belongs to ${attempt.scope}, expected ${scope}`);
  assertInstitutionalRef(attempt.occupancy_ref, 'OccupancyRef');
  assertInstitutionalRef(attempt.beat_ref, 'BeatRef');
  if (attempt.response_ref != null) assertInstitutionalRef(attempt.response_ref, 'ResponseRef');
  return attempt;
}

function validateCurrentCards(rawCards, scope) {
  const current = requireArray(rawCards, 'Cards.listCurrent result').map((card) => normalizeCirculatingCard(card, scope));
  const identities = new Set();
  for (const card of current) {
    const key = `${card.ref}@${card.generation}`;
    if (identities.has(key)) throw new Error(`Cards.listCurrent returned duplicate ${key}`);
    identities.add(key);
  }
  return current;
}

function validateWakePack(wakePack, currentByRef, scope) {
  requireObject(wakePack, 'WakePack');
  assertInstitutionalRef(wakePack.ref, 'WakePackRef');
  const cards = requireArray(wakePack.cards ?? [], 'WakePack.cards');
  const seen = new Set();
  const normalized = cards.map((raw) => {
    const card = normalizeCard(raw.scope == null ? { ...raw, scope } : raw, scope);
    if (seen.has(card.ref)) throw new Error(`WakePack contains duplicate CardRef ${card.ref}`);
    seen.add(card.ref);
    const current = currentByRef.get(card.ref);
    if (!current) throw new Error(`WakePack contains Card not present in current attention: ${card.ref}`);
    if (current.generation !== card.generation) {
      throw new Error(`WakePack generation mismatch for ${card.ref}: ${card.generation} != ${current.generation}`);
    }
    if (current.obligation_ref !== card.obligation_ref) {
      throw new Error(`WakePack obligation mismatch for ${card.ref}`);
    }
    if (card.source_contract_version !== current.source_contract_version || card.source_content_sha256 !== current.source_content_sha256) {
      throw new Error(`WakePack source binding mismatch for ${card.ref}`);
    }
    return card;
  });
  return { ...wakePack, cards: normalized };
}

function validateAttempt(value) {
  const attempt = requireObject(value, 'Platform attempt');
  assertInstitutionalRef(attempt.ref, 'AttemptRef');
  if (attempt.successor_of != null) assertInstitutionalRef(attempt.successor_of, 'predecessor AttemptRef');
  return attempt;
}

/**
 * One level-triggered attention reconciliation pass.
 *
 * Heartime supplies only a wake hint. This pass always reads current durable
 * state from organ-owned ports. The controller owns no institutional state.
 */
export async function reconcileAttention({
  scope,
  beatRef,
  now = new Date(),
  cards,
  occupancies,
  authority,
  runs,
  evidence,
}) {
  assertInstitutionalRef(scope, 'scope');
  assertInstitutionalRef(beatRef, 'BeatRef');
  validatePorts({ cards, occupancies, authority, runs, evidence });

  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('now must be a valid Date');
  const observedAt = date.toISOString();

  // Preserve completed work before resolving the current Occupancy. Evidence
  // from a previous Occupancy remains valid even when the chair is empty now.
  const returned = [];
  const completedAttempts = requireArray(
    await runs.completedUnrecorded(scope),
    'Platform completedUnrecorded result',
  );
  for (const rawAttempt of completedAttempts) {
    const attempt = validateCompletedAttempt(rawAttempt, scope);
    const response = requireObject(attempt.response ?? { disposition: 'unknown' }, 'attempt response');
    const persistenceKey = await responsePersistenceKey({
      attemptRef: attempt.ref,
      cardRef: attempt.card_ref,
      generation: attempt.card_generation,
      responseRef: attempt.response_ref ?? null,
    });
    const recorded = requireObject(await cards.recordResponse({
      cardRef: attempt.card_ref,
      observedGeneration: attempt.card_generation,
      scope,
      response,
      attemptRef: attempt.ref,
      occupancyRef: attempt.occupancy_ref,
      beatRef: attempt.beat_ref,
      observedAt,
      idempotencyKey: persistenceKey,
    }), 'Cards recordResponse result');
    const responseRef = recorded.response_ref ?? recorded.ref;
    assertInstitutionalRef(responseRef, 'ResponseRef');
    const responseSummary = summarizeReturnedResponse({
      ...recorded,
      response_ref: responseRef,
      card_ref: attempt.card_ref,
      observed_generation: attempt.card_generation,
      disposition: response.disposition ?? 'response',
    });
    const evidenceRecord = requireObject(await evidence.record({
      idempotency_key: persistenceKey,
      kind: 'attention.response.observed',
      card_ref: attempt.card_ref,
      card_generation: attempt.card_generation,
      attempt_ref: attempt.ref,
      occupancy_ref: attempt.occupancy_ref,
      beat_ref: attempt.beat_ref,
      response_ref: responseRef,
      stale: responseSummary.stale,
      disposition: responseSummary.disposition,
      observed_at: observedAt,
    }), 'Evidence record result');
    assertInstitutionalRef(evidenceRecord.ref, 'EvidenceRef');
    await runs.markRecorded(attempt.ref, { observedAt, responseRef });
    returned.push(responseSummary);
  }

  const recipient = await occupancies.resolve(scope, { observedAt });
  if (!recipient) {
    return validateReconciliationSummary({
      state: 'blocked',
      reason: 'no_occupancy',
      scope,
      beat_ref: beatRef,
      observed_at: observedAt,
      returned,
      returned_count: returned.length,
      observations: [],
      observation_count: 0,
    });
  }
  requireObject(recipient, 'Occupancy');
  assertInstitutionalRef(recipient.ref, 'OccupancyRef');

  const current = validateCurrentCards(await cards.listCurrent({ scope, at: observedAt }), scope);
  const currentByRef = new Map(current.map((card) => [card.ref, card]));

  const projected = [];
  for (const card of current) {
    const effectiveAffordances = await authority.project({ card, recipient, at: observedAt });
    requireArray(effectiveAffordances ?? [], `effective affordances for ${card.ref}`);
    projected.push({ ...card, effective_affordances: effectiveAffordances ?? [] });
  }

  const wakePack = validateWakePack(await cards.compileWakePack({
    scope,
    recipient,
    cards: projected,
    at: observedAt,
  }), currentByRef, scope);

  const observations = [];
  for (const card of wakePack.cards) {
    if (card.condition === 'resolved' || card.response_contract === 'none') {
      observations.push({ card_ref: card.ref, generation: card.generation, state: 'observed' });
      continue;
    }

    const key = await obligationKey({
      cardRef: card.ref,
      generation: card.generation,
      obligationRef: card.obligation_ref,
      scope,
      responseContract: card.response_contract,
    });
    const attempt = validateAttempt(await runs.ensureAttempt({
      idempotencyKey: key,
      cardRef: card.ref,
      cardGeneration: card.generation,
      obligationRef: card.obligation_ref,
      responseContract: card.response_contract,
      scope,
      occupancyRef: recipient.ref,
      beatRef,
      wakePackRef: wakePack.ref,
      cardProjection: card,
      observedAt,
    }));
    const state = requireObject(await runs.observe(attempt.ref), 'Platform attempt observation');
    if (typeof state.status !== 'string' || state.status.length === 0) {
      throw new TypeError(`Platform attempt ${attempt.ref} omitted status`);
    }
    observations.push({
      card_ref: card.ref,
      generation: card.generation,
      obligation_ref: card.obligation_ref,
      attempt_ref: attempt.ref,
      state: state.status,
      successor_of: attempt.successor_of ?? null,
    });
  }

  return validateReconciliationSummary({
    state: 'reconciled',
    scope,
    beat_ref: beatRef,
    recipient_ref: recipient.ref,
    observed_at: observedAt,
    wake_pack_ref: wakePack.ref,
    wake_pack_card_count: wakePack.cards.length,
    returned,
    returned_count: returned.length,
    observations,
    observation_count: observations.length,
  });
}
