import assert from 'node:assert/strict';
import test from 'node:test';
import { createCardV1 } from '../lib/card-v1.mjs';
import { traceHeaders, traceRefForBeat, traceRefForCard, w3cTraceparent } from '../../lib/trace.mjs';

const T = '2026-08-30T06:00:00.000Z';

test('CardRef yields one immutable deterministic operational trace ref without changing Card v1', async () => {
  const card = await createCardV1({
    ref: 'pf.card.production-trace', scope: 'pf.office.operations', created_at: T,
    circulation: { state: 'blocked', next_expected: null, blocked_reason: 'test' },
  });
  assert.equal(traceRefForCard(card.ref), 'pf.trace.card.production-trace');
  assert.equal('trace_ref' in card, false);
});

test('beat trace and W3C traceparent are deterministic correlation, not identity', async () => {
  const traceRef = traceRefForBeat('pf.beat.42');
  assert.equal(traceRef, 'pf.trace.beat.42');
  const first = await w3cTraceparent({ traceRef, spanSeed: 'dispatch' });
  const second = await w3cTraceparent({ traceRef, spanSeed: 'dispatch' });
  assert.equal(first, second);
  assert.match(first, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  const headers = await traceHeaders({ traceRef, spanSeed: 'registry', beatRef: 'pf.beat.42' });
  assert.equal(headers['x-powerfarm-trace-ref'], traceRef);
  assert.equal(headers['x-powerfarm-beat-ref'], 'pf.beat.42');
});
