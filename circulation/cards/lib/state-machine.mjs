import { digestValue } from './canonical.mjs';
import { CARD_TERMINAL_STATES, validateCardV1 } from './card-v1.mjs';
import { applyCardPatch, makeCardPatch } from './patch.mjs';
import { unresolvedUncertainties } from './epistemic.mjs';

export const CARD_TRANSITION_CONTRACT_VERSION = 'powerfarm.card-transition.v1';

const ALLOWED = Object.freeze({
  prepared: new Set(['emitted', 'deferred', 'blocked']),
  deferred: new Set(['prepared', 'emitted', 'blocked']),
  emitted: new Set(['acknowledged', 'deferred', 'orphaned', 'blocked']),
  acknowledged: new Set(['executing', 'orphaned', 'blocked']),
  executing: new Set(['evidence_pending', 'orphaned', 'failed', 'blocked']),
  evidence_pending: new Set(['settled', 'orphaned', 'failed', 'blocked']),
  challenged: new Set(['prepared', 'blocked']),
  orphaned: new Set(['reconciling', 'blocked']),
  reconciling: new Set(['prepared', 'emitted', 'failed', 'blocked']),
  failed: new Set(['prepared', 'terminal']),
  blocked: new Set(['prepared', 'terminal']),
  settled: new Set(['terminal']),
  terminal: new Set(),
});

function requireIso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
}

function requireRef(value, label) {
  if (typeof value !== 'string' || !/^pf(?:\.[a-z0-9][a-z0-9-]*)+$/.test(value)) throw new TypeError(`${label} must be a pf.* reference`);
}

function liveNeedsExpectation(state) {
  return !CARD_TERMINAL_STATES.has(state) && state !== 'blocked';
}

export async function transitionCard(card, {
  to,
  at,
  nextExpected = undefined,
  beatRef = undefined,
  attemptRef = undefined,
  blockedReason = undefined,
  reconciliationRef = undefined,
  nextSample = undefined,
  reason = null,
} = {}) {
  validateCardV1(card, { requireSeal: true });
  requireIso(at, 'transition.at');
  const from = card.circulation.state;
  if (!ALLOWED[from]?.has(to)) throw new Error(`illegal Card circulation transition: ${from} -> ${to}`);
  if (Date.parse(at) < Date.parse(card.updated_at)) throw new Error('Card transition cannot move time backwards');

  const resolvedBeat = beatRef ?? card.circulation.beat_ref ?? null;
  const resolvedAttempt = attemptRef ?? card.circulation.attempt_ref ?? null;
  const resolvedReconciliation = reconciliationRef ?? card.circulation.reconciliation_ref ?? null;

  if (to === 'emitted') requireRef(resolvedBeat, 'transition.beatRef');
  if (['executing', 'evidence_pending'].includes(to)) requireRef(resolvedAttempt, 'transition.attemptRef');
  if (to === 'blocked' && (!blockedReason || typeof blockedReason !== 'string')) {
    throw new Error('blocked transition requires blockedReason');
  }
  if (liveNeedsExpectation(to)) {
    requireIso(nextExpected, 'transition.nextExpected');
    if (Date.parse(nextExpected) < Date.parse(at)) throw new Error('transition.nextExpected cannot precede transition.at');
  }
  const resolvedNextSample = nextSample === undefined ? card.epistemic.next_sample : nextSample;
  if (resolvedNextSample != null) {
    requireIso(resolvedNextSample, 'transition.nextSample');
    if (Date.parse(resolvedNextSample) < Date.parse(at)) throw new Error('transition.nextSample cannot precede transition.at');
  }
  if (to === 'deferred' && unresolvedUncertainties(card).length > 0 && resolvedNextSample == null) {
    throw new Error(`deferred Card ${card.ref} with unresolved epistemic uncertainty requires epistemic.next_sample`);
  }

  const transition = {
    contract_version: CARD_TRANSITION_CONTRACT_VERSION,
    card_ref: card.ref,
    card_generation: card.generation,
    base_revision: card.revision,
    result_revision: card.revision + 1,
    from,
    to,
    at,
    beat_ref: resolvedBeat,
    attempt_ref: resolvedAttempt,
    reason,
  };
  const transitionRef = await digestValue(transition);

  const set = {
    'circulation.state': to,
    'circulation.last_progress_at': at,
    'circulation.next_expected': liveNeedsExpectation(to) ? nextExpected : null,
    'circulation.blocked_reason': to === 'blocked' ? blockedReason : null,
  };
  if (resolvedBeat != null) set['circulation.beat_ref'] = resolvedBeat;
  if (resolvedAttempt != null) set['circulation.attempt_ref'] = resolvedAttempt;
  if (resolvedReconciliation != null) set['circulation.reconciliation_ref'] = resolvedReconciliation;
  if (nextSample !== undefined) set['epistemic.next_sample'] = nextSample;
  if (to === 'emitted') {
    set['circulation.emitted_at'] = at;
    if (from === 'reconciling') set['circulation.retry_count'] = card.circulation.retry_count + 1;
  }
  if (to === 'acknowledged') set['circulation.acknowledged_at'] = at;

  const patch = makeCardPatch({
    card,
    organ: 'heartime',
    at,
    reason: reason ?? `circulation ${from} -> ${to}`,
    set,
    append: { 'lineage.transition_refs': [transitionRef] },
  });
  const next = await applyCardPatch(card, patch);
  return {
    card: next,
    transition: { ...transition, transition_ref: transitionRef, result_sha256: next.content_sha256 },
  };
}

export function allowedTransitions(state) {
  return [...(ALLOWED[state] ?? [])];
}
