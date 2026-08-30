export const ENERGY_AUTHORIZATION_CONTRACT_VERSION = 'powerfarm.energy-authorization.v1';
export const COST_AUTHORIZATION_CONTRACT_VERSION = 'powerfarm.cost-authorization.v1';
export const RESOURCE_OBSERVATION_CONTRACT_VERSION = 'powerfarm.resource-observation.v1';
export const RESOURCE_HEALTH_PROJECTION_VERSION = 'powerfarm.resource-health.v1';

export const ENERGY_METERS = Object.freeze([
  'beats',
  'model_tokens',
  'tool_calls',
  'network_calls',
  'compute_ms',
  'sandbox_ms',
  'wall_ms',
  'human_attention_ms',
]);

const ENERGY_METER_SET = new Set(ENERGY_METERS);
const ISO_CURRENCY = /^[A-Z]{3}$/;
const PF_REF = /^pf(?:\.[a-z0-9][a-z0-9-]*)+$/;

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function only(value, allowed, label) {
  plain(value, label);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
}

function int(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new TypeError(`${label} must be a ${positive ? 'positive' : 'non-negative'} safe integer`);
  }
  return value;
}

function iso(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
  return value;
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function ref(value, label) {
  nonEmpty(value, label);
  if (!PF_REF.test(value)) throw new TypeError(`${label} must be a pf.* reference`);
  return value;
}

export function zeroEnergyVector() {
  return Object.fromEntries(ENERGY_METERS.map((meter) => [meter, 0]));
}

export function normalizeEnergyVector(value = {}, label = 'energy vector') {
  plain(value, label);
  for (const key of Object.keys(value)) if (!ENERGY_METER_SET.has(key)) throw new Error(`${label} contains unsupported meter: ${key}`);
  const normalized = zeroEnergyVector();
  for (const meter of ENERGY_METERS) {
    if (value[meter] != null) normalized[meter] = int(value[meter], `${label}.${meter}`);
  }
  return normalized;
}

export function emptyEnergyConsumption() {
  return { totals: zeroEnergyVector(), observation_refs: [] };
}

export function emptyCostConsumption(currency = 'USD') {
  return { currency, spent_micros: 0, observation_refs: [] };
}

export function makeEnergyAuthorization({ authorizationRef, limits, effectiveAt, expiresAt = null }) {
  const auth = {
    contract_version: ENERGY_AUTHORIZATION_CONTRACT_VERSION,
    authorization_ref: authorizationRef,
    limits: normalizeEnergyVector(limits, 'EnergyAuthorization.limits'),
    effective_at: effectiveAt,
    expires_at: expiresAt,
  };
  validateEnergyAuthorization(auth);
  return auth;
}

export function makeCostAuthorization({ authorizationRef, currency = 'USD', mode = 'capped', ceilingMicros, effectiveAt, expiresAt = null }) {
  const auth = {
    contract_version: COST_AUTHORIZATION_CONTRACT_VERSION,
    authorization_ref: authorizationRef,
    currency,
    mode,
    ceiling_micros: ceilingMicros,
    effective_at: effectiveAt,
    expires_at: expiresAt,
  };
  validateCostAuthorization(auth);
  return auth;
}

export function validateEnergyAuthorization(value, { allowEmpty = true } = {}) {
  plain(value, 'Card.energy.authorization');
  if (allowEmpty && Object.keys(value).length === 0) return value;
  only(value, new Set(['contract_version', 'authorization_ref', 'limits', 'effective_at', 'expires_at']), 'Card.energy.authorization');
  if (value.contract_version !== ENERGY_AUTHORIZATION_CONTRACT_VERSION) throw new Error(`unsupported energy authorization contract: ${value.contract_version}`);
  nonEmpty(value.authorization_ref, 'Card.energy.authorization.authorization_ref');
  const limits = normalizeEnergyVector(value.limits, 'Card.energy.authorization.limits');
  if (limits.beats < 1) throw new Error('Card.energy.authorization.limits.beats must authorize at least one Heartime emission');
  iso(value.effective_at, 'Card.energy.authorization.effective_at');
  if (value.expires_at != null) {
    iso(value.expires_at, 'Card.energy.authorization.expires_at');
    if (Date.parse(value.expires_at) <= Date.parse(value.effective_at)) throw new Error('energy authorization expires_at must follow effective_at');
  }
  return value;
}

export function validateEnergyConsumption(value) {
  only(value, new Set(['totals', 'observation_refs']), 'Card.energy.consumption');
  normalizeEnergyVector(value.totals, 'Card.energy.consumption.totals');
  if (!Array.isArray(value.observation_refs)) throw new TypeError('Card.energy.consumption.observation_refs must be an array');
  for (const [index, item] of value.observation_refs.entries()) ref(item, `Card.energy.consumption.observation_refs[${index}]`);
  if (new Set(value.observation_refs).size !== value.observation_refs.length) throw new Error('Card.energy.consumption.observation_refs contains duplicates');
  return value;
}

export function validateCostAuthorization(value, { allowEmpty = true } = {}) {
  plain(value, 'Card.cost.authorization');
  if (allowEmpty && Object.keys(value).length === 0) return value;
  only(value, new Set(['contract_version', 'authorization_ref', 'currency', 'mode', 'ceiling_micros', 'effective_at', 'expires_at']), 'Card.cost.authorization');
  if (value.contract_version !== COST_AUTHORIZATION_CONTRACT_VERSION) throw new Error(`unsupported cost authorization contract: ${value.contract_version}`);
  nonEmpty(value.authorization_ref, 'Card.cost.authorization.authorization_ref');
  if (!ISO_CURRENCY.test(value.currency)) throw new TypeError('Card.cost.authorization.currency must be an ISO-like three-letter uppercase code');
  if (!['capped', 'zero-cost'].includes(value.mode)) throw new Error(`unsupported cost authorization mode: ${value.mode}`);
  int(value.ceiling_micros, 'Card.cost.authorization.ceiling_micros');
  if (value.mode === 'capped' && value.ceiling_micros < 1) throw new Error('capped cost authorization requires ceiling_micros >= 1');
  if (value.mode === 'zero-cost' && value.ceiling_micros !== 0) throw new Error('zero-cost authorization requires ceiling_micros = 0');
  iso(value.effective_at, 'Card.cost.authorization.effective_at');
  if (value.expires_at != null) {
    iso(value.expires_at, 'Card.cost.authorization.expires_at');
    if (Date.parse(value.expires_at) <= Date.parse(value.effective_at)) throw new Error('cost authorization expires_at must follow effective_at');
  }
  return value;
}

export function validateCostConsumption(value) {
  only(value, new Set(['currency', 'spent_micros', 'observation_refs']), 'Card.cost.consumption');
  if (!ISO_CURRENCY.test(value.currency)) throw new TypeError('Card.cost.consumption.currency must be an ISO-like three-letter uppercase code');
  int(value.spent_micros, 'Card.cost.consumption.spent_micros');
  if (!Array.isArray(value.observation_refs)) throw new TypeError('Card.cost.consumption.observation_refs must be an array');
  for (const [index, item] of value.observation_refs.entries()) ref(item, `Card.cost.consumption.observation_refs[${index}]`);
  if (new Set(value.observation_refs).size !== value.observation_refs.length) throw new Error('Card.cost.consumption.observation_refs contains duplicates');
  return value;
}

export function validateCardResources(card) {
  plain(card.energy, 'Card.energy');
  validateEnergyAuthorization(card.energy.authorization);
  validateEnergyConsumption(card.energy.consumption);
  plain(card.cost, 'Card.cost');
  validateCostAuthorization(card.cost.authorization);
  validateCostConsumption(card.cost.consumption);
  const costAuth = card.cost.authorization;
  if (Object.keys(costAuth).length > 0 && card.cost.consumption.currency !== costAuth.currency) {
    throw new Error('Card cost consumption currency must match Process authorization currency');
  }
  return card;
}

export function validateResourceObservationShape(value, { requireSeal = false } = {}) {
  only(value, new Set([
    'contract_version', 'ref', 'card_ref', 'attempt_ref', 'beat_ref', 'observed_at',
    'source', 'energy_delta', 'cost_delta', 'evidence_refs', 'content_sha256',
  ]), 'ResourceObservation');
  if (value.contract_version !== RESOURCE_OBSERVATION_CONTRACT_VERSION) throw new Error(`unsupported ResourceObservation contract: ${value.contract_version}`);
  if (value.ref != null) ref(value.ref, 'ResourceObservation.ref');
  ref(value.card_ref, 'ResourceObservation.card_ref');
  if (value.attempt_ref != null) ref(value.attempt_ref, 'ResourceObservation.attempt_ref');
  if (value.beat_ref != null) ref(value.beat_ref, 'ResourceObservation.beat_ref');
  iso(value.observed_at, 'ResourceObservation.observed_at');
  only(value.source, new Set(['organ', 'runtime', 'revision_ref']), 'ResourceObservation.source');
  if (!['platform', 'heartime'].includes(value.source.organ)) throw new Error('ResourceObservation.source.organ must be platform or heartime');
  if (value.source.runtime != null) nonEmpty(value.source.runtime, 'ResourceObservation.source.runtime');
  if (value.source.revision_ref != null) nonEmpty(value.source.revision_ref, 'ResourceObservation.source.revision_ref');
  const delta = normalizeEnergyVector(value.energy_delta, 'ResourceObservation.energy_delta');
  only(value.cost_delta, new Set(['currency', 'micros']), 'ResourceObservation.cost_delta');
  if (!ISO_CURRENCY.test(value.cost_delta.currency)) throw new TypeError('ResourceObservation.cost_delta.currency must be an ISO-like code');
  int(value.cost_delta.micros, 'ResourceObservation.cost_delta.micros');
  if (!Array.isArray(value.evidence_refs)) throw new TypeError('ResourceObservation.evidence_refs must be an array');
  for (const [index, item] of value.evidence_refs.entries()) ref(item, `ResourceObservation.evidence_refs[${index}]`);
  if (new Set(value.evidence_refs).size !== value.evidence_refs.length) throw new Error('ResourceObservation.evidence_refs contains duplicates');
  if (Object.values(delta).every((n) => n === 0) && value.cost_delta.micros === 0) throw new Error('ResourceObservation must record non-zero energy or cost consumption');
  if (value.source.organ === 'platform') {
    if (value.attempt_ref == null || value.beat_ref == null) throw new Error('Platform ResourceObservation requires attempt_ref and beat_ref');
    if (value.evidence_refs.length < 1) throw new Error('Platform ResourceObservation requires durable metering evidence');
    if (delta.beats !== 0) throw new Error('Platform cannot meter Heartime beats');
  }
  if (value.source.organ === 'heartime') {
    if (value.beat_ref == null) throw new Error('Heartime ResourceObservation requires beat_ref');
    if (delta.beats < 1) throw new Error('Heartime ResourceObservation must meter at least one beat');
    if (ENERGY_METERS.some((meter) => meter !== 'beats' && delta[meter] !== 0) || value.cost_delta.micros !== 0) {
      throw new Error('Heartime ResourceObservation may meter beats only');
    }
  }
  if (value.content_sha256 != null && !/^sha256:[a-f0-9]{64}$/.test(value.content_sha256)) throw new TypeError('ResourceObservation.content_sha256 must be a sha256: reference');
  if (requireSeal && (value.ref == null || value.content_sha256 == null)) throw new Error('ResourceObservation must be content-addressed');
  return value;
}
