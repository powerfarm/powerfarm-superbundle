import test from 'node:test';
import assert from 'node:assert/strict';
import { obligationKey, reconcileAttention } from '../lib/controller.mjs';
import { validateReconciliationSummary } from '../lib/contract.mjs';
import {
  InMemoryAuthority,
  InMemoryCards,
  InMemoryEvidence,
  InMemoryOccupancies,
  InMemoryRuns,
} from './fixtures/in-memory.mjs';

const card = (overrides = {}) => ({
  ref: 'pf.card.market-change',
  generation: 1,
  scope: 'pf.office.research',
  title: 'A material market change may have occurred',
  why: 'source diff crossed the materiality threshold',
  response_contract: 'investigate',
  evidence_refs: ['pf.evidence.source-diff'],
  affordances: [
    { id: 'inspect' },
    { id: 'publish', requires: 'publication.write', resolution: 'request_authorization' },
  ],
  ...overrides,
});

function system({ species = 'llm', allowed = [], cards: initialCards = [card()], occupancy = true } = {}) {
  return {
    cards: new InMemoryCards(initialCards),
    occupancies: new InMemoryOccupancies(occupancy ? {
      'pf.office.research': { ref: `pf.occupancy.${species}`, office_ref: 'pf.office.research', species },
    } : {}),
    authority: new InMemoryAuthority({ [`pf.occupancy.${species}`]: allowed }),
    runs: new InMemoryRuns(),
    evidence: new InMemoryEvidence(),
  };
}

const run = (sys, beat = 'pf.beat.1', now = '2026-08-23T12:00:00Z') => reconcileAttention({
  scope: 'pf.office.research', beatRef: beat, now: new Date(now), ...sys,
});

test('attempt identity is deterministic and engine-neutral', async () => {
  const input = {
    cardRef: 'pf.card.market-change',
    generation: 1,
    obligationRef: 'pf.card.market-change@1',
    scope: 'pf.office.research',
    responseContract: 'investigate',
  };
  const first = await obligationKey(input);
  const second = await obligationKey(input);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first, second);
});

test('event loss: level-triggered pass discovers durable attention without an event', async () => {
  const sys = system();
  const result = await run(sys);
  assert.equal(result.observation_count, 1);
  assert.equal(sys.runs.attempts.length, 1);
  assert.equal(sys.cards.wakePacks[0].cards[0].ref, 'pf.card.market-change');
});

test('duplicate wake is idempotent and creates one attempt', async () => {
  const sys = system();
  await run(sys, 'pf.beat.1');
  await run(sys, 'pf.beat.1');
  assert.equal(sys.runs.attempts.length, 1);
});

test('worker death leaves attention unresolved and permits occupancy succession', async () => {
  const sys = system();
  await run(sys);
  const first = sys.runs.attempts[0];
  sys.runs.fail(first.ref);
  sys.occupancies.entries['pf.office.research'] = { ref: 'pf.occupancy.successor', office_ref: 'pf.office.research', species: 'llm' };
  await run(sys, 'pf.beat.2');
  assert.equal(sys.runs.attempts.length, 2);
  assert.equal(sys.runs.attempts[1].successor_of, first.ref);
  assert.equal(sys.runs.attempts[1].occupancy_ref, 'pf.occupancy.successor');
});

test('completed work is preserved even when the Office currently has no Occupancy', async () => {
  const sys = system();
  await run(sys);
  const attempt = sys.runs.attempts[0];
  sys.runs.complete(attempt.ref, { disposition: 'answer', value: 'observed before vacancy' });
  sys.occupancies.entries = {};
  const result = await run(sys, 'pf.beat.2');
  assert.equal(result.state, 'blocked');
  assert.equal(result.reason, 'no_occupancy');
  assert.equal(result.returned_count, 1);
  assert.equal(sys.runs.attempts[0].recorded, true);
  assert.equal(sys.cards.cards.get('pf.card.market-change').responses.length, 1);
});

test('stale response remains attributable but does not satisfy a new Card generation', async () => {
  const sys = system();
  await run(sys);
  const attempt = sys.runs.attempts[0];
  sys.cards.update('pf.card.market-change', { generation: 2, why: 'new evidence materially changed the question' });
  sys.runs.complete(attempt.ref, { disposition: 'answer', value: 'generation one answer', observed_generation: 1 });
  const result = await run(sys, 'pf.beat.2');
  assert.equal(result.returned[0].stale, true);
  assert.equal(sys.cards.cards.get('pf.card.market-change').condition, 'pending');
  assert.equal(sys.runs.attempts.length, 2, 'generation two receives a separate attempt');
});

test('same Card projects to LLM, human and client with one identity and generation', async () => {
  const projections = [];
  for (const species of ['llm', 'human', 'client']) {
    const sys = system({ species });
    await run(sys, `pf.beat.${species}`);
    projections.push(sys.cards.wakePacks[0].cards[0]);
  }
  assert.deepEqual(projections.map((projection) => projection.ref), Array(3).fill('pf.card.market-change'));
  assert.deepEqual(projections.map((projection) => projection.generation), [1, 1, 1]);
  assert.equal(new Set(projections.map((projection) => JSON.stringify(projection.presentation))).size, 3);
});

test('attention is not authority: unavailable affordance remains resolvable', async () => {
  const sys = system({ allowed: [] });
  await run(sys);
  const publish = sys.cards.wakePacks[0].cards[0].effective_affordances.find((affordance) => affordance.id === 'publish');
  assert.equal(publish.state, 'unavailable');
  assert.equal(publish.reason, 'authority_required');
  assert.equal(publish.next, 'request_authorization');
});

test('UNKNOWN and abstention are legal durable responses', async () => {
  const sys = system();
  await run(sys);
  sys.runs.complete(sys.runs.attempts[0].ref, { disposition: 'unknown', reason: 'sources contradict' });
  await run(sys, 'pf.beat.2');
  assert.equal(sys.cards.cards.get('pf.card.market-change').condition, 'unknown');
  assert.equal(sys.evidence.records[0].disposition, 'unknown');
});

test('controller evaporation loses no institutional state', async () => {
  const sys = system();
  await run(sys);
  const firstControllerResult = sys.runs.attempts[0].ref;
  const result = await reconcileAttention({
    scope: 'pf.office.research', beatRef: 'pf.beat.after-restart', now: new Date('2026-08-23T12:05:00Z'), ...sys,
  });
  assert.equal(result.observations[0].attempt_ref, firstControllerResult);
  assert.equal(sys.runs.attempts.length, 1);
});

test('Heartime-facing reconciliation summary carries references and counts, never Card or WakePack bodies', async () => {
  const sys = system();
  const result = await run(sys);
  assert.equal(result.wake_pack_ref, 'pf.wakepack.1');
  assert.equal('wake_pack' in result, false);
  assert.equal('cards' in result, false);
  assert.equal('payload' in result, false);
  assert.equal(validateReconciliationSummary(result), result);
  assert.throws(() => validateReconciliationSummary({ state: 'reconciled', nested: { response: {} } }), /forbidden field|must not carry/);
  assert.throws(() => validateReconciliationSummary({ state: 'surprising' }), /invalid reconciliation state/);
});

test('WakePack cannot introduce attention absent from current Cards state', async () => {
  const sys = system();
  const original = sys.cards.compileWakePack.bind(sys.cards);
  sys.cards.compileWakePack = async (input) => {
    const pack = await original(input);
    pack.cards.push({
      ref: 'pf.card.injected',
      generation: 1,
      scope: 'pf.office.research',
      response_contract: 'answer',
      obligation_ref: 'pf.card.injected@1',
    });
    return pack;
  };
  await assert.rejects(() => run(sys), /not present in current attention/);
});

test('WakePack cannot satisfy a current Card with a stale generation', async () => {
  const sys = system();
  const original = sys.cards.compileWakePack.bind(sys.cards);
  sys.cards.compileWakePack = async (input) => {
    const pack = await original(input);
    pack.cards[0].generation = 2;
    pack.cards[0].obligation_ref = 'pf.card.market-change@2';
    return pack;
  };
  await assert.rejects(() => run(sys), /generation mismatch/);
});

test('WakePack cannot duplicate one attention obligation', async () => {
  const sys = system();
  const original = sys.cards.compileWakePack.bind(sys.cards);
  sys.cards.compileWakePack = async (input) => {
    const pack = await original(input);
    pack.cards.push(structuredClone(pack.cards[0]));
    return pack;
  };
  await assert.rejects(() => run(sys), /duplicate CardRef/);
});

test('legacy attention-shaped objects cannot enter institutional circulation as Cards.listCurrent source', async () => {
  const sys = system();
  sys.cards.listCurrent = async () => [card()];
  await assert.rejects(() => run(sys), /must return sealed powerfarm\.card\.v1/);
});

test('WakePack projection must remain bound to the exact sealed source Card snapshot', async () => {
  const sys = system();
  const original = sys.cards.compileWakePack.bind(sys.cards);
  sys.cards.compileWakePack = async (input) => {
    const pack = await original(input);
    pack.cards[0].source_content_sha256 = `sha256:${'0'.repeat(64)}`;
    return pack;
  };
  await assert.rejects(() => run(sys), /source binding mismatch/);
});
