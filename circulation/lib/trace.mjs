const REF = /^pf(?:\.[a-z0-9][a-z0-9-]*)+$/;

export function traceRefForBeat(beatRef) {
  if (typeof beatRef !== 'string' || !REF.test(beatRef)) throw new TypeError('BeatRef must be a canonical pf.* reference');
  return `pf.trace.${beatRef.replace(/^pf\./, '')}`;
}

export function traceRefForCard(cardRef) {
  if (typeof cardRef !== 'string' || !REF.test(cardRef)) throw new TypeError('CardRef must be a canonical pf.* reference');
  return `pf.trace.${cardRef.replace(/^pf\./, '')}`;
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

export async function w3cTraceparent({ traceRef, spanSeed, sampled = true }) {
  if (typeof traceRef !== 'string' || !REF.test(traceRef)) throw new TypeError('traceRef must be a canonical pf.* reference');
  if (typeof spanSeed !== 'string' || spanSeed.length === 0) throw new TypeError('spanSeed is required');
  const traceId = hex((await digest(`powerfarm-trace-v1:${traceRef}`)).slice(0, 16));
  const spanId = hex((await digest(`powerfarm-span-v1:${traceRef}:${spanSeed}`)).slice(0, 8));
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`;
}

export async function traceHeaders({ traceRef, spanSeed, cardRef = null, beatRef = null, attemptRef = null }) {
  const headers = {
    traceparent: await w3cTraceparent({ traceRef, spanSeed }),
    'x-powerfarm-trace-ref': traceRef,
  };
  if (cardRef) headers['x-powerfarm-card-ref'] = cardRef;
  if (beatRef) headers['x-powerfarm-beat-ref'] = beatRef;
  if (attemptRef) headers['x-powerfarm-attempt-ref'] = attemptRef;
  return headers;
}

export function traceEvent({ event, traceRef, componentRef, at, cardRef = null, beatRef = null, attemptRef = null, attributes = {} }) {
  if (typeof event !== 'string' || event.length === 0) throw new TypeError('trace event name is required');
  if (!REF.test(traceRef)) throw new TypeError('traceRef must be canonical');
  if (!REF.test(componentRef)) throw new TypeError('componentRef must be canonical');
  if (!Number.isFinite(Date.parse(at))) throw new TypeError('trace event timestamp must be ISO');
  return {
    contract_version: 'powerfarm.operational-trace.v1',
    event,
    trace_ref: traceRef,
    component_ref: componentRef,
    card_ref: cardRef,
    beat_ref: beatRef,
    attempt_ref: attemptRef,
    observed_at: at,
    attributes: structuredClone(attributes),
  };
}
