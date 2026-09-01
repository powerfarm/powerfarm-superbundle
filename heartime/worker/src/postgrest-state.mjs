import {
  HEARTIME_CYCLE_VERSION,
  HEARTIME_RUNTIME_REF,
  assertInstitutionalRef,
} from '../../../circulation/lib/contract.mjs';
import { ATTENTION_RECONCILER_REF } from '../../../circulation/attention/lib/contract.mjs';
import { createHeartimeTokenProviderFromEnv } from './token-provider.mjs';

const CYCLE_CONTRACT = HEARTIME_CYCLE_VERSION;
const INSTITUTION_ASSERT_CONTRACT = 'powerfarm.heartime.institution-assert.v1';

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} is required`);
  return value.trim();
}

function normalizeBaseUrl(value, { allowInsecure = false } = {}) {
  const raw = requiredString(value, 'SUPABASE_URL').replace(/\/+$/, '');
  let url;
  try { url = new URL(raw); }
  catch { throw new TypeError('SUPABASE_URL must be an absolute URL'); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowInsecure && local && url.protocol === 'http:')) {
    throw new Error('SUPABASE_URL must use HTTPS; insecure HTTP is allowed only for explicit local development');
  }
  return url.toString().replace(/\/+$/, '');
}

function assertCycleEnvelope(value, operation) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Heartime ${operation} returned an invalid object`);
  }
  if (value.contract_version !== CYCLE_CONTRACT) {
    throw new Error(`Heartime ${operation} contract mismatch: ${value.contract_version ?? 'none'}`);
  }
  return value;
}

export class PostgrestHeartimeState {
  constructor({
    baseUrl,
    publishableKey,
    tokenProvider,
    fetchImpl = globalThis.fetch,
    requestTimeoutMs = 10_000,
    allowInsecure = false,
    reconcilerRef = ATTENTION_RECONCILER_REF,
    componentRef = HEARTIME_RUNTIME_REF,
    expectedInstitutionRef = null,
    expectedAnchorDigest = null,
  }) {
    this.baseUrl = normalizeBaseUrl(baseUrl, { allowInsecure });
    this.publishableKey = requiredString(publishableKey, 'SUPABASE_PUBLISHABLE_KEY');
    if (!tokenProvider || typeof tokenProvider.getToken !== 'function') {
      throw new TypeError('Heartime tokenProvider.getToken is required');
    }
    this.tokenProvider = tokenProvider;
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.fetchImpl = fetchImpl;
    this.reconcilerRef = assertInstitutionalRef(reconcilerRef, 'HEARTIME_RECONCILER_REF');
    this.componentRef = assertInstitutionalRef(componentRef, 'HEARTIME_COMPONENT_REF');
    this.requestTimeoutMs = Number(requestTimeoutMs);
    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs < 100 || this.requestTimeoutMs > 60_000) {
      throw new TypeError('requestTimeoutMs must be between 100 and 60000');
    }
    // Which institution is this Heartime serving?
    //
    //   Genesis creates an institution. Recovery must never create one.
    //
    // Heartime carried no institutional identity, so a worker pointed at the
    // wrong database — a restored snapshot, a second project, a copied
    // connection string — would have beaten on someone else's circulation
    // without noticing. It must now declare which institution it serves, and the
    // database refuses if it serves a different one, or none.
    if (typeof expectedInstitutionRef !== 'string' || !/^inst_[0-9a-f]{32}$/.test(expectedInstitutionRef)) {
      throw new TypeError(
        'HEARTIME_EXPECTED_INSTITUTION is required: Heartime must declare which institution it serves '
        + 'before it may wake anything on that institution\'s behalf',
      );
    }
    if (expectedAnchorDigest != null && !/^[0-9a-f]{64}$/.test(expectedAnchorDigest)) {
      throw new TypeError('HEARTIME_EXPECTED_ANCHOR_DIGEST is not a sha256 digest');
    }
    this.expectedInstitutionRef = expectedInstitutionRef;
    this.expectedAnchorDigest = expectedAnchorDigest;
    this.institution = null;
  }

  /**
   * Establish that this database serves the institution this worker declared.
   *
   * Read-only and fail-closed. Called before any cycle work, and memoized for the
   * life of the handle: the answer cannot change without a new deployment.
   */
  async assertInstitution() {
    if (this.institution !== null) return this.institution;
    const value = await this.rpc('assert_institution_v1', {
      p_institution_ref: this.expectedInstitutionRef,
      p_anchor_digest: this.expectedAnchorDigest,
    });
    const data = value?.data;
    if (value?.contract_version !== INSTITUTION_ASSERT_CONTRACT || !data) {
      throw new Error('Heartime institution assertion contract mismatch');
    }
    if (data.institution_ref !== this.expectedInstitutionRef) {
      throw new Error('Heartime institution assertion returned a different institution');
    }
    this.institution = data;
    return data;
  }

  async request(name, params, { forceRefresh = false } = {}) {
    const bearer = await this.tokenProvider.getToken({ forceRefresh });
    return this.fetchImpl(`${this.baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: this.publishableKey,
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/json',
        'content-profile': 'heartime',
        'accept-profile': 'heartime',
        accept: 'application/json',
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
  }

  async rpc(name, params) {
    let response = await this.request(name, params);
    if (response.status === 401 && typeof this.tokenProvider.invalidate === 'function') {
      this.tokenProvider.invalidate();
      response = await this.request(name, params, { forceRefresh: true });
    }

    const bodyText = await response.text();
    let body = null;
    if (bodyText !== '') {
      try { body = JSON.parse(bodyText); }
      catch { body = bodyText; }
    }
    if (!response.ok) {
      const detail = typeof body === 'string' ? body : JSON.stringify(body);
      throw new Error(`Heartime RPC ${name} failed (${response.status}): ${detail}`);
    }
    return body;
  }

  async nextWake({ now }) {
    const value = await this.rpc('next_reconciliation_wake_v1', {
      p_now: now,
      p_reconciler_ref: this.reconcilerRef,
    });
    if (value == null) return null;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
      throw new Error(`Heartime next_reconciliation_wake_v1 returned invalid timestamp: ${String(value)}`);
    }
    return value;
  }

  async prepareCycle({ now }) {
    const value = await this.rpc('prepare_cycle_v1', {
      p_now: now,
      p_limit: 32,
      p_reconciler_ref: this.reconcilerRef,
    });
    return assertCycleEnvelope(value, 'prepare_cycle_v1');
  }

  async finishCycle({ now, beat_refs, summaries }) {
    const value = await this.rpc('finish_cycle_v1', {
      p_now: now,
      p_beat_refs: beat_refs,
      p_summaries: summaries,
      p_reconciler_ref: this.reconcilerRef,
    });
    return assertCycleEnvelope(value, 'finish_cycle_v1');
  }

  async deferFailure({ now, beat_refs = [], retry_count = 0, error }) {
    const value = await this.rpc('defer_failure_v1', {
      p_now: now,
      p_beat_refs: beat_refs,
      p_retry_count: retry_count,
      p_error: String(error ?? 'unknown failure'),
      p_reconciler_ref: this.reconcilerRef,
    });
    return assertCycleEnvelope(value, 'defer_failure_v1');
  }

  async recordTrace({ trace_ref, event_name, observed_at, card_ref = null, beat_ref = null, attempt_ref = null, attributes = {} }) {
    assertInstitutionalRef(trace_ref, 'trace_ref');
    if (card_ref != null) assertInstitutionalRef(card_ref, 'card_ref');
    if (beat_ref != null) assertInstitutionalRef(beat_ref, 'beat_ref');
    if (attempt_ref != null) assertInstitutionalRef(attempt_ref, 'attempt_ref');
    if (typeof event_name !== 'string' || event_name.trim() === '') throw new TypeError('event_name is required');
    if (typeof observed_at !== 'string' || !Number.isFinite(Date.parse(observed_at))) throw new TypeError('observed_at must be an ISO timestamp');
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) throw new TypeError('trace attributes must be an object');
    return this.rpc('record_trace_event_v1', {
      p_trace_ref: trace_ref,
      p_component_ref: this.componentRef,
      p_event_name: event_name,
      p_observed_at: observed_at,
      p_card_ref: card_ref,
      p_beat_ref: beat_ref,
      p_attempt_ref: attempt_ref,
      p_attributes: attributes,
    });
  }
}

export function createHeartimeStateFromEnv(env, fetchImpl = globalThis.fetch) {
  if (!env || typeof env !== 'object') throw new TypeError('Heartime Worker environment is required');
  return new PostgrestHeartimeState({
    baseUrl: env.SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY,
    tokenProvider: createHeartimeTokenProviderFromEnv(env),
    fetchImpl,
    requestTimeoutMs: Number(env.HEARTIME_POSTGREST_TIMEOUT_MS ?? 10_000),
    allowInsecure: env.HEARTIME_ALLOW_INSECURE_POSTGREST === 'true',
    reconcilerRef: env.HEARTIME_RECONCILER_REF ?? ATTENTION_RECONCILER_REF,
    componentRef: env.HEARTIME_COMPONENT_REF ?? HEARTIME_RUNTIME_REF,
    expectedInstitutionRef: env.HEARTIME_EXPECTED_INSTITUTION ?? null,
    expectedAnchorDigest: env.HEARTIME_EXPECTED_ANCHOR_DIGEST ?? null,
  });
}

export { CYCLE_CONTRACT };
