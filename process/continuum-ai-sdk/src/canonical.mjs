import { createHash } from 'node:crypto';

function normalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $number: 'nan' };
    if (value === Infinity) return { $number: 'inf' };
    if (value === -Infinity) return { $number: '-inf' };
    if (Object.is(value, -0)) return { $number: '-0' };
    return Number.isSafeInteger(value) ? value : { $number: String(value) };
  }
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return { $bytes_sha256: sha256(bytes), $bytes_length: bytes.length };
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value instanceof Set) {
    const items = [...value].map(normalize).map(v => JSON.stringify(v)).sort().map(JSON.parse);
    return { $set: items };
  }
  if (value instanceof Map) {
    const pairs = [...value.entries()].map(([k, v]) => [normalize(k), normalize(v)]);
    pairs.sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
    return { $map: pairs };
  }
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = normalize(value[key]);
    return out;
  }
  return { $type: typeof value, $repr_sha256: sha256(String(value)) };
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Json(value) {
  return sha256(canonicalJson(value));
}

export function digestSummary(value) {
  const raw = canonicalJson(value);
  let shape = typeof value;
  let items = 1;
  if (Array.isArray(value)) {
    shape = 'array';
    items = value.length;
  } else if (value && typeof value === 'object') {
    shape = 'object';
    items = Object.keys(value).length;
  }
  return {
    sha256: sha256(raw),
    bytes: Buffer.byteLength(raw),
    shape,
    items,
  };
}

export function errorEvidence(error) {
  return {
    type: error?.constructor?.name || typeof error,
    message_sha256: sha256(String(error?.message ?? error)),
  };
}
