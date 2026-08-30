import { canonicalJson, sha256Hex } from './canonical.mjs';

export const EPISTEMIC_RECORD_CONTRACT_VERSION = 'powerfarm.epistemic-record.v1';
export const EPISTEMIC_CLASS = Object.freeze({
  OBSERVED: 'OBSERVED',
  INFERRED: 'INFERRED',
  ASSUMED: 'ASSUMED',
  REPORTED: 'REPORTED',
  UNKNOWN: 'UNKNOWN',
  CONTRADICTED: 'CONTRADICTED',
});
export const EPISTEMIC_CLASSES = Object.freeze(new Set(Object.values(EPISTEMIC_CLASS)));

const PF_REF = /^pf(?:\.[a-z0-9][a-z0-9-]*)+$/;
const BASE_FIELDS = new Set(['contract_version', 'ref', 'classification', 'statement', 'recorded_at', 'evidence_refs']);
const OBSERVATION_FIELDS = new Set([...BASE_FIELDS, 'observed_at', 'source_ref', 'fresh_until']);
const CLAIM_FIELDS = new Set([...BASE_FIELDS, 'supports', 'resolves', 'source_ref', 'confidence']);
const UNCERTAINTY_FIELDS = new Set(['contract_version', 'ref', 'classification', 'question', 'recorded_at', 'opened_at', 'evidence_refs']);
const CONFLICT_FIELDS = new Set([...BASE_FIELDS, 'record_refs']);

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function only(value, allowed, label) {
  plain(value, label);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function iso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
}

function pfRef(value, label) {
  if (typeof value !== 'string' || !PF_REF.test(value)) throw new TypeError(`${label} must be a pf.* reference`);
}

function refArray(value, label, { min = 0 } = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (value.length < min) throw new Error(`${label} must contain at least ${min} reference${min === 1 ? '' : 's'}`);
  const seen = new Set();
  for (const [index, ref] of value.entries()) {
    nonEmpty(ref, `${label}[${index}]`);
    if (seen.has(ref)) throw new Error(`${label} contains duplicate reference: ${ref}`);
    seen.add(ref);
  }
}

function epistemicRef(value, label = 'EpistemicRecord.ref') {
  pfRef(value, label);
  if (!value.startsWith('pf.epistemic.')) throw new TypeError(`${label} must use pf.epistemic.*`);
}

function confidence(value, label) {
  if (value == null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be between 0 and 1`);
  }
}

function common(record, allowed, label) {
  only(record, allowed, label);
  if (record.contract_version !== EPISTEMIC_RECORD_CONTRACT_VERSION) {
    throw new Error(`unsupported epistemic record contract: ${record.contract_version}`);
  }
  epistemicRef(record.ref, `${label}.ref`);
  if (!EPISTEMIC_CLASSES.has(record.classification)) throw new Error(`unsupported epistemic classification: ${record.classification}`);
  iso(record.recorded_at, `${label}.recorded_at`);
  refArray(record.evidence_refs, `${label}.evidence_refs`);
}

export function validateObservation(record) {
  common(record, OBSERVATION_FIELDS, 'EpistemicObservation');
  if (record.classification !== EPISTEMIC_CLASS.OBSERVED) throw new Error('observation classification must be OBSERVED');
  nonEmpty(record.statement, 'EpistemicObservation.statement');
  iso(record.observed_at, 'EpistemicObservation.observed_at');
  nonEmpty(record.source_ref, 'EpistemicObservation.source_ref');
  refArray(record.evidence_refs, 'EpistemicObservation.evidence_refs', { min: 1 });
  if (record.fresh_until != null) {
    iso(record.fresh_until, 'EpistemicObservation.fresh_until');
    if (Date.parse(record.fresh_until) < Date.parse(record.observed_at)) {
      throw new Error('EpistemicObservation.fresh_until cannot precede observed_at');
    }
  }
  return record;
}

export function validateClaim(record) {
  common(record, CLAIM_FIELDS, 'EpistemicClaim');
  if (![EPISTEMIC_CLASS.INFERRED, EPISTEMIC_CLASS.ASSUMED, EPISTEMIC_CLASS.REPORTED].includes(record.classification)) {
    throw new Error('claim classification must be INFERRED, ASSUMED, or REPORTED');
  }
  nonEmpty(record.statement, 'EpistemicClaim.statement');
  refArray(record.supports, 'EpistemicClaim.supports');
  refArray(record.resolves, 'EpistemicClaim.resolves');
  confidence(record.confidence, 'EpistemicClaim.confidence');
  if (record.classification === EPISTEMIC_CLASS.INFERRED && record.supports.length === 0) {
    throw new Error('INFERRED claim must cite at least one supporting epistemic record');
  }
  if (record.classification === EPISTEMIC_CLASS.REPORTED) {
    nonEmpty(record.source_ref, 'EpistemicClaim.source_ref');
    refArray(record.evidence_refs, 'EpistemicClaim.evidence_refs', { min: 1 });
  } else if (record.source_ref != null) {
    nonEmpty(record.source_ref, 'EpistemicClaim.source_ref');
  }
  return record;
}

export function validateUncertainty(record) {
  common(record, UNCERTAINTY_FIELDS, 'EpistemicUncertainty');
  if (record.classification !== EPISTEMIC_CLASS.UNKNOWN) throw new Error('uncertainty classification must be UNKNOWN');
  nonEmpty(record.question, 'EpistemicUncertainty.question');
  iso(record.opened_at, 'EpistemicUncertainty.opened_at');
  return record;
}

export function validateConflict(record) {
  common(record, CONFLICT_FIELDS, 'EpistemicConflict');
  if (record.classification !== EPISTEMIC_CLASS.CONTRADICTED) throw new Error('conflict classification must be CONTRADICTED');
  nonEmpty(record.statement, 'EpistemicConflict.statement');
  refArray(record.record_refs, 'EpistemicConflict.record_refs', { min: 2 });
  refArray(record.evidence_refs, 'EpistemicConflict.evidence_refs', { min: 1 });
  return record;
}

async function recordRef(body) {
  return `pf.epistemic.${(await sha256Hex(canonicalJson(body))).slice(0, 32)}`;
}

async function withRef(body, validator) {
  const record = { ...body, ref: await recordRef(body) };
  validator(record);
  return record;
}

function normalizedRefs(values = []) {
  return [...new Set(values)];
}

export async function createObservation({ statement, recordedAt, observedAt = recordedAt, sourceRef, evidenceRefs, freshUntil = null }) {
  const body = {
    contract_version: EPISTEMIC_RECORD_CONTRACT_VERSION,
    classification: EPISTEMIC_CLASS.OBSERVED,
    statement,
    recorded_at: recordedAt,
    observed_at: observedAt,
    source_ref: sourceRef,
    evidence_refs: normalizedRefs(evidenceRefs),
    fresh_until: freshUntil,
  };
  return withRef(body, validateObservation);
}

export async function createClaim({ classification, statement, recordedAt, evidenceRefs = [], supports = [], resolves = [], sourceRef = null, confidence: confidenceValue = null }) {
  const body = {
    contract_version: EPISTEMIC_RECORD_CONTRACT_VERSION,
    classification,
    statement,
    recorded_at: recordedAt,
    evidence_refs: normalizedRefs(evidenceRefs),
    supports: normalizedRefs(supports),
    resolves: normalizedRefs(resolves),
    source_ref: sourceRef,
    confidence: confidenceValue,
  };
  return withRef(body, validateClaim);
}

export async function createUncertainty({ question, recordedAt, openedAt = recordedAt, evidenceRefs = [] }) {
  const body = {
    contract_version: EPISTEMIC_RECORD_CONTRACT_VERSION,
    classification: EPISTEMIC_CLASS.UNKNOWN,
    question,
    recorded_at: recordedAt,
    opened_at: openedAt,
    evidence_refs: normalizedRefs(evidenceRefs),
  };
  return withRef(body, validateUncertainty);
}

export async function createConflict({ statement, recordedAt, recordRefs, evidenceRefs }) {
  const body = {
    contract_version: EPISTEMIC_RECORD_CONTRACT_VERSION,
    classification: EPISTEMIC_CLASS.CONTRADICTED,
    statement,
    recorded_at: recordedAt,
    evidence_refs: normalizedRefs(evidenceRefs),
    record_refs: normalizedRefs(recordRefs),
  };
  return withRef(body, validateConflict);
}


export async function verifyEpistemicRecordRef(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const clone = structuredClone(record);
  const actual = clone.ref;
  delete clone.ref;
  return actual === await recordRef(clone);
}

export function validateEpistemicCollections(epistemic) {
  if (!epistemic || typeof epistemic !== 'object' || Array.isArray(epistemic)) throw new TypeError('Card.epistemic must be an object');
  for (const record of epistemic.observations ?? []) validateObservation(record);
  for (const record of epistemic.claims ?? []) validateClaim(record);
  for (const record of epistemic.uncertainties ?? []) validateUncertainty(record);
  for (const record of epistemic.conflicts ?? []) validateConflict(record);
  return epistemic;
}
