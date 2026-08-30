import {
  HEARTIME_CYCLE_VERSION,
  assertGeneration,
  assertInstitutionalRef,
} from '../../../circulation/lib/contract.mjs';
import { traceRefForBeat } from '../../../circulation/lib/trace.mjs';

const LOCAL_FAILURE_KEY = 'heartime:provider-fallback-count';
const MIN_PROVIDER_DELAY_MS = 1_000;
const DEFAULT_FALLBACK_BASE_MS = 5_000;
const DEFAULT_FALLBACK_MAX_MS = 15 * 60_000;

const BEAT_FIELDS = new Set([
  'ref',
  'reconciler_ref',
  'reason',
  'resource_hint',
  'contract_ref',
  'contract_generation',
  'trace_ref',
]);

const FORBIDDEN_WAKE_FIELDS = new Set([
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

const errorMessage = (error) => error instanceof Error ? error.message : String(error);

async function recordOperationalTrace(stateApi, event) {
  if (!stateApi || typeof stateApi.recordTrace !== 'function') return;
  try {
    await stateApi.recordTrace(event);
  } catch (error) {
    // Observability must never become a new source of institutional authority
    // or suppress liveness. Structured logs remain the provider-local fallback.
    console.warn(JSON.stringify({
      event: 'heartime.trace.persist_failed',
      trace_ref: event.trace_ref,
      beat_ref: event.beat_ref ?? null,
      trace_event: event.event_name,
      error: errorMessage(error),
    }));
  }
}

function parseTimestamp(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`invalid ${label}: ${value}`);
  return timestamp;
}


function validateCycleEnvelope(value, operation, { requireBeats = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Heartime ${operation} returned an invalid cycle envelope`);
  }
  if (value.contract_version !== HEARTIME_CYCLE_VERSION) {
    throw new Error(`Heartime ${operation} contract mismatch: expected ${HEARTIME_CYCLE_VERSION}`);
  }
  if (requireBeats && !Array.isArray(value.beats)) {
    throw new Error(`Heartime ${operation} must return a beats array`);
  }
  if (value.next_wake != null) parseTimestamp(value.next_wake, `${operation} next wake`);
  return value;
}

function assertOnlyFields(value, allowed, label) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`${label} contains unsupported field: ${field}`);
  }
}

function assertNoForbiddenKeys(value, forbidden, label) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item, forbidden, label);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error(`${label} must not carry forbidden field: ${key}`);
    assertNoForbiddenKeys(child, forbidden, label);
  }
}

function requireMethod(object, method, label) {
  if (!object || typeof object[method] !== 'function') {
    throw new TypeError(`${label}.${method} is required`);
  }
}

function normalizeNow(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('now must be a valid Date');
  return date;
}

function providerAlarmTimestamp(nextWake, now) {
  const desired = parseTimestamp(nextWake, 'next wake');
  return Math.max(desired, normalizeNow(now).getTime() + MIN_PROVIDER_DELAY_MS);
}

export function validateBeatHint(beat) {
  if (!beat || typeof beat !== 'object' || Array.isArray(beat)) throw new TypeError('beat hint required');
  assertNoForbiddenKeys(beat, FORBIDDEN_WAKE_FIELDS, 'Heartime beat');
  assertOnlyFields(beat, BEAT_FIELDS, 'Heartime beat');
  assertInstitutionalRef(beat.ref, 'BeatRef');
  assertInstitutionalRef(beat.reconciler_ref, 'ReconcilerRef');
  if (beat.reason != null && typeof beat.reason !== 'string') throw new TypeError('beat reason must be a string');
  if (beat.resource_hint != null) assertInstitutionalRef(beat.resource_hint, 'resource hint');
  if (beat.contract_ref != null) assertInstitutionalRef(beat.contract_ref, 'reconciliation contract ref');
  if (beat.contract_generation != null) assertGeneration(beat.contract_generation, 'contract generation');
  if (beat.trace_ref != null) assertInstitutionalRef(beat.trace_ref, 'trace ref');
  return beat;
}

export function validateReconcilerResult(result, validator) {
  if (typeof validator !== 'function') throw new TypeError('reconciler summary validator is required');
  return validator(result);
}

async function resetLocalFailureCount(storage) {
  await storage.delete?.(LOCAL_FAILURE_KEY);
}

async function scheduleProviderFallback({
  storage,
  now,
  providerRetryCount = 0,
  baseMs = DEFAULT_FALLBACK_BASE_MS,
  maxMs = DEFAULT_FALLBACK_MAX_MS,
}) {
  requireMethod(storage, 'setAlarm', 'storage');
  const stored = Number(await storage.get?.(LOCAL_FAILURE_KEY) ?? 0);
  const storedAttempt = Number.isSafeInteger(stored) && stored >= 0 ? stored + 1 : 1;
  const providerAttempt = Number.isSafeInteger(providerRetryCount) && providerRetryCount >= 0
    ? providerRetryCount + 1
    : 1;
  const attempt = Math.max(storedAttempt, providerAttempt);
  await storage.put?.(LOCAL_FAILURE_KEY, attempt);
  const exponent = Math.min(attempt - 1, 8);
  const delay = Math.min(maxMs, baseMs * (2 ** exponent));
  const timestamp = normalizeNow(now).getTime() + delay;
  await storage.setAlarm(timestamp);
  return { attempt, delay, timestamp };
}

async function armNext({ storage, nextWake, now }) {
  requireMethod(storage, 'setAlarm', 'storage');
  if (nextWake == null) {
    await storage.deleteAlarm?.();
    return null;
  }
  const timestamp = providerAlarmTimestamp(nextWake, now);
  await storage.setAlarm(timestamp);
  return timestamp;
}

export async function armFromCanonicalState({ stateApi, storage, now = new Date() }) {
  requireMethod(stateApi, 'nextWake', 'stateApi');
  const currentTime = normalizeNow(now);
  const next = await stateApi.nextWake({ now: currentTime.toISOString() });
  const armed = await armNext({ storage, nextWake: next, now: currentTime });
  await resetLocalFailureCount(storage);
  return armed;
}

function providerFallbackResult({ stage, fallback, error, completed = [], failed = [] }) {
  return {
    status: completed.length > 0 ? 'partial_provider_fallback' : 'provider_fallback',
    stage,
    completed,
    completed_count: completed.length,
    failed,
    failed_count: failed.length,
    provider_retry_count: fallback.attempt,
    next_wake: new Date(fallback.timestamp).toISOString(),
    error: errorMessage(error),
  };
}

/**
 * One physical Heartime alarm pass.
 *
 * Canonical state is read from stateApi. Durable Object storage contains only
 * replaceable wake machinery and a local outage counter. Heartime passes only
 * identity hints across the organ boundary and receives compact summaries.
 */
export async function runHeartimeAlarm({
  stateApi,
  reconcilerFor,
  storage,
  now = new Date(),
  alarmInfo = { retryCount: 0, isRetry: false },
  localFallbackBaseMs = DEFAULT_FALLBACK_BASE_MS,
}) {
  requireMethod(stateApi, 'prepareCycle', 'stateApi');
  requireMethod(stateApi, 'finishCycle', 'stateApi');
  requireMethod(stateApi, 'deferFailure', 'stateApi');
  requireMethod(stateApi, 'nextWake', 'stateApi');
  if (typeof reconcilerFor !== 'function') throw new TypeError('reconcilerFor is required');
  requireMethod(storage, 'setAlarm', 'storage');

  const currentTime = normalizeNow(now);
  const observedAt = currentTime.toISOString();
  let cycle;

  try {
    cycle = validateCycleEnvelope(
      await stateApi.prepareCycle({ now: observedAt, alarmInfo }),
      'prepareCycle',
      { requireBeats: true },
    );
  } catch (error) {
    // Canonical storage may itself be unavailable, so the failure cannot be
    // admitted there. The provider-local alarm contains no institutional
    // payload. It only supplies enough energy to look again.
    const fallback = await scheduleProviderFallback({
      storage,
      now: currentTime,
      providerRetryCount: alarmInfo?.retryCount ?? 0,
      baseMs: localFallbackBaseMs,
    });
    return providerFallbackResult({ stage: 'prepare_cycle', fallback, error });
  }

  const beats = (cycle?.beats ?? []).map(validateBeatHint);
  let nextWake = cycle?.next_wake ?? null;

  // Rearm before crossing an organ boundary. If this process dies after a Beat
  // was emitted, the durable open Beat remains discoverable and the physical
  // clock is already scheduled to look again.
  const preArmWake = nextWake ?? (beats.length > 0
    ? new Date(currentTime.getTime() + MIN_PROVIDER_DELAY_MS).toISOString()
    : null);
  await armNext({ storage, nextWake: preArmWake, now: currentTime });

  const completed = [];
  const failed = [];
  const summaries = [];

  for (const beat of beats) {
    let summary;
    try {
      const reconciler = reconcilerFor(beat.reconciler_ref);
      requireMethod(reconciler, 'reconcile', `reconciler ${beat.reconciler_ref}`);
      requireMethod(reconciler, 'validateSummary', `reconciler ${beat.reconciler_ref}`);
      const traceRef = beat.trace_ref ?? traceRefForBeat(beat.ref);
      console.log(JSON.stringify({ event: 'heartime.beat.dispatch', trace_ref: traceRef, beat_ref: beat.ref, reconciler_ref: beat.reconciler_ref, observed_at: observedAt }));
      await recordOperationalTrace(stateApi, {
        trace_ref: traceRef,
        event_name: 'heartime.beat.dispatch',
        observed_at: observedAt,
        beat_ref: beat.ref,
        attributes: { reconciler_ref: beat.reconciler_ref, reason: beat.reason ?? null },
      });
      summary = validateReconcilerResult(await reconciler.reconcile({
        beat_ref: beat.ref,
        reconciler_ref: beat.reconciler_ref,
        reason: beat.reason ?? null,
        resource_hint: beat.resource_hint ?? null,
        trace_ref: traceRef,
      }), reconciler.validateSummary);
      console.log(JSON.stringify({ event: 'heartime.beat.reconciled', trace_ref: traceRef, beat_ref: beat.ref, state: summary.state, observed_at: observedAt }));
      await recordOperationalTrace(stateApi, {
        trace_ref: traceRef,
        event_name: 'heartime.beat.reconciled',
        observed_at: observedAt,
        beat_ref: beat.ref,
        attributes: { reconciler_ref: beat.reconciler_ref, state: summary.state },
      });
    } catch (error) {
      try {
        const deferred = validateCycleEnvelope(await stateApi.deferFailure({
          now: observedAt,
          beat_refs: [beat.ref],
          retry_count: alarmInfo?.retryCount ?? 0,
          error: errorMessage(error),
        }), 'deferFailure');
        nextWake = deferred?.next_wake ?? nextWake;
        await armNext({ storage, nextWake, now: currentTime });
        failed.push({ beat_ref: beat.ref, error: errorMessage(error), persisted: true });
        continue;
      } catch (persistenceError) {
        const fallback = await scheduleProviderFallback({
          storage,
          now: currentTime,
          providerRetryCount: alarmInfo?.retryCount ?? 0,
          baseMs: localFallbackBaseMs,
        });
        failed.push({ beat_ref: beat.ref, error: errorMessage(error), persisted: false });
        return providerFallbackResult({
          stage: 'defer_failure',
          fallback,
          completed,
          failed,
          error: `${errorMessage(error)}; persistence failed: ${errorMessage(persistenceError)}`,
        });
      }
    }

    try {
      const finished = validateCycleEnvelope(await stateApi.finishCycle({
        now: observedAt,
        beat_refs: [beat.ref],
        summaries: [summary],
      }), 'finishCycle');
      nextWake = finished?.next_wake ?? nextWake;
      await armNext({ storage, nextWake, now: currentTime });
      summaries.push(summary);
      completed.push({ beat_ref: beat.ref, state: summary.state });
    } catch (error) {
      // Organ-owned state may already exist, but Heartime did not admit its
      // observation. Leave the Beat open and look again. Downstream idempotency
      // prevents a duplicate institutional consequence.
      const fallback = await scheduleProviderFallback({
        storage,
        now: currentTime,
        providerRetryCount: alarmInfo?.retryCount ?? 0,
        baseMs: localFallbackBaseMs,
      });
      failed.push({ beat_ref: beat.ref, error: errorMessage(error), persisted: false });
      return providerFallbackResult({
        stage: 'finish_cycle',
        fallback,
        completed,
        failed,
        error,
      });
    }
  }

  try {
    // Another writer may have introduced an earlier durable obligation while
    // reconciliation was running, so the final deadline is read again.
    nextWake = await stateApi.nextWake({ now: observedAt });
    await armNext({ storage, nextWake, now: currentTime });
    await resetLocalFailureCount(storage);
  } catch (error) {
    const fallback = await scheduleProviderFallback({
      storage,
      now: currentTime,
      providerRetryCount: alarmInfo?.retryCount ?? 0,
      baseMs: localFallbackBaseMs,
    });
    return providerFallbackResult({
      stage: 'arm_next',
      fallback,
      completed,
      failed,
      error,
    });
  }

  return {
    status: failed.length === 0 ? 'ok' : (completed.length === 0 ? 'deferred' : 'partial'),
    beat_count: beats.length,
    summaries,
    completed,
    completed_count: completed.length,
    failed,
    failed_count: failed.length,
    next_wake: nextWake,
  };
}
