export const HEARTIME_CYCLE_VERSION = 'powerfarm.heartime.cycle.v1';
export const HEARTIME_RUNTIME_REF = 'pf.runtime.heartime';

export const HEARTIME_PORT_VERSIONS = Object.freeze({
  runtime_token: 'powerfarm.registry.runtime-token.v1',
  heartime_state: 'powerfarm.heartime.state.v1',
  heartime_control: 'powerfarm.heartime.control.v1',
});

export const MAX_RECONCILIATION_SUMMARY_BYTES = 64 * 1024;

const INSTITUTIONAL_REF = /^pf(?:\.[a-z0-9][a-z0-9-]*)+$/;
const BASE_WAKE_FIELDS = new Set(['beat_ref', 'reconciler_ref', 'reason', 'resource_hint', 'trace_ref']);
const BASE_FORBIDDEN_KEYS = new Set([
  'card',
  'cards',
  'card_body',
  'payload',
  'prompt',
  'wake_pack',
  'response',
  'responses',
  'workflow_state',
]);

export function assertPlainObject(value, label = 'value') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

export function assertOnlyFields(value, allowed, label = 'object') {
  assertPlainObject(value, label);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`${label} contains unsupported field: ${field}`);
  }
  return value;
}

export function assertNoForbiddenKeys(value, forbidden = BASE_FORBIDDEN_KEYS, label = 'object') {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item, forbidden, label);
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error(`${label} must not carry forbidden field: ${key}`);
    assertNoForbiddenKeys(child, forbidden, label);
  }
  return value;
}

export function assertCompactJson(value, {
  label = 'object',
  maxBytes = MAX_RECONCILIATION_SUMMARY_BYTES,
  forbiddenKeys = BASE_FORBIDDEN_KEYS,
} = {}) {
  assertPlainObject(value, label);
  assertNoForbiddenKeys(value, forbiddenKeys, label);
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  return value;
}

export function assertInstitutionalRef(value, label = 'ref') {
  if (typeof value !== 'string' || !INSTITUTIONAL_REF.test(value)) {
    throw new TypeError(`${label} must use canonical pf.* institutional reference syntax`);
  }
  return value;
}

export function assertOptionalInstitutionalRef(value, label = 'ref') {
  if (value != null) assertInstitutionalRef(value, label);
  return value;
}

export function assertGeneration(value, label = 'generation') {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

export function assertNonNegativeInteger(value, label = 'value') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

export function assertFiniteNumber(value, label = 'value') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

export function assertRatio(value, label = 'ratio') {
  assertFiniteNumber(value, label);
  if (value < 0 || value > 1) throw new RangeError(`${label} must be between 0 and 1`);
  return value;
}

export function assertIsoTimestamp(value, label = 'timestamp') {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must be an ISO timestamp`);
  }
  return value;
}

export function validateCallerContext(caller, label = 'caller') {
  assertPlainObject(caller, `${label} context`);
  assertInstitutionalRef(caller.identity_ref, `${label}.identity_ref`);
  assertOptionalInstitutionalRef(caller.component_ref, `${label}.component_ref`);
  assertOptionalInstitutionalRef(caller.beat_ref, `${label}.beat_ref`);
  assertOptionalInstitutionalRef(caller.trace_ref, `${label}.trace_ref`);
  return caller;
}

export function validateWakeHintBase(hint, {
  reconcilerRef = null,
  forbiddenKeys = BASE_FORBIDDEN_KEYS,
  label = 'reconciliation wake hint',
} = {}) {
  assertPlainObject(hint, label);
  assertNoForbiddenKeys(hint, forbiddenKeys, label);
  assertOnlyFields(hint, BASE_WAKE_FIELDS, label);
  assertInstitutionalRef(hint.beat_ref, 'BeatRef');
  assertInstitutionalRef(hint.reconciler_ref, 'ReconcilerRef');
  if (reconcilerRef != null && hint.reconciler_ref !== reconcilerRef) {
    throw new Error(`unsupported reconciler: ${hint.reconciler_ref}`);
  }
  if (hint.reason != null && typeof hint.reason !== 'string') {
    throw new TypeError('wake reason must be a string');
  }
  assertOptionalInstitutionalRef(hint.resource_hint, 'resource hint');
  assertOptionalInstitutionalRef(hint.trace_ref, 'trace ref');
  return hint;
}

export function requireMethod(object, method, label) {
  if (!object || typeof object[method] !== 'function') {
    throw new TypeError(`${label}.${method} is required`);
  }
}

export function normalizeDate(value, label = 'date') {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} must be a valid Date`);
  return date;
}

export const BASE_RECONCILIATION_FORBIDDEN_KEYS = BASE_FORBIDDEN_KEYS;
