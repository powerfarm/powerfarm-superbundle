import { assertInstitutionalRef, validateCallerContext } from '../../../circulation/lib/contract.mjs';
import { traceHeaders } from '../../../circulation/lib/trace.mjs';

export const PROCESS_ADMISSION_PORT = 'powerfarm.process.admission-port.v1';
export const PROCESS_ADMISSION_WRITE = 'powerfarm.process.admission-write.v2';
export const PROCESS_INSTITUTION_ASSERT = 'powerfarm.process.institution-assert.v1';
export const PROCESS_BOOTSTRAP_WRITE = 'powerfarm.process.bootstrap.v3';
export const REGISTRY_RUNTIME_TOKEN = 'powerfarm.registry.runtime-token.v1';
export const PROCESS_WRITER_REF = 'pf.runtime.process-writer';
const DEFAULT_AUDIENCE = 'powerfarm.supabase.postgrest';

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} is required`);
  return value.trim();
}

function baseUrl(value, allowInsecure = false) {
  const url = new URL(requiredString(value, 'SUPABASE_URL').replace(/\/+$/, ''));
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowInsecure && local && url.protocol === 'http:')) {
    throw new Error('SUPABASE_URL must use HTTPS outside explicit local development');
  }
  return url.toString().replace(/\/+$/, '');
}

// Which institution is this worker serving?
//
//   Genesis creates an institution. Recovery must never create one.
//
// The worker declares the institution it serves through configuration, and the
// database refuses if it serves a different one -- or none. An empty or foreign
// database is not authorization to bootstrap, so there is no fallback here: a
// mismatch fails closed before any act is persisted.
function expectedInstitution(env) {
  const ref = env.PROCESS_EXPECTED_INSTITUTION;
  if (typeof ref !== 'string' || ref.trim() === '') {
    throw new Error(
      'PROCESS_EXPECTED_INSTITUTION is required: a Process writer must declare which institution it serves '
      + 'before it may persist anything on that institution\'s behalf',
    );
  }
  const institutionRef = ref.trim();
  if (!/^inst_[0-9a-f]{32}$/.test(institutionRef)) throw new Error('PROCESS_EXPECTED_INSTITUTION is not an institution_ref');
  const digest = typeof env.PROCESS_EXPECTED_ANCHOR_DIGEST === 'string' ? env.PROCESS_EXPECTED_ANCHOR_DIGEST.trim() : '';
  if (digest !== '' && !/^[0-9a-f]{64}$/.test(digest)) throw new Error('PROCESS_EXPECTED_ANCHOR_DIGEST is not a sha256 digest');
  return { institutionRef, anchorDigest: digest === '' ? null : digest };
}

export async function assertInstitution({ env, fetchImpl = globalThis.fetch, trace = {} }) {
  const { institutionRef, anchorDigest } = expectedInstitution(env);
  const envelope = await postgrestRpc({
    env, fetchImpl, rpc: 'assert_institution_v1',
    body: { p_institution_ref: institutionRef, p_anchor_digest: anchorDigest },
    trace,
  });
  if (!envelope || envelope.contract_version !== PROCESS_INSTITUTION_ASSERT) {
    throw new Error('Process institution assertion contract mismatch');
  }
  if (envelope.data?.institution_ref !== institutionRef) {
    throw new Error('Process institution assertion returned a different institution');
  }
  return envelope.data;
}

function allowedCallers(env) {
  const raw = requiredString(env.PROCESS_WRITER_CALLERS ?? 'pf.runtime.process-writer', 'PROCESS_WRITER_CALLERS');
  return new Set(raw.split(',').map((v) => assertInstitutionalRef(v.trim(), 'Process writer caller')));
}

function validatePortRequest(request) {
  if (!request || request.contract_version !== PROCESS_ADMISSION_PORT) {
    throw new Error(`Process admission port contract mismatch: expected ${PROCESS_ADMISSION_PORT}`);
  }
  const caller = validateCallerContext(request.caller, 'Process admission caller');
  if (!request.admission || request.admission.contract_version !== PROCESS_ADMISSION_WRITE) {
    throw new Error(`Process admission payload contract mismatch: expected ${PROCESS_ADMISSION_WRITE}`);
  }
  if (!request.admission.data || typeof request.admission.data !== 'object' || Array.isArray(request.admission.data)) {
    throw new TypeError('Process admission payload data is required');
  }
  assertInstitutionalRef(request.card_ref, 'card_ref');
  assertInstitutionalRef(request.beat_ref, 'beat_ref');
  assertInstitutionalRef(request.attempt_ref, 'attempt_ref');
  if (request.trace_ref != null) assertInstitutionalRef(request.trace_ref, 'trace_ref');
  const data = request.admission.data;
  if (data.card_ref !== request.card_ref) throw new Error('Process admission card_ref mismatch');
  if (data.beat_ref !== request.beat_ref) throw new Error('Process admission beat_ref mismatch');
  if (data.attempt_ref !== request.attempt_ref) throw new Error('Process admission attempt_ref mismatch');
  if (typeof data.execution_slice_sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(data.execution_slice_sha256)) {
    throw new Error('Process admission execution_slice_sha256 is required');
  }
  if ((data.trace_ref ?? null) !== (request.trace_ref ?? null)) throw new Error('Process admission trace_ref mismatch');
  return caller;
}

async function runtimeToken({ env, minimumTtlSeconds = 60 }) {
  if (!env.REGISTRY_IDENTITY || typeof env.REGISTRY_IDENTITY.issueRuntimeToken !== 'function') {
    throw new TypeError('REGISTRY_IDENTITY.issueRuntimeToken Service Binding is required');
  }
  const envelope = await env.REGISTRY_IDENTITY.issueRuntimeToken({
    contract_version: REGISTRY_RUNTIME_TOKEN,
    caller: { identity_ref: PROCESS_WRITER_REF, component_ref: PROCESS_WRITER_REF },
    subject_ref: PROCESS_WRITER_REF,
    audience: env.PROCESS_TOKEN_AUDIENCE ?? DEFAULT_AUDIENCE,
    minimum_ttl_seconds: minimumTtlSeconds,
  });
  if (!envelope || envelope.contract_version !== REGISTRY_RUNTIME_TOKEN) {
    throw new Error('Registry runtime-token contract mismatch');
  }
  const token = requiredString(envelope.data?.access_token, 'Process runtime access token');
  if (envelope.data?.subject_ref !== PROCESS_WRITER_REF) throw new Error('Process runtime token subject mismatch');
  return token;
}

async function postgrestRpc({ env, fetchImpl, rpc, body, trace = null }) {
  const token = await runtimeToken({ env, minimumTtlSeconds: Number(env.PROCESS_TOKEN_MIN_TTL_SECONDS ?? 60) });
  const url = `${baseUrl(env.SUPABASE_URL, env.PROCESS_ALLOW_INSECURE_POSTGREST === 'true')}/rest/v1/rpc/${rpc}`;
  const headers = {
    apikey: requiredString(env.SUPABASE_PUBLISHABLE_KEY, 'SUPABASE_PUBLISHABLE_KEY'),
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'content-profile': 'continuum',
    'accept-profile': 'continuum',
    accept: 'application/json',
    ...(trace ?? {}),
  };
  const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) throw new Error(`Process RPC ${rpc} failed (${response.status}): ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  return payload;
}

export async function persistAdmittedBatch({ request, env, fetchImpl = globalThis.fetch }) {
  const caller = validatePortRequest(request);
  if (!allowedCallers(env).has(caller.identity_ref)) throw new Error(`Process admission caller not admitted: ${caller.identity_ref}`);
  const headers = request.trace_ref ? await traceHeaders({
    traceRef: request.trace_ref,
    spanSeed: request.beat_ref ?? request.attempt_ref ?? request.admission.data.request_id,
    cardRef: request.card_ref ?? null,
    beatRef: request.beat_ref ?? null,
    attemptRef: request.attempt_ref ?? null,
  }) : {};
  // Before anything is persisted on this institution's behalf, establish that
  // this database is that institution.
  await assertInstitution({ env, fetchImpl, trace: headers });
  const envelope = await postgrestRpc({ env, fetchImpl, rpc: 'admit_card_batch_v2', body: { p_request: request.admission }, trace: headers });
  if (!envelope || envelope.contract_version !== PROCESS_ADMISSION_WRITE) throw new Error('Process writer response contract mismatch');
  return { contract_version: PROCESS_ADMISSION_PORT, data: envelope.data };
}

// The genesis ceremony, carrying the institutional anchor. This is the only path
// that may bring an institution into existence in this database, and no normal
// startup reaches it: persistAdmittedBatch asserts, it never bootstraps.
export async function bootstrapInstitution({ request, env, fetchImpl = globalThis.fetch }) {
  if (!request || request.contract_version !== PROCESS_ADMISSION_PORT) throw new Error('Process admission port contract mismatch');
  const caller = validateCallerContext(request.caller, 'Process bootstrap caller');
  if (!allowedCallers(env).has(caller.identity_ref)) throw new Error(`Process admission caller not admitted: ${caller.identity_ref}`);
  const data = request.data ?? {};
  for (const field of ['institution_id', 'genesis_ref', 'anchor_digest', 'protocol_version']) {
    if (typeof data[field] !== 'string' || data[field].trim() === '') {
      throw new Error(`Process bootstrap requires ${field}: an institution is founded with its anchor, not without one`);
    }
  }
  const envelope = await postgrestRpc({
    env, fetchImpl, rpc: 'bootstrap_institution_v3',
    body: {
      p_institution_id: data.institution_id,
      p_title: data.title,
      p_genesis_ref: data.genesis_ref,
      p_anchor_digest: data.anchor_digest,
      p_protocol_version: data.protocol_version,
      p_timeline_id: data.timeline_id ?? 'main',
    },
  });
  if (!envelope || envelope.contract_version !== PROCESS_BOOTSTRAP_WRITE) throw new Error('Process bootstrap response contract mismatch');
  return { contract_version: PROCESS_ADMISSION_PORT, data: envelope.data };
}
