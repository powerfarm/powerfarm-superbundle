import { CARD_TERMINAL_STATES, validateCardV1 } from './card-v1.mjs';
import { transitionCard } from './state-machine.mjs';
import { assessEpistemicState } from './epistemic.mjs';
import { assessResourceState, recordHeartimeBeat } from './resources.mjs';

export const CIRCULATION_DECISION = Object.freeze({
  CIRCULATE: 'CIRCULATE',
  DEFER: 'DEFER',
  BLOCK: 'BLOCK',
  RECONCILE: 'RECONCILE',
});

function atMs(value, label) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new TypeError(`${label} must be an ISO timestamp`);
  return ms;
}

export function assessCardCirculation(card, { now }) {
  validateCardV1(card, { requireSeal: true });
  const current = atMs(now, 'now');
  const circulation = card.circulation;

  if (CARD_TERMINAL_STATES.has(circulation.state)) {
    return { decision: CIRCULATION_DECISION.BLOCK, reason: 'terminal' };
  }
  if (circulation.state === 'blocked') {
    return { decision: CIRCULATION_DECISION.BLOCK, reason: circulation.blocked_reason ?? 'blocked' };
  }
  if (['orphaned', 'reconciling'].includes(circulation.state)) {
    return { decision: CIRCULATION_DECISION.RECONCILE, reason: circulation.state };
  }
  if (circulation.deadline != null && atMs(circulation.deadline, 'deadline') <= current) {
    return { decision: CIRCULATION_DECISION.BLOCK, reason: 'deadline_expired' };
  }
  if (!['prepared', 'deferred'].includes(circulation.state)) {
    return { decision: CIRCULATION_DECISION.DEFER, reason: 'already_in_circulation' };
  }
  const resources = assessResourceState(card, { now });
  if (resources.blocked) {
    return { decision: CIRCULATION_DECISION.BLOCK, reason: resources.reason, resources };
  }
  const epistemic = assessEpistemicState(card, { now });
  if (epistemic.next_sample_due) {
    return { decision: CIRCULATION_DECISION.CIRCULATE, reason: 'epistemic_sample_due', epistemic };
  }
  if (epistemic.stale_observation_refs.length > 0) {
    return { decision: CIRCULATION_DECISION.CIRCULATE, reason: 'epistemic_stale', epistemic };
  }
  if (circulation.next_expected != null && atMs(circulation.next_expected, 'next_expected') > current) {
    return { decision: CIRCULATION_DECISION.DEFER, reason: 'not_due' };
  }
  return { decision: CIRCULATION_DECISION.CIRCULATE, reason: 'due' };
}

export async function emitCard(card, { at, beatRef, nextExpected }) {
  const assessment = assessCardCirculation(card, { now: at });
  if (assessment.decision !== CIRCULATION_DECISION.CIRCULATE) {
    return { ...assessment, card, transition: null };
  }
  const emitted = await transitionCard(card, {
    to: 'emitted',
    at,
    beatRef,
    nextExpected,
    reason: 'Heartime emission',
  });
  const metered = await recordHeartimeBeat(emitted.card, { at, beatRef });
  return {
    decision: CIRCULATION_DECISION.CIRCULATE,
    reason: 'emitted',
    card: metered.card,
    transition: emitted.transition,
    resource_observation: metered.observation,
    resource_state: metered.resource_state,
  };
}
