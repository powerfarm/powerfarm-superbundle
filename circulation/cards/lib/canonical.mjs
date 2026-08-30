const encoder = new TextEncoder();

function normalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical Card values must contain only finite numbers');
    if (Object.is(value, -0)) return 0;
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) out[key] = normalize(child);
    }
    return out;
  }
  throw new TypeError(`unsupported canonical Card value: ${typeof value}`);
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto subtle.digest is required');
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function digestValue(value) {
  return `sha256:${await sha256Hex(canonicalJson(value))}`;
}
