import { canonicalJson, digestValue, sha256Hex } from './canonical.mjs';
import { validateCardV1, verifyCardSeal } from './card-v1.mjs';
import { executionResourceBudget } from './resources.mjs';
import { ENERGY_METERS } from './resource-schema.mjs';

export const EXECUTION_SLICE_CONTRACT_VERSION = 'powerfarm.execution-slice.v3';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const INSTITUTIONAL_REF = /^pf(?:\.[a-z0-9][a-z0-9-]*)+$/;
const STATES = new Set(['executing', 'evidence_pending']);
const ROOT_FIELDS = new Set([
  'contract_version', 'card', 'principal', 'institutional', 'circulation',
  'capability', 'resources', 'slice_sha256',
]);

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function exactKeys(value, allowed, label) {
  plain(value, label);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
}

function pfRef(value, label) {
  if (typeof value !== 'string' || !INSTITUTIONAL_REF.test(value)) throw new TypeError(`${label} must be a pf.* reference`);
}


function nonNegativeInt(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
}

function validateResourceBudget(value) {
  exactKeys(value, new Set(['energy_remaining', 'cost']), 'ExecutionSlice.resources');
  exactKeys(value.energy_remaining, new Set(ENERGY_METERS), 'ExecutionSlice.resources.energy_remaining');
  for (const meter of ENERGY_METERS) nonNegativeInt(value.energy_remaining[meter], `ExecutionSlice.resources.energy_remaining.${meter}`);
  exactKeys(value.cost, new Set(['currency', 'remaining_micros']), 'ExecutionSlice.resources.cost');
  if (typeof value.cost.currency !== 'string' || !/^[A-Z]{3}$/.test(value.cost.currency)) throw new TypeError('ExecutionSlice.resources.cost.currency must be a three-letter uppercase code');
  nonNegativeInt(value.cost.remaining_micros, 'ExecutionSlice.resources.cost.remaining_micros');
}
function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(`${label} must be a sha256: reference`);
}

export function validateExecutionSlice(slice, { requireSeal = false } = {}) {
  exactKeys(slice, ROOT_FIELDS, 'ExecutionSlice');
  if (slice.contract_version !== EXECUTION_SLICE_CONTRACT_VERSION) {
    throw new Error(`unsupported ExecutionSlice contract: ${slice.contract_version}`);
  }

  exactKeys(slice.card, new Set(['ref', 'generation', 'revision', 'content_sha256']), 'ExecutionSlice.card');
  pfRef(slice.card.ref, 'ExecutionSlice.card.ref');
  if (!Number.isSafeInteger(slice.card.generation) || slice.card.generation < 1) throw new TypeError('ExecutionSlice.card.generation must be positive');
  if (!Number.isSafeInteger(slice.card.revision) || slice.card.revision < 1) throw new TypeError('ExecutionSlice.card.revision must be positive');
  digest(slice.card.content_sha256, 'ExecutionSlice.card.content_sha256');

  exactKeys(slice.principal, new Set(['actor', 'office']), 'ExecutionSlice.principal');
  nonEmpty(slice.principal.actor, 'ExecutionSlice.principal.actor');
  nonEmpty(slice.principal.office, 'ExecutionSlice.principal.office');

  exactKeys(slice.institutional, new Set([
    'identity_ref', 'office_ref', 'occupancy_ref', 'direction_ref', 'responsibility_ref',
    'authority_ref', 'run_ref', 'run_grant_ref', 'ecs_sha256',
  ]), 'ExecutionSlice.institutional');
  for (const field of ['identity_ref', 'office_ref', 'occupancy_ref']) pfRef(slice.institutional[field], `ExecutionSlice.institutional.${field}`);
  if (slice.institutional.direction_ref != null) pfRef(slice.institutional.direction_ref, 'ExecutionSlice.institutional.direction_ref');
  if (slice.institutional.responsibility_ref != null) pfRef(slice.institutional.responsibility_ref, 'ExecutionSlice.institutional.responsibility_ref');
  for (const field of ['authority_ref', 'run_ref', 'run_grant_ref']) {
    if (slice.institutional[field] != null) nonEmpty(slice.institutional[field], `ExecutionSlice.institutional.${field}`);
  }
  if (slice.institutional.ecs_sha256 != null && !/^(?:sha256:)?[a-f0-9]{64}$/.test(slice.institutional.ecs_sha256)) {
    throw new TypeError('ExecutionSlice.institutional.ecs_sha256 must be a SHA-256 digest');
  }

  exactKeys(slice.circulation, new Set(['beat_ref', 'attempt_ref']), 'ExecutionSlice.circulation');
  pfRef(slice.circulation.beat_ref, 'ExecutionSlice.circulation.beat_ref');
  pfRef(slice.circulation.attempt_ref, 'ExecutionSlice.circulation.attempt_ref');

  exactKeys(slice.capability, new Set(['tool_name', 'kind', 'subject']), 'ExecutionSlice.capability');
  nonEmpty(slice.capability.tool_name, 'ExecutionSlice.capability.tool_name');
  nonEmpty(slice.capability.kind, 'ExecutionSlice.capability.kind');
  nonEmpty(slice.capability.subject, 'ExecutionSlice.capability.subject');

  validateResourceBudget(slice.resources);

  if (slice.slice_sha256 != null) digest(slice.slice_sha256, 'ExecutionSlice.slice_sha256');
  if (requireSeal && slice.slice_sha256 == null) throw new Error('ExecutionSlice must be content-addressed');
  return slice;
}

function unsealed(slice) {
  const clone = structuredClone(slice);
  delete clone.slice_sha256;
  return clone;
}

export async function sealExecutionSlice(slice) {
  const clone = unsealed(slice);
  validateExecutionSlice(clone);
  clone.slice_sha256 = await digestValue(clone);
  return clone;
}

export async function verifyExecutionSliceSeal(slice) {
  validateExecutionSlice(slice, { requireSeal: true });
  return slice.slice_sha256 === await digestValue(unsealed(slice));
}

function executionIdentityMaterial(slice) {
  return {
    v: 2,
    card_ref: slice.card.ref,
    card_generation: slice.card.generation,
    attempt_ref: slice.circulation.attempt_ref,
    tool_name: slice.capability.tool_name,
    kind: slice.capability.kind,
    subject: slice.capability.subject,
  };
}

async function executionIdentityHex(slice) {
  return sha256Hex(canonicalJson(executionIdentityMaterial(slice)));
}

export async function deriveExecutionSlice(card, { actor, office, toolName, kind, subject }) {
  validateCardV1(card, { requireSeal: true });
  if (!(await verifyCardSeal(card))) throw new Error(`Card ${card.ref} content seal mismatch`);
  if (!STATES.has(card.circulation.state)) throw new Error(`Card ${card.ref} is not in an executable circulation state`);
  if (!card.circulation.beat_ref || !card.circulation.attempt_ref) throw new Error(`Card ${card.ref} lacks beat_ref or attempt_ref`);
  for (const field of ['identity_ref', 'office_ref', 'occupancy_ref']) {
    if (!card.institutional[field]) throw new Error(`Card ${card.ref} lacks institutional.${field}`);
  }

  const slice = {
    contract_version: EXECUTION_SLICE_CONTRACT_VERSION,
    card: {
      ref: card.ref,
      generation: card.generation,
      revision: card.revision,
      content_sha256: card.content_sha256,
    },
    principal: { actor: String(actor), office: String(office) },
    institutional: {
      identity_ref: card.institutional.identity_ref,
      office_ref: card.institutional.office_ref,
      occupancy_ref: card.institutional.occupancy_ref,
      direction_ref: card.institutional.direction_ref ?? null,
      responsibility_ref: card.institutional.responsibility_ref ?? null,
      authority_ref: card.institutional.authority_ref ?? null,
      run_ref: null,
      run_grant_ref: card.institutional.run_grant_ref ?? null,
      ecs_sha256: card.institutional.ecs_sha256 ?? null,
    },
    circulation: {
      beat_ref: card.circulation.beat_ref,
      attempt_ref: card.circulation.attempt_ref,
    },
    capability: {
      tool_name: String(toolName),
      kind: String(kind),
      subject: String(subject),
    },
    resources: executionResourceBudget(card, { now: card.updated_at }),
  };
  const derivedRunRef = `pfx-${(await executionIdentityHex(slice)).slice(0, 32)}`;
  if (card.institutional.run_ref != null && card.institutional.run_ref !== derivedRunRef) {
    throw new Error(`Card run_ref ${card.institutional.run_ref} does not match engine-neutral execution identity ${derivedRunRef}`);
  }
  slice.institutional.run_ref = derivedRunRef;
  return sealExecutionSlice(slice);
}

export async function executionRefsFromSlice(slice) {
  validateExecutionSlice(slice, { requireSeal: true });
  if (!(await verifyExecutionSliceSeal(slice))) throw new Error('ExecutionSlice content seal mismatch');
  const hex = await executionIdentityHex(slice);
  const derivedRunRef = `pfx-${hex.slice(0, 32)}`;
  if (slice.institutional.run_ref != null && slice.institutional.run_ref !== derivedRunRef) {
    throw new Error(`ExecutionSlice run_ref ${slice.institutional.run_ref} does not match engine-neutral execution identity ${derivedRunRef}`);
  }
  const runRef = derivedRunRef;
  const prefix = `pfx2-${hex}`;
  const resumeDigest = await sha256Hex(canonicalJson({
    v: 1,
    run_ref: runRef,
    beat_ref: slice.circulation.beat_ref,
    attempt_ref: slice.circulation.attempt_ref,
  }));
  return {
    digest: hex,
    runRef,
    runSubject: `run:${runRef}`,
    intentRequestId: `${prefix}-intent`,
    runRequestId: `${prefix}-run`,
    resumeRequestId: `pfxr1-${resumeDigest}`,
    outcomeRequestId: `${prefix}-outcome`,
  };
}
