import {
  HEARTIME_RUNTIME_REF,
  PORT_VERSIONS,
  assertInstitutionalRef,
} from '../../../circulation/attention/lib/contract.mjs';

const DEFAULT_SUBJECT = HEARTIME_RUNTIME_REF;
const DEFAULT_AUDIENCE = 'powerfarm.supabase.postgrest';
const DEFAULT_MIN_TTL_SECONDS = 60;

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} is required`);
  return value.trim();
}

function parseExpiry(value, label = 'token expiry') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid ${label}: ${String(value)}`);
  return parsed;
}

function decodeJwtExpiry(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function assertTokenData(data, nowMs) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Registry runtime-token port returned invalid data');
  }
  const accessToken = requiredString(data.access_token, 'runtime access token');
  const expiresAt = data.expires_at == null ? decodeJwtExpiry(accessToken) : parseExpiry(data.expires_at);
  if (!Number.isFinite(expiresAt)) {
    throw new Error('runtime access token must carry an explicit or JWT expiry');
  }
  if (expiresAt <= nowMs) throw new Error('runtime access token is already expired');
  return {
    accessToken,
    expiresAt,
    subjectRef: assertInstitutionalRef(data.subject_ref, 'runtime token subject_ref'),
  };
}

export class RegistryRuntimeTokenProvider {
  constructor({
    binding,
    subjectRef = DEFAULT_SUBJECT,
    audience = DEFAULT_AUDIENCE,
    minimumTtlSeconds = DEFAULT_MIN_TTL_SECONDS,
    now = () => Date.now(),
  }) {
    if (!binding || typeof binding.issueRuntimeToken !== 'function') {
      throw new TypeError('REGISTRY_IDENTITY.issueRuntimeToken RPC method is required');
    }
    this.binding = binding;
    this.subjectRef = assertInstitutionalRef(requiredString(subjectRef, 'runtime subject ref'), 'runtime subject ref');
    this.audience = requiredString(audience, 'runtime token audience');
    this.minimumTtlMs = Number(minimumTtlSeconds) * 1000;
    if (!Number.isFinite(this.minimumTtlMs) || this.minimumTtlMs < 10_000) {
      throw new TypeError('minimumTtlSeconds must be at least 10');
    }
    this.now = now;
    this.cached = null;
  }

  invalidate() {
    this.cached = null;
  }

  async getToken({ forceRefresh = false } = {}) {
    const nowMs = this.now();
    if (!forceRefresh && this.cached && this.cached.expiresAt - nowMs > this.minimumTtlMs) {
      return this.cached.accessToken;
    }

    const envelope = await this.binding.issueRuntimeToken({
      contract_version: PORT_VERSIONS.runtime_token,
      caller: {
        identity_ref: this.subjectRef,
        component_ref: HEARTIME_RUNTIME_REF,
      },
      subject_ref: this.subjectRef,
      audience: this.audience,
      minimum_ttl_seconds: Math.ceil(this.minimumTtlMs / 1000),
    });
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      throw new Error('Registry runtime-token port returned no contract envelope');
    }
    if (envelope.contract_version !== PORT_VERSIONS.runtime_token) {
      throw new Error(`Registry runtime-token contract mismatch: expected ${PORT_VERSIONS.runtime_token}`);
    }
    this.cached = assertTokenData(envelope.data, nowMs);
    if (this.cached.subjectRef !== this.subjectRef) {
      this.invalidate();
      throw new Error(`runtime token subject mismatch: expected ${this.subjectRef}`);
    }
    if (this.cached.expiresAt - nowMs <= this.minimumTtlMs) {
      this.invalidate();
      throw new Error('runtime access token lifetime is below the required minimum');
    }
    return this.cached.accessToken;
  }
}

export class ExplicitStaticBearerProvider {
  constructor({ token, allowStatic = false, minimumTtlSeconds = DEFAULT_MIN_TTL_SECONDS, now = () => Date.now() }) {
    if (!allowStatic) {
      throw new Error('static Heartime bearer is disabled; use REGISTRY_IDENTITY or explicitly enable local fallback');
    }
    this.token = requiredString(token, 'HEARTIME_BEARER');
    this.minimumTtlMs = Number(minimumTtlSeconds) * 1000;
    this.now = now;
  }

  invalidate() {}

  async getToken() {
    const expiry = decodeJwtExpiry(this.token);
    if (expiry != null && expiry - this.now() <= this.minimumTtlMs) {
      throw new Error('static Heartime bearer is expired or too close to expiry');
    }
    return this.token;
  }
}

export function createHeartimeTokenProviderFromEnv(env) {
  if (!env || typeof env !== 'object') throw new TypeError('Heartime Worker environment is required');
  const minimumTtlSeconds = Number(env.HEARTIME_TOKEN_MIN_TTL_SECONDS ?? DEFAULT_MIN_TTL_SECONDS);

  if (env.REGISTRY_IDENTITY) {
    return new RegistryRuntimeTokenProvider({
      binding: env.REGISTRY_IDENTITY,
      subjectRef: env.HEARTIME_IDENTITY_REF ?? DEFAULT_SUBJECT,
      audience: env.HEARTIME_TOKEN_AUDIENCE ?? DEFAULT_AUDIENCE,
      minimumTtlSeconds,
    });
  }

  return new ExplicitStaticBearerProvider({
    token: env.HEARTIME_BEARER,
    allowStatic: env.HEARTIME_ALLOW_STATIC_BEARER === 'true',
    minimumTtlSeconds,
  });
}

export const RUNTIME_TOKEN_DEFAULTS = Object.freeze({
  subjectRef: DEFAULT_SUBJECT,
  audience: DEFAULT_AUDIENCE,
  minimumTtlSeconds: DEFAULT_MIN_TTL_SECONDS,
});
