import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CARD_CONTRACT_VERSION,
  CARD_PATCH_CONTRACT_VERSION,
  applyCardPatch,
  assessCardCirculation,
  createCardV1,
  emitCard,
  makeCardPatch,
  makeCostAuthorization,
  makeEnergyAuthorization,
  transitionCard,
  validateCardV1,
  verifyCardSeal,
} from '../lib/index.mjs';

const T0 = '2026-08-30T01:00:00.000Z';
const T1 = '2026-08-30T01:01:00.000Z';
const T2 = '2026-08-30T01:02:00.000Z';
const T3 = '2026-08-30T01:03:00.000Z';
const T4 = '2026-08-30T01:04:00.000Z';
const T5 = '2026-08-30T01:05:00.000Z';
const T6 = '2026-08-30T01:06:00.000Z';
const T7 = '2026-08-30T01:07:00.000Z';

async function base(overrides = {}) {
  return createCardV1({
    ref: 'pf.card.hardening',
    scope: 'pf.office.operations',
    created_at: T0,
    institutional: {
      office_ref: 'pf.office.operations',
      occupancy_ref: 'pf.occupancy.agent-1',
      direction_ref: 'pf.direction.harden',
      authority_ref: 'authority:golden',
      run_ref: 'run:golden',
      ecs_sha256: 'a'.repeat(64),
    },
    energy: { authorization: makeEnergyAuthorization({ authorizationRef: 'pf.energy-authorization.test', limits: { beats: 8, model_tokens: 100000, tool_calls: 20, network_calls: 20, compute_ms: 600000, sandbox_ms: 600000, wall_ms: 900000, human_attention_ms: 600000 }, effectiveAt: T0 }) },
    cost: { authorization: makeCostAuthorization({ authorizationRef: 'pf.cost-authorization.test', currency: 'USD', mode: 'capped', ceilingMicros: 10000000, effectiveAt: T0 }) },
    circulation: {
      state: 'prepared',
      next_expected: T0,
      priority: 7,
    },
    attention: {
      why: 'hardening is due',
      response_contract: 'act',
    },
    ...overrides,
  });
}

test('Card v1 is content-addressed while generation remains semantic and revision tracks circulation', async () => {
  const card = await base();
  assert.equal(card.contract_version, CARD_CONTRACT_VERSION);
  assert.equal(card.generation, 1);
  assert.equal(card.revision, 1);
  assert.match(card.content_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(await verifyCardSeal(card), true);

  const emitted = await emitCard(card, {
    at: T0,
    beatRef: 'pf.beat.cards-1',
    nextExpected: T1,
  });
  assert.equal(emitted.card.generation, 1, 'Heartime must not create a new semantic Card generation');
  assert.equal(emitted.card.revision, 3, 'emission transition plus Heartime energy debit advance snapshot revision');
  assert.notEqual(emitted.card.content_sha256, card.content_sha256);
  assert.equal(await verifyCardSeal(emitted.card), true);
});

test('live Card requires next_expected, while blocked Card requires an explicit reason', async () => {
  await assert.rejects(
    () => createCardV1({
      ref: 'pf.card.no-clock',
      scope: 'pf.office.operations',
      created_at: T0,
      circulation: { state: 'prepared', next_expected: null },
    }),
    /must carry circulation\.next_expected/,
  );

  await assert.rejects(
    () => createCardV1({
      ref: 'pf.card.blocked',
      scope: 'pf.office.operations',
      created_at: T0,
      circulation: { state: 'blocked', next_expected: null },
    }),
    /must carry circulation\.blocked_reason/,
  );
});

test('CardPatch ownership is fail-closed across organs', async () => {
  const card = await base();
  assert.throws(() => makeCardPatch({
    card,
    organ: 'heartime',
    at: T1,
    set: { 'institutional.authority_ref': 'authority:forged' },
  }), /heartime does not own Card field institutional\.authority_ref/);

  assert.throws(() => makeCardPatch({
    card,
    organ: 'platform',
    at: T1,
    set: { 'circulation.state': 'terminal' },
  }), /platform does not own Card field circulation\.state/);

  const processPatch = makeCardPatch({
    card,
    organ: 'process',
    at: T1,
    set: { 'cost.authorization.ceiling_micros': 12_000_000 },
  });
  assert.equal(processPatch.contract_version, CARD_PATCH_CONTRACT_VERSION);
  const next = await applyCardPatch(card, processPatch);
  assert.equal(next.cost.authorization.ceiling_micros, 12_000_000);
});

test('stale CardPatch cannot overwrite a newer snapshot', async () => {
  const card = await base();
  const patch = makeCardPatch({
    card,
    organ: 'process',
    at: T1,
    set: { 'energy.authorization.limits.tool_calls': 3 },
  });
  const next = await applyCardPatch(card, patch);
  await assert.rejects(() => applyCardPatch(next, patch), /base revision 1 does not match Card revision 2/);
});

test('tampered content seal is rejected before mutation', async () => {
  const card = await base();
  const tampered = structuredClone(card);
  tampered.circulation.priority = 999;
  validateCardV1(tampered, { requireSeal: true });
  assert.equal(await verifyCardSeal(tampered), false);
  const patch = makeCardPatch({
    card: tampered,
    organ: 'process',
    at: T1,
    set: { 'energy.authorization.limits.tool_calls': 1 },
  });
  await assert.rejects(() => applyCardPatch(tampered, patch), /content seal mismatch/);
});

test('Heartime writes next_expected on emission and transition ids are deterministic content references', async () => {
  const card = await base();
  const first = await emitCard(card, { at: T0, beatRef: 'pf.beat.cards-1', nextExpected: T1 });
  const second = await emitCard(card, { at: T0, beatRef: 'pf.beat.cards-1', nextExpected: T1 });
  assert.equal(first.transition.transition_ref, second.transition.transition_ref);
  assert.equal(first.card.circulation.next_expected, T1);
  assert.equal(first.card.circulation.emitted_at, T0);
  assert.deepEqual(first.card.lineage.transition_refs, [first.transition.transition_ref]);
});

test('illegal lifecycle jumps fail closed', async () => {
  const card = await base();
  await assert.rejects(
    () => transitionCard(card, { to: 'executing', at: T1, attemptRef: 'pf.attempt.1', nextExpected: T2 }),
    /illegal Card circulation transition: prepared -> executing/,
  );
});

test('circulation gate distinguishes due, future, terminal, and orphaned Cards', async () => {
  const due = await base();
  assert.deepEqual(assessCardCirculation(due, { now: T0 }), { decision: 'CIRCULATE', reason: 'due' });

  const future = await base({ circulation: { state: 'prepared', next_expected: T2 } });
  assert.deepEqual(assessCardCirculation(future, { now: T0 }), { decision: 'DEFER', reason: 'not_due' });

  let emitted = (await emitCard(due, { at: T0, beatRef: 'pf.beat.cards-1', nextExpected: T1 })).card;
  emitted = (await transitionCard(emitted, { to: 'orphaned', at: T1, nextExpected: T2 })).card;
  assert.deepEqual(assessCardCirculation(emitted, { now: T1 }), { decision: 'RECONCILE', reason: 'orphaned' });
});

test('canonical Card v1 projects into the existing attention Card contract without changing semantic generation', async () => {
  const { normalizeCard } = await import('../../attention/lib/contract.mjs');
  const card = await base({
    attention: {
      why: 'the same Card can be projected into attention',
      response_contract: 'investigate',
      affordances: [{ id: 'inspect' }],
    },
    evidence: { refs: ['pf.evidence.card-v1'] },
  });
  const projected = normalizeCard(card, 'pf.office.operations');
  assert.equal(projected.ref, card.ref);
  assert.equal(projected.generation, 1);
  assert.equal(projected.response_contract, 'investigate');
  assert.deepEqual(projected.evidence_refs, ['pf.evidence.card-v1']);
});

test('ExecutionSlice is engine-neutral, sealed, and derives stable institutional run identity from Card circulation', async () => {
  const {
    deriveExecutionSlice,
    executionRefsFromSlice,
    verifyExecutionSliceSeal,
  } = await import('../lib/execution-slice.mjs');
  let card = await createCardV1({
    ref: 'pf.card.engine-equivalence',
    scope: 'pf.office.operations',
    created_at: T0,
    institutional: {
      identity_ref: 'pf.identity.agent-1',
      office_ref: 'pf.office.operations',
      occupancy_ref: 'pf.occupancy.agent-1',
      direction_ref: 'pf.direction.engine-equivalence',
      authority_ref: 'continuum:projected-at-admission',
      ecs_sha256: 'b'.repeat(64),
    },
    energy: { authorization: makeEnergyAuthorization({ authorizationRef: 'pf.energy-authorization.engine-equivalence', limits: { beats: 4, model_tokens: 100000, tool_calls: 20, network_calls: 20, compute_ms: 600000, sandbox_ms: 600000, wall_ms: 900000, human_attention_ms: 600000 }, effectiveAt: T0 }) },
    cost: { authorization: makeCostAuthorization({ authorizationRef: 'pf.cost-authorization.engine-equivalence', mode: 'capped', currency: 'USD', ceilingMicros: 10_000_000, effectiveAt: T0 }) },
    circulation: { state: 'prepared', next_expected: T0, priority: 10 },
  });
  card = (await emitCard(card, { at: T0, beatRef: 'pf.beat.engine-equivalence', nextExpected: T1 })).card;
  card = (await transitionCard(card, { to: 'acknowledged', at: T1, nextExpected: T2 })).card;
  card = (await transitionCard(card, {
    to: 'executing',
    at: T2,
    attemptRef: 'pf.attempt.engine-equivalence',
    nextExpected: '2026-08-30T01:03:00.000Z',
  })).card;

  const slice = await deriveExecutionSlice(card, {
    actor: 'agent-1',
    office: 'operations',
    toolName: 'search',
    kind: 'tool.invoke.search',
    subject: 'tool:search',
    evaluatedAt: T2,
  });
  assert.equal(await verifyExecutionSliceSeal(slice), true);
  assert.equal('runtime' in slice, false, 'engine identity must not be part of the institutional execution slice');
  const first = await executionRefsFromSlice(slice);
  const second = await executionRefsFromSlice(slice);
  assert.deepEqual(first, second);
  assert.match(first.runRef, /^pfx-[0-9a-f]{32}$/);
  assert.equal(slice.institutional.run_ref, first.runRef);
  assert.match(first.intentRequestId, /^pfx2-[0-9a-f]{64}-intent$/);
  assert.match(first.resumeRequestId, /^pfxr1-[0-9a-f]{64}$/);

  const successorSlice = structuredClone(slice);
  successorSlice.principal.actor = 'agent-2';
  delete successorSlice.slice_sha256;
  const { sealExecutionSlice } = await import('../lib/execution-slice.mjs');
  const successorSealed = await sealExecutionSlice(successorSlice);
  const successorRefs = await executionRefsFromSlice(successorSealed);
  assert.equal(successorRefs.runRef, first.runRef, 'occupant identity must not redefine the institutional run');
});


test('Heartime recovery preserves attempt identity across a new beat and Registry occupancy refresh', async () => {
  const {
    applyRegistryOccupancyObservation,
    assessOccupancy,
    beginReconciliation,
    deriveExecutionSlice,
    executionRefsFromSlice,
    orphanForOccupancy,
    reissueReconciledCard,
  } = await import('../lib/index.mjs');

  let card = await createCardV1({
    ref: 'pf.card.recovery', scope: 'pf.office.operations', created_at: T0,
    institutional: {
      identity_ref: 'pf.identity.agent-old', office_ref: 'pf.office.operations', occupancy_ref: 'pf.occupancy.agent-old',
      direction_ref: 'pf.direction.recovery', authority_ref: 'continuum:projected-at-admission', ecs_sha256: 'e'.repeat(64),
    },
    energy: { authorization: makeEnergyAuthorization({ authorizationRef: 'pf.energy-authorization.recovery', limits: { beats: 4, model_tokens: 100000, tool_calls: 20, network_calls: 20, compute_ms: 600000, sandbox_ms: 600000, wall_ms: 900000, human_attention_ms: 600000 }, effectiveAt: T0 }) },
    cost: { authorization: makeCostAuthorization({ authorizationRef: 'pf.cost-authorization.recovery', mode: 'capped', currency: 'USD', ceilingMicros: 10_000_000, effectiveAt: T0 }) },
    circulation: { state: 'prepared', next_expected: T0, priority: 9 },
  });
  card = (await emitCard(card, { at: T0, beatRef: 'pf.beat.recovery-1', nextExpected: T1 })).card;
  card = (await transitionCard(card, { to: 'acknowledged', at: T1, nextExpected: T2 })).card;
  card = (await transitionCard(card, { to: 'executing', at: T2, attemptRef: 'pf.attempt.recovery', nextExpected: T3 })).card;
  const firstSlice = await deriveExecutionSlice(card, { actor: 'agent-old', office: 'operations', toolName: 'search', kind: 'tool.invoke.search', subject: 'tool:search', evaluatedAt: T2 });
  const firstRefs = await executionRefsFromSlice(firstSlice);

  const observation = { office_ref: 'pf.office.operations', identity_ref: 'pf.identity.agent-new', occupancy_ref: 'pf.occupancy.agent-new' };
  assert.equal(assessOccupancy(card, observation).status, 'STALE');
  const orphaned = await orphanForOccupancy(card, { at: T3, nextExpected: T4, observation });
  card = orphaned.card;
  assert.equal(card.circulation.state, 'orphaned');
  assert.match(card.circulation.reconciliation_ref, /^pf\.reconciliation\.[0-9a-f]{32}$/);
  card = (await beginReconciliation(card, { at: T4, nextExpected: T5 })).card;
  card = await applyRegistryOccupancyObservation(card, { at: T4, observation });
  const reissued = await reissueReconciledCard(card, { at: T5, beatRef: 'pf.beat.recovery-2', nextExpected: T6 });
  card = reissued.card;
  assert.equal(card.circulation.retry_count, 1);
  assert.equal(card.circulation.attempt_ref, 'pf.attempt.recovery');
  assert.equal(card.circulation.beat_ref, 'pf.beat.recovery-2');
  card = (await transitionCard(card, { to: 'acknowledged', at: T6, nextExpected: T7 })).card;
  card = (await transitionCard(card, { to: 'executing', at: T7, nextExpected: '2026-08-30T01:08:00.000Z' })).card;
  const successorSlice = await deriveExecutionSlice(card, { actor: 'agent-new', office: 'operations', toolName: 'search', kind: 'tool.invoke.search', subject: 'tool:search', evaluatedAt: T7 });
  const successorRefs = await executionRefsFromSlice(successorSlice);
  assert.equal(successorRefs.runRef, firstRefs.runRef, 'new Heartime beat must not redefine the institutional attempt');
  assert.notEqual(successorRefs.resumeRequestId, firstRefs.resumeRequestId, 'each reissue beat gets a distinct resume admission id');
});
