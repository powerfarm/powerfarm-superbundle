import { canonicalJson, sha256Hex } from './canonical.mjs';
import { validateCardV1, verifyCardSeal } from './card-v1.mjs';
import { applyCardPatch, makeCardPatch } from './patch.mjs';
import {
  ENERGY_METERS,
  RESOURCE_HEALTH_PROJECTION_VERSION,
  RESOURCE_OBSERVATION_CONTRACT_VERSION,
  normalizeEnergyVector,
  validateResourceObservationShape,
} from './resource-schema.mjs';

const PF_REF = /^pf(?:\.[a-z0-9][a-z0-9-]*)+$/;

function ref(value, label) {
  if (typeof value !== 'string' || !PF_REF.test(value)) throw new TypeError(`${label} must be a pf.* reference`);
}

function iso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
}

function unsealedObservation(value) {
  const clone = structuredClone(value);
  delete clone.ref;
  delete clone.content_sha256;
  return clone;
}

export async function sealResourceObservation(value) {
  const clone = unsealedObservation(value);
  validateResourceObservationShape(clone);
  const hex = await sha256Hex(canonicalJson(clone));
  clone.ref = `pf.resource-observation.${hex.slice(0, 32)}`;
  clone.content_sha256 = `sha256:${hex}`;
  validateResourceObservationShape(clone, { requireSeal: true });
  return clone;
}

export async function verifyResourceObservationSeal(value) {
  validateResourceObservationShape(value, { requireSeal: true });
  const hex = await sha256Hex(canonicalJson(unsealedObservation(value)));
  return value.ref === `pf.resource-observation.${hex.slice(0, 32)}` && value.content_sha256 === `sha256:${hex}`;
}

export async function createResourceObservation({
  cardRef,
  attemptRef = null,
  beatRef = null,
  observedAt,
  sourceOrgan,
  runtime = null,
  revisionRef = null,
  energyDelta = {},
  currency = 'USD',
  costMicros = 0,
  evidenceRefs = [],
}) {
  ref(cardRef, 'resource cardRef');
  if (attemptRef != null) ref(attemptRef, 'resource attemptRef');
  if (beatRef != null) ref(beatRef, 'resource beatRef');
  iso(observedAt, 'resource observedAt');
  return sealResourceObservation({
    contract_version: RESOURCE_OBSERVATION_CONTRACT_VERSION,
    card_ref: cardRef,
    attempt_ref: attemptRef,
    beat_ref: beatRef,
    observed_at: observedAt,
    source: { organ: sourceOrgan, runtime, revision_ref: revisionRef },
    energy_delta: normalizeEnergyVector(energyDelta, 'resource energyDelta'),
    cost_delta: { currency, micros: costMicros },
    evidence_refs: [...evidenceRefs],
  });
}

function activeAuthorization(auth, now, prefix) {
  if (!auth || Object.keys(auth).length === 0) return { ok: false, reason: `${prefix}_unauthorized` };
  const current = Date.parse(now);
  if (current < Date.parse(auth.effective_at)) return { ok: false, reason: `${prefix}_not_effective` };
  if (auth.expires_at != null && current >= Date.parse(auth.expires_at)) return { ok: false, reason: `${prefix}_authorization_expired` };
  return { ok: true };
}

export function assessResourceState(card, { now }) {
  validateCardV1(card, { requireSeal: true });
  iso(now, 'resource assessment now');
  const energyAuth = activeAuthorization(card.energy.authorization, now, 'energy');
  if (!energyAuth.ok) return { authorized: false, blocked: true, reason: energyAuth.reason, exhausted: [], overdrawn: [] };
  const costAuth = activeAuthorization(card.cost.authorization, now, 'cost');
  if (!costAuth.ok) return { authorized: false, blocked: true, reason: costAuth.reason, exhausted: [], overdrawn: [] };

  const limits = normalizeEnergyVector(card.energy.authorization.limits, 'Card.energy.authorization.limits');
  const totals = normalizeEnergyVector(card.energy.consumption.totals, 'Card.energy.consumption.totals');
  const exhausted = [];
  const overdrawn = [];
  const remaining = {};
  for (const meter of ENERGY_METERS) {
    remaining[meter] = Math.max(0, limits[meter] - totals[meter]);
    if (totals[meter] > limits[meter]) overdrawn.push(meter);
    else if (limits[meter] > 0 && totals[meter] >= limits[meter]) exhausted.push(meter);
  }
  if (overdrawn.length > 0) return { authorized: true, blocked: true, reason: `energy_overdrawn:${overdrawn[0]}`, exhausted, overdrawn, remaining };
  if (remaining.beats < 1) return { authorized: true, blocked: true, reason: 'energy_exhausted:beats', exhausted, overdrawn, remaining };

  const cost = card.cost;
  const spent = cost.consumption.spent_micros;
  const ceiling = cost.authorization.ceiling_micros;
  const costOverdrawn = spent > ceiling;
  const costExhausted = cost.authorization.mode === 'capped' ? spent >= ceiling : spent > 0;
  if (costOverdrawn || (cost.authorization.mode === 'zero-cost' && spent > 0)) {
    return { authorized: true, blocked: true, reason: 'cost_overdrawn', exhausted, overdrawn, remaining, cost_remaining_micros: 0 };
  }
  if (costExhausted) {
    return { authorized: true, blocked: true, reason: 'cost_exhausted', exhausted, overdrawn, remaining, cost_remaining_micros: 0 };
  }
  return {
    authorized: true,
    blocked: false,
    reason: 'resource_budget_available',
    exhausted,
    overdrawn,
    remaining,
    cost_remaining_micros: Math.max(0, ceiling - spent),
    currency: cost.authorization.currency,
  };
}

export function executionResourceBudget(card, { now }) {
  const state = assessResourceState(card, { now });
  if (state.blocked) throw new Error(`Card ${card.ref} resource budget is not executable: ${state.reason}`);
  return {
    energy_remaining: structuredClone(state.remaining),
    cost: { currency: state.currency, remaining_micros: state.cost_remaining_micros },
  };
}

export async function recordResourceObservation(card, observation) {
  validateCardV1(card, { requireSeal: true });
  if (!(await verifyCardSeal(card))) throw new Error(`Card ${card.ref} content seal mismatch`);
  if (!(await verifyResourceObservationSeal(observation))) throw new Error('ResourceObservation content seal mismatch');
  if (observation.card_ref !== card.ref) throw new Error(`ResourceObservation targets ${observation.card_ref}, not ${card.ref}`);
  if (observation.attempt_ref != null && card.circulation.attempt_ref != null && observation.attempt_ref !== card.circulation.attempt_ref) {
    throw new Error(`ResourceObservation attempt ${observation.attempt_ref} does not match Card attempt ${card.circulation.attempt_ref}`);
  }
  if (observation.beat_ref != null && card.circulation.beat_ref != null && observation.beat_ref !== card.circulation.beat_ref) {
    throw new Error(`ResourceObservation beat ${observation.beat_ref} does not match Card beat ${card.circulation.beat_ref}`);
  }
  if (observation.cost_delta.currency !== card.cost.consumption.currency) throw new Error('ResourceObservation currency does not match Card cost consumption currency');

  const seen = new Set([
    ...card.energy.consumption.observation_refs,
    ...card.cost.consumption.observation_refs,
  ]);
  if (seen.has(observation.ref)) {
    return { card, observation, duplicate: true, resource_state: assessResourceState(card, { now: observation.observed_at }) };
  }

  const totals = normalizeEnergyVector(card.energy.consumption.totals, 'Card.energy.consumption.totals');
  for (const meter of ENERGY_METERS) totals[meter] += observation.energy_delta[meter];
  const spent = card.cost.consumption.spent_micros + observation.cost_delta.micros;
  const patch = makeCardPatch({
    card,
    organ: 'heartime',
    at: observation.observed_at,
    reason: `resource observation from ${observation.source.organ}`,
    set: {
      'energy.consumption.totals': totals,
      'cost.consumption.spent_micros': spent,
    },
    append: {
      'energy.consumption.observation_refs': [observation.ref],
      'cost.consumption.observation_refs': [observation.ref],
    },
  });
  const next = await applyCardPatch(card, patch);
  return { card: next, observation, duplicate: false, resource_state: assessResourceState(next, { now: observation.observed_at }) };
}

export async function recordHeartimeBeat(card, { at, beatRef }) {
  const observation = await createResourceObservation({
    cardRef: card.ref,
    attemptRef: card.circulation.attempt_ref,
    beatRef,
    observedAt: at,
    sourceOrgan: 'heartime',
    runtime: 'heartime',
    energyDelta: { beats: 1 },
    currency: card.cost.consumption.currency,
    costMicros: 0,
  });
  return recordResourceObservation(card, observation);
}

function ratioBps(spent, limit) {
  if (limit === 0) return spent === 0 ? 0 : 10001;
  return Math.floor((spent * 10000) / limit);
}

export function projectResourceHealth(card, { now }) {
  validateCardV1(card, { requireSeal: true });
  iso(now, 'resource health now');
  const limits = card.energy.authorization?.limits ? normalizeEnergyVector(card.energy.authorization.limits) : null;
  const totals = normalizeEnergyVector(card.energy.consumption.totals);
  const utilization_bps = {};
  let peak = 0;
  if (limits) {
    for (const meter of ENERGY_METERS) {
      utilization_bps[meter] = ratioBps(totals[meter], limits[meter]);
      peak = Math.max(peak, utilization_bps[meter]);
    }
  }
  const costAuth = card.cost.authorization;
  const costBps = costAuth && Object.keys(costAuth).length > 0
    ? ratioBps(card.cost.consumption.spent_micros, costAuth.ceiling_micros)
    : 10001;
  peak = Math.max(peak, costBps);
  const evidenceCount = card.evidence.refs.length + card.epistemic.evidence_refs.length;
  const spentAnything = Object.values(totals).some((n) => n > 0) || card.cost.consumption.spent_micros > 0;
  const circulatoryDebt = spentAnything && evidenceCount === 0 && !['settled', 'terminal'].includes(card.circulation.state);
  let pressure = 'NORMAL';
  if (peak >= 10000) pressure = 'EXHAUSTED';
  else if (peak >= 9000 || circulatoryDebt) pressure = 'CRITICAL';
  else if (peak >= 7000) pressure = 'WATCH';
  return {
    contract_version: RESOURCE_HEALTH_PROJECTION_VERSION,
    assessed_at: now,
    pressure,
    peak_utilization_bps: peak,
    energy_utilization_bps: utilization_bps,
    cost_utilization_bps: costBps,
    evidence_count: evidenceCount,
    circulatory_debt: circulatoryDebt,
    cost_per_evidence_micros: evidenceCount > 0 ? Math.floor(card.cost.consumption.spent_micros / evidenceCount) : null,
  };
}

export async function applyResourceHealthProjection(card, { at }) {
  const projection = projectResourceHealth(card, { now: at });
  const patch = makeCardPatch({
    card,
    organ: 'homeostasis',
    at,
    reason: 'resource pressure projection',
    set: { 'health.resources': projection },
  });
  return { card: await applyCardPatch(card, patch), projection };
}
