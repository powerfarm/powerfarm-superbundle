import { CARD_CONTRACT_VERSION, sealCard, validateCardV1, verifyCardSeal } from './card-v1.mjs';

export const CARD_PATCH_CONTRACT_VERSION = 'powerfarm.card-patch.v1';
export const CARD_ORGANS = Object.freeze(new Set(['registry', 'process', 'platform', 'memory', 'heartime', 'homeostasis']));

const OWNERSHIP = Object.freeze({
  registry: [
    'institutional.identity_ref',
    'institutional.office_ref',
    'institutional.occupancy_ref',
  ],
  process: [
    'institutional.direction_ref',
    'institutional.responsibility_ref',
    'institutional.authority_ref',
    'institutional.run_ref',
    'institutional.run_grant_ref',
    'institutional.ecs_sha256',
    'energy.authorization',
    'cost.authorization',
  ],
  platform: [
    'execution',
  ],
  memory: [
    'evidence',
    'epistemic.observations',
    'epistemic.claims',
    'epistemic.uncertainties',
    'epistemic.conflicts',
    'epistemic.freshness',
    'epistemic.evidence_refs',
  ],
  heartime: [
    'circulation',
    'epistemic.next_sample',
    'energy.consumption',
    'cost.consumption',
    'lineage.transition_refs',
  ],
  homeostasis: [
    'health',
  ],
});

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function assertOwned(organ, path) {
  const allowed = OWNERSHIP[organ] ?? [];
  if (!allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))) {
    throw new Error(`${organ} does not own Card field ${path}`);
  }
}

function splitPath(path) {
  if (typeof path !== 'string' || path.length === 0) throw new TypeError('CardPatch path must be a non-empty string');
  const segments = path.split('.');
  if (segments.some((segment) => !segment || FORBIDDEN_SEGMENTS.has(segment))) throw new Error(`unsafe CardPatch path: ${path}`);
  return segments;
}

function getPath(root, path) {
  return splitPath(path).reduce((current, key) => current?.[key], root);
}

function setPath(root, path, value) {
  const segments = splitPath(path);
  let current = root;
  for (const key of segments.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  current[segments.at(-1)] = structuredClone(value);
}

export function validateCardPatch(patch) {
  plain(patch, 'CardPatch');
  const allowedRoot = new Set(['contract_version', 'card_ref', 'base_revision', 'organ', 'at', 'reason', 'set', 'append']);
  for (const key of Object.keys(patch)) if (!allowedRoot.has(key)) throw new Error(`CardPatch contains unsupported field: ${key}`);
  if (patch.contract_version !== CARD_PATCH_CONTRACT_VERSION) throw new Error(`unsupported CardPatch contract: ${patch.contract_version}`);
  if (!CARD_ORGANS.has(patch.organ)) throw new Error(`unsupported CardPatch organ: ${patch.organ}`);
  if (typeof patch.card_ref !== 'string' || !patch.card_ref.startsWith('pf.')) throw new TypeError('CardPatch.card_ref must be a pf.* reference');
  if (!Number.isSafeInteger(patch.base_revision) || patch.base_revision < 1) throw new TypeError('CardPatch.base_revision must be a positive safe integer');
  if (typeof patch.at !== 'string' || !Number.isFinite(Date.parse(patch.at))) throw new TypeError('CardPatch.at must be an ISO timestamp');
  if (patch.reason != null && (typeof patch.reason !== 'string' || patch.reason.length === 0)) throw new TypeError('CardPatch.reason must be a non-empty string');
  plain(patch.set ?? {}, 'CardPatch.set');
  plain(patch.append ?? {}, 'CardPatch.append');
  const paths = [...Object.keys(patch.set ?? {}), ...Object.keys(patch.append ?? {})];
  if (paths.length === 0) throw new Error('CardPatch must change or append at least one field');
  for (const path of paths) assertOwned(patch.organ, path);
  return patch;
}

export function makeCardPatch({ card, organ, at, reason = null, set = {}, append = {} }) {
  return validateCardPatch({
    contract_version: CARD_PATCH_CONTRACT_VERSION,
    card_ref: card.ref,
    base_revision: card.revision,
    organ,
    at,
    reason,
    set,
    append,
  });
}

export async function applyCardPatch(card, patch, { requireValidSeal = true } = {}) {
  validateCardV1(card, { requireSeal: requireValidSeal });
  if (requireValidSeal && !(await verifyCardSeal(card))) throw new Error(`Card ${card.ref} content seal mismatch`);
  validateCardPatch(patch);
  if (patch.card_ref !== card.ref) throw new Error(`CardPatch targets ${patch.card_ref}, not ${card.ref}`);
  if (patch.base_revision !== card.revision) {
    throw new Error(`CardPatch base revision ${patch.base_revision} does not match Card revision ${card.revision}`);
  }
  if (Date.parse(patch.at) < Date.parse(card.updated_at)) throw new Error('CardPatch.at cannot precede Card.updated_at');

  const next = structuredClone(card);
  delete next.content_sha256;
  for (const [path, value] of Object.entries(patch.set ?? {})) setPath(next, path, value);
  for (const [path, values] of Object.entries(patch.append ?? {})) {
    if (!Array.isArray(values)) throw new TypeError(`CardPatch append ${path} must be an array`);
    const current = getPath(next, path);
    if (!Array.isArray(current)) throw new TypeError(`CardPatch append target ${path} must already be an array`);
    const merged = [...current];
    for (const value of values) if (!merged.some((item) => JSON.stringify(item) === JSON.stringify(value))) merged.push(structuredClone(value));
    setPath(next, path, merged);
  }
  next.revision += 1;
  next.updated_at = patch.at;
  if (next.contract_version !== CARD_CONTRACT_VERSION) throw new Error('CardPatch cannot change the Card contract');
  return sealCard(next);
}

export function ownershipFor(organ) {
  if (!CARD_ORGANS.has(organ)) throw new Error(`unsupported Card organ: ${organ}`);
  return [...OWNERSHIP[organ]];
}
