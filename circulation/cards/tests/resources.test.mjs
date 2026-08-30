import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCardPatch,
  applyResourceHealthProjection,
  assessCardCirculation,
  assessResourceState,
  createCardV1,
  createResourceObservation,
  deriveExecutionSlice,
  emitCard,
  makeCardPatch,
  makeCostAuthorization,
  makeEnergyAuthorization,
  projectResourceHealth,
  recordResourceObservation,
  transitionCard,
  verifyResourceObservationSeal,
} from '../lib/index.mjs';

const T0 = '2026-08-30T07:00:00.000Z';
const T1 = '2026-08-30T07:01:00.000Z';
const T2 = '2026-08-30T07:02:00.000Z';
const T3 = '2026-08-30T07:03:00.000Z';
const T4 = '2026-08-30T07:04:00.000Z';

function energy(beats = 3, overrides = {}) {
  return makeEnergyAuthorization({
    authorizationRef: 'pf.energy-authorization.resource-tests',
    effectiveAt: T0,
    limits: {
      beats,
      model_tokens: 10_000,
      tool_calls: 3,
      network_calls: 5,
      compute_ms: 30_000,
      sandbox_ms: 30_000,
      wall_ms: 60_000,
      human_attention_ms: 10_000,
      ...overrides,
    },
  });
}

function cost(ceilingMicros = 1_000_000, mode = 'capped') {
  return makeCostAuthorization({
    authorizationRef: 'pf.cost-authorization.resource-tests',
    currency: 'USD',
    mode,
    ceilingMicros,
    effectiveAt: T0,
  });
}

async function base({ beats = 3, costAuth = cost(), energyOverrides = {} } = {}) {
  return createCardV1({
    ref: 'pf.card.resources',
    scope: 'pf.office.operations',
    created_at: T0,
    institutional: {
      identity_ref: 'pf.identity.agent-1', office_ref: 'pf.office.operations', occupancy_ref: 'pf.occupancy.agent-1',
      direction_ref: 'pf.direction.resources', authority_ref: 'continuum:projected-at-admission', ecs_sha256: 'f'.repeat(64),
    },
    energy: { authorization: energy(beats, energyOverrides) },
    cost: { authorization: costAuth },
    circulation: { state: 'prepared', next_expected: T0, priority: 8 },
  });
}

async function executingCard(options = {}) {
  let card = await base(options);
  card = (await emitCard(card, { at: T0, beatRef: 'pf.beat.resources-1', nextExpected: T1 })).card;
  card = (await transitionCard(card, { to: 'acknowledged', at: T1, nextExpected: T2 })).card;
  card = (await transitionCard(card, { to: 'executing', at: T2, attemptRef: 'pf.attempt.resources-1', nextExpected: T3 })).card;
  return card;
}

test('Heartime refuses circulation without explicit Process energy and cost authorization', async () => {
  const card = await createCardV1({
    ref: 'pf.card.resources-unauthorized', scope: 'pf.office.operations', created_at: T0,
    circulation: { state: 'prepared', next_expected: T0, priority: 1 },
  });
  assert.deepEqual(assessCardCirculation(card, { now: T0 }).decision, 'BLOCK');
  assert.equal(assessCardCirculation(card, { now: T0 }).reason, 'energy_unauthorized');

  const onlyEnergy = await createCardV1({
    ref: 'pf.card.resources-no-cost', scope: 'pf.office.operations', created_at: T0,
    energy: { authorization: energy() },
    circulation: { state: 'prepared', next_expected: T0, priority: 1 },
  });
  assert.equal(assessCardCirculation(onlyEnergy, { now: T0 }).reason, 'cost_unauthorized');
});

test('Process owns authorization while Heartime owns admitted consumption', async () => {
  const card = await base();
  assert.throws(() => makeCardPatch({
    card, organ: 'heartime', at: T1, set: { 'energy.authorization.limits.beats': 999 },
  }), /heartime does not own Card field energy\.authorization/);
  assert.throws(() => makeCardPatch({
    card, organ: 'platform', at: T1, set: { 'cost.consumption.spent_micros': 1 },
  }), /platform does not own Card field cost\.consumption/);
});

test('every Heartime emission debits one content-addressed beat and duplicate observations are idempotent', async () => {
  const card = await base({ beats: 2 });
  const emitted = await emitCard(card, { at: T0, beatRef: 'pf.beat.resources-1', nextExpected: T1 });
  assert.equal(emitted.card.energy.consumption.totals.beats, 1);
  assert.match(emitted.resource_observation.ref, /^pf\.resource-observation\.[a-f0-9]{32}$/);
  assert.equal(await verifyResourceObservationSeal(emitted.resource_observation), true);
  assert.deepEqual(emitted.card.energy.consumption.observation_refs, [emitted.resource_observation.ref]);

  const duplicate = await recordResourceObservation(emitted.card, emitted.resource_observation);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.card.revision, emitted.card.revision);
  assert.equal(duplicate.card.energy.consumption.totals.beats, 1);
});

test('Platform metering is evidence-backed and Heartime aggregates energy and monetary cost exactly once', async () => {
  const card = await executingCard();
  await assert.rejects(() => createResourceObservation({
    cardRef: card.ref, attemptRef: card.circulation.attempt_ref, beatRef: card.circulation.beat_ref,
    observedAt: T3, sourceOrgan: 'platform', runtime: 'vercel-ai-sdk', energyDelta: { tool_calls: 1 }, costMicros: 2500,
  }), /requires durable metering evidence/);

  const observation = await createResourceObservation({
    cardRef: card.ref,
    attemptRef: card.circulation.attempt_ref,
    beatRef: card.circulation.beat_ref,
    observedAt: T3,
    sourceOrgan: 'platform',
    runtime: 'vercel-ai-sdk',
    revisionRef: 'ai@7.0.84',
    energyDelta: { model_tokens: 1200, tool_calls: 1, network_calls: 1, compute_ms: 40, wall_ms: 55 },
    currency: 'USD',
    costMicros: 4200,
    evidenceRefs: ['pf.evidence.metering-receipt-1'],
  });
  const recorded = await recordResourceObservation(card, observation);
  assert.equal(recorded.duplicate, false);
  assert.equal(recorded.card.energy.consumption.totals.model_tokens, 1200);
  assert.equal(recorded.card.energy.consumption.totals.tool_calls, 1);
  assert.equal(recorded.card.cost.consumption.spent_micros, 4200);
  assert.equal(recorded.resource_state.blocked, false);
});

test('truthful overdraw is recorded but no further executable slice can be issued', async () => {
  const card = await executingCard({ energyOverrides: { tool_calls: 1 } });
  const observation = await createResourceObservation({
    cardRef: card.ref, attemptRef: card.circulation.attempt_ref, beatRef: card.circulation.beat_ref,
    observedAt: T3, sourceOrgan: 'platform', runtime: 'vercel-ai-sdk', revisionRef: 'ai@7.0.84',
    energyDelta: { tool_calls: 2 }, currency: 'USD', costMicros: 1000, evidenceRefs: ['pf.evidence.overdraw-metering'],
  });
  const recorded = await recordResourceObservation(card, observation);
  assert.equal(recorded.resource_state.blocked, true);
  assert.equal(recorded.resource_state.reason, 'energy_overdrawn:tool_calls');
  await assert.rejects(() => deriveExecutionSlice(recorded.card, {
    actor: 'agent-1', office: 'operations', toolName: 'search', kind: 'tool.invoke.search', subject: 'tool:search',
  }), /resource budget is not executable: energy_overdrawn:tool_calls/);
});

test('zero-cost authorization permits free work but positive observed spend becomes an overdraw', async () => {
  const card = await executingCard({ costAuth: cost(0, 'zero-cost') });
  const observation = await createResourceObservation({
    cardRef: card.ref, attemptRef: card.circulation.attempt_ref, beatRef: card.circulation.beat_ref,
    observedAt: T3, sourceOrgan: 'platform', runtime: 'vercel-ai-sdk',
    energyDelta: { tool_calls: 1 }, currency: 'USD', costMicros: 1, evidenceRefs: ['pf.evidence.unexpected-cost'],
  });
  const recorded = await recordResourceObservation(card, observation);
  assert.equal(recorded.resource_state.reason, 'cost_overdrawn');
});

test('Homeostasis projects pressure and circulatory debt without owning authorization or consumption', async () => {
  let card = await executingCard({ costAuth: cost(10_000) });
  const observation = await createResourceObservation({
    cardRef: card.ref, attemptRef: card.circulation.attempt_ref, beatRef: card.circulation.beat_ref,
    observedAt: T3, sourceOrgan: 'platform', runtime: 'vercel-ai-sdk',
    energyDelta: { tool_calls: 1 }, currency: 'USD', costMicros: 9000, evidenceRefs: ['pf.evidence.metering-90pct'],
  });
  card = (await recordResourceObservation(card, observation)).card;
  const projection = projectResourceHealth(card, { now: T3 });
  assert.equal(projection.pressure, 'CRITICAL');
  assert.equal(projection.cost_utilization_bps, 9000);
  assert.equal(projection.circulatory_debt, true, 'metering evidence is not work evidence');

  card = await applyCardPatch(card, makeCardPatch({
    card, organ: 'memory', at: T4, reason: 'durable work evidence', append: { 'evidence.refs': ['pf.evidence.work-progress-1'] },
  }));
  const applied = await applyResourceHealthProjection(card, { at: T4 });
  assert.equal(applied.projection.circulatory_debt, false);
  assert.equal(applied.projection.cost_per_evidence_micros, 9000);
  assert.equal(applied.card.health.resources.contract_version, 'powerfarm.resource-health.v1');
});
