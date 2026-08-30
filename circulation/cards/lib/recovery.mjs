import { digestValue, sha256Hex, canonicalJson } from './canonical.mjs';
import { applyCardPatch, makeCardPatch } from './patch.mjs';
import { transitionCard } from './state-machine.mjs';
import { validateCardV1, verifyCardSeal } from './card-v1.mjs';
import { assessResourceState, recordHeartimeBeat } from './resources.mjs';

const PF_REF = /^pf(?:\.[a-z0-9][a-z0-9-]*)+$/;

function pfRef(value, label) {
  if (typeof value !== 'string' || !PF_REF.test(value)) throw new TypeError(`${label} must be a pf.* reference`);
  return value;
}

function iso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
}

export function assessOccupancy(card, observation) {
  validateCardV1(card, { requireSeal: true });
  if (!observation || typeof observation !== 'object') throw new TypeError('Registry occupancy observation is required');
  pfRef(observation.office_ref, 'observation.office_ref');
  pfRef(observation.occupancy_ref, 'observation.occupancy_ref');
  pfRef(observation.identity_ref, 'observation.identity_ref');
  if (observation.office_ref !== card.institutional.office_ref) {
    return { status: 'INVALID', reason: 'office_mismatch' };
  }
  if (
    observation.occupancy_ref === card.institutional.occupancy_ref
    && observation.identity_ref === card.institutional.identity_ref
  ) {
    return { status: 'CURRENT', reason: 'registry_matches_card' };
  }
  return {
    status: 'STALE',
    reason: 'registry_occupancy_changed',
    previous: {
      identity_ref: card.institutional.identity_ref,
      occupancy_ref: card.institutional.occupancy_ref,
    },
    current: {
      identity_ref: observation.identity_ref,
      occupancy_ref: observation.occupancy_ref,
    },
  };
}

export async function occupancyReconciliationRef(card, observation) {
  validateCardV1(card, { requireSeal: true });
  if (!(await verifyCardSeal(card))) throw new Error(`Card ${card.ref} content seal mismatch`);
  const assessment = assessOccupancy(card, observation);
  if (assessment.status !== 'STALE') throw new Error(`Card ${card.ref} does not require occupancy reconciliation`);
  const digest = await sha256Hex(canonicalJson({
    v: 1,
    card_ref: card.ref,
    generation: card.generation,
    attempt_ref: card.circulation.attempt_ref,
    office_ref: card.institutional.office_ref,
    previous: assessment.previous,
    current: assessment.current,
  }));
  return `pf.reconciliation.${digest.slice(0, 32)}`;
}

export async function takeoverRequestId({ runRef, reconciliationRef, successorOccupancyRef }) {
  if (typeof runRef !== 'string' || runRef.length === 0) throw new TypeError('runRef is required');
  pfRef(reconciliationRef, 'reconciliationRef');
  pfRef(successorOccupancyRef, 'successorOccupancyRef');
  const digest = await sha256Hex(canonicalJson({
    v: 1, run_ref: runRef, reconciliation_ref: reconciliationRef, successor_occupancy_ref: successorOccupancyRef,
  }));
  return `pfxt1-${digest}`;
}

export async function orphanForOccupancy(card, { at, nextExpected, observation, reconciliationRef = null } = {}) {
  iso(at, 'recovery.at');
  iso(nextExpected, 'recovery.nextExpected');
  const assessment = assessOccupancy(card, observation);
  if (assessment.status !== 'STALE') return { card, assessment, transition: null, reconciliation_ref: null };
  const ref = reconciliationRef ?? await occupancyReconciliationRef(card, observation);
  const result = await transitionCard(card, {
    to: 'orphaned', at, nextExpected, reconciliationRef: ref, reason: 'Registry occupancy changed',
  });
  return { ...result, assessment, reconciliation_ref: ref };
}

export async function beginReconciliation(card, { at, nextExpected } = {}) {
  if (card.circulation.state !== 'orphaned') throw new Error(`Card ${card.ref} must be orphaned before reconciliation`);
  return transitionCard(card, {
    to: 'reconciling', at, nextExpected, reconciliationRef: card.circulation.reconciliation_ref,
    reason: 'Heartime reconciliation started',
  });
}

export async function applyRegistryOccupancyObservation(card, { at, observation } = {}) {
  iso(at, 'registry patch at');
  const assessment = assessOccupancy(card, observation);
  if (assessment.status === 'INVALID') throw new Error(`Registry observation does not belong to Card Office ${card.institutional.office_ref}`);
  if (assessment.status === 'CURRENT') return card;
  const patch = makeCardPatch({
    card, organ: 'registry', at, reason: 'Registry occupancy observation refreshed on Card',
    set: {
      'institutional.identity_ref': observation.identity_ref,
      'institutional.occupancy_ref': observation.occupancy_ref,
    },
  });
  return applyCardPatch(card, patch);
}

export async function reissueReconciledCard(card, { at, beatRef, nextExpected } = {}) {
  if (card.circulation.state !== 'reconciling') throw new Error(`Card ${card.ref} must be reconciling before reissue`);
  if (!card.circulation.attempt_ref) throw new Error(`Card ${card.ref} cannot reissue without preserving attempt_ref`);
  const resources = assessResourceState(card, { now: at });
  if (resources.blocked) throw new Error(`Card ${card.ref} cannot reissue: ${resources.reason}`);
  const emitted = await transitionCard(card, {
    to: 'emitted', at, beatRef, attemptRef: card.circulation.attempt_ref, nextExpected,
    reconciliationRef: card.circulation.reconciliation_ref,
    reason: 'Heartime recovery reissue',
  });
  const metered = await recordHeartimeBeat(emitted.card, { at, beatRef });
  return { card: metered.card, transition: emitted.transition, resource_observation: metered.observation, resource_state: metered.resource_state };
}

export async function interruptedReconciliationRef(card, reason = 'executor_interrupted') {
  const digest = await digestValue({
    v: 1, card_ref: card.ref, generation: card.generation, attempt_ref: card.circulation.attempt_ref, reason,
  });
  return `pf.reconciliation.${digest.slice('sha256:'.length, 'sha256:'.length + 32)}`;
}

export async function orphanInterruptedCard(card, { at, nextExpected, reason = 'executor_interrupted' } = {}) {
  if (!['emitted', 'acknowledged', 'executing', 'evidence_pending'].includes(card.circulation.state)) {
    throw new Error(`Card ${card.ref} is not in an interruptible circulation state`);
  }
  const reconciliationRef = await interruptedReconciliationRef(card, reason);
  const result = await transitionCard(card, {
    to: 'orphaned', at, nextExpected, reconciliationRef, reason,
  });
  return { ...result, reconciliation_ref: reconciliationRef };
}
