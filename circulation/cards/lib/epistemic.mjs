import { applyCardPatch, makeCardPatch } from './patch.mjs';
import { validateCardV1, verifyCardSeal } from './card-v1.mjs';
import {
  EPISTEMIC_CLASS,
  validateClaim,
  validateConflict,
  validateObservation,
  validateUncertainty,
} from './epistemic-schema.mjs';

function iso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
}

function unique(values) {
  return [...new Set(values)];
}

function allEvidence(records) {
  return unique(records.flatMap((record) => record.evidence_refs ?? []));
}

export function unresolvedUncertainties(card) {
  validateCardV1(card, { requireSeal: true });
  const resolved = new Set(card.epistemic.claims.flatMap((claim) => claim.resolves ?? []));
  return card.epistemic.uncertainties.filter((uncertainty) => !resolved.has(uncertainty.ref));
}

export function staleObservations(card, { now }) {
  validateCardV1(card, { requireSeal: true });
  iso(now, 'epistemic.now');
  const current = Date.parse(now);
  return card.epistemic.observations.filter((observation) => (
    observation.fresh_until != null && Date.parse(observation.fresh_until) <= current
  ));
}

export function assessEpistemicState(card, { now }) {
  validateCardV1(card, { requireSeal: true });
  iso(now, 'epistemic.now');
  const stale = staleObservations(card, { now });
  const unresolved = unresolvedUncertainties(card);
  const nextSampleDue = card.epistemic.next_sample != null && Date.parse(card.epistemic.next_sample) <= Date.parse(now);
  return {
    status: nextSampleDue || stale.length > 0 ? 'SAMPLE_DUE' : 'CURRENT',
    next_sample_due: nextSampleDue,
    next_sample: card.epistemic.next_sample,
    stale_observation_refs: stale.map((record) => record.ref),
    unresolved_uncertainty_refs: unresolved.map((record) => record.ref),
  };
}

export async function recordEpistemicRecords(card, {
  at,
  observations = [],
  claims = [],
  uncertainties = [],
  conflicts = [],
  evidenceRefs = [],
  freshness = null,
  reason = 'Memory recorded epistemic state',
} = {}) {
  validateCardV1(card, { requireSeal: true });
  if (!(await verifyCardSeal(card))) throw new Error(`Card ${card.ref} content seal mismatch`);
  iso(at, 'epistemic.at');
  observations.forEach(validateObservation);
  claims.forEach(validateClaim);
  uncertainties.forEach(validateUncertainty);
  conflicts.forEach(validateConflict);

  const append = {};
  if (observations.length) append['epistemic.observations'] = observations;
  if (claims.length) append['epistemic.claims'] = claims;
  if (uncertainties.length) append['epistemic.uncertainties'] = uncertainties;
  if (conflicts.length) append['epistemic.conflicts'] = conflicts;
  const refs = unique([
    ...evidenceRefs,
    ...allEvidence([...observations, ...claims, ...uncertainties, ...conflicts]),
  ]);
  if (refs.length) {
    append['epistemic.evidence_refs'] = refs;
    append['evidence.refs'] = refs;
  }
  const set = {};
  if (freshness != null) set['epistemic.freshness'] = freshness;
  if (Object.keys(append).length === 0 && Object.keys(set).length === 0) {
    throw new Error('epistemic update must record at least one durable change');
  }

  return applyCardPatch(card, makeCardPatch({ card, organ: 'memory', at, reason, set, append }));
}

export async function scheduleEpistemicSample(card, { at, nextSample, reason = 'Heartime epistemic sample scheduled' } = {}) {
  validateCardV1(card, { requireSeal: true });
  iso(at, 'epistemic schedule.at');
  if (nextSample != null) {
    iso(nextSample, 'epistemic schedule.nextSample');
    if (Date.parse(nextSample) < Date.parse(at)) throw new Error('epistemic nextSample cannot precede schedule.at');
  }
  return applyCardPatch(card, makeCardPatch({
    card,
    organ: 'heartime',
    at,
    reason,
    set: { 'epistemic.next_sample': nextSample },
  }));
}

export function buildEpistemicWakeContext(card, { now }) {
  validateCardV1(card, { requireSeal: true });
  iso(now, 'wake.now');
  const current = Date.parse(now);
  const unresolvedRefs = new Set(unresolvedUncertainties(card).map((record) => record.ref));
  return {
    contract_version: 'powerfarm.epistemic-wake-context.v1',
    card_ref: card.ref,
    card_generation: card.generation,
    card_revision: card.revision,
    at: now,
    observations: card.epistemic.observations.map((record) => ({
      ...structuredClone(record),
      freshness: record.fresh_until == null ? 'UNBOUNDED' : (Date.parse(record.fresh_until) <= current ? 'STALE' : 'FRESH'),
    })),
    claims: structuredClone(card.epistemic.claims),
    uncertainties: card.epistemic.uncertainties.map((record) => ({
      ...structuredClone(record),
      status: unresolvedRefs.has(record.ref) ? 'UNRESOLVED' : 'RESOLVED',
    })),
    conflicts: structuredClone(card.epistemic.conflicts),
    evidence_refs: [...card.epistemic.evidence_refs],
    next_sample: card.epistemic.next_sample,
    classification_legend: {
      OBSERVED: 'directly observed and evidence-backed',
      INFERRED: 'derived from cited epistemic records',
      ASSUMED: 'working assumption, not an observation',
      REPORTED: 'reported by a named source with evidence',
      UNKNOWN: 'unresolved question',
      CONTRADICTED: 'explicit conflict between durable records',
    },
  };
}

export function assertEpistemicSleepReady(card) {
  validateCardV1(card, { requireSeal: true });
  const unresolved = unresolvedUncertainties(card);
  if (unresolved.length > 0 && card.epistemic.next_sample == null) {
    throw new Error(`Card ${card.ref} has unresolved epistemic uncertainty without epistemic.next_sample`);
  }
  return true;
}

export { EPISTEMIC_CLASS };
