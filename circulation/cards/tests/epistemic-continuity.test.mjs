import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EPISTEMIC_CLASS,
  assessCardCirculation,
  buildEpistemicWakeContext,
  createCardV1,
  createClaim,
  createConflict,
  createObservation,
  createUncertainty,
  makeCardPatch,
  makeCostAuthorization,
  makeEnergyAuthorization,
  recordEpistemicRecords,
  scheduleEpistemicSample,
  transitionCard,
  unresolvedUncertainties,
  verifyCardSeal,
} from '../lib/index.mjs';

const T0 = '2026-08-30T06:00:00.000Z';
const T1 = '2026-08-30T06:01:00.000Z';
const T2 = '2026-08-30T06:02:00.000Z';
const T3 = '2026-08-30T06:03:00.000Z';
const T4 = '2026-08-30T06:04:00.000Z';
const T5 = '2026-08-30T06:05:00.000Z';
const T7 = '2026-08-30T06:07:00.000Z';

async function base() {
  return createCardV1({
    ref: 'pf.card.epistemic',
    scope: 'pf.office.operations',
    created_at: T0,
    institutional: { office_ref: 'pf.office.operations' },
    energy: { authorization: makeEnergyAuthorization({ authorizationRef: 'pf.energy-authorization.test', limits: { beats: 8, model_tokens: 100000, tool_calls: 20, network_calls: 20, compute_ms: 600000, sandbox_ms: 600000, wall_ms: 900000, human_attention_ms: 600000 }, effectiveAt: T0 }) },
    cost: { authorization: makeCostAuthorization({ authorizationRef: 'pf.cost-authorization.test', currency: 'USD', mode: 'capped', ceilingMicros: 10000000, effectiveAt: T0 }) },
    circulation: { state: 'prepared', next_expected: T7, priority: 5 },
  });
}

test('epistemic records preserve the distinction between observation, inference, assumption, report, unknown, and contradiction', async () => {
  const observed = await createObservation({
    statement: 'Supplier API reports shipment IN_TRANSIT', recordedAt: T1, sourceRef: 'pf.source.supplier-api',
    evidenceRefs: ['pf.evidence.supplier-1'], freshUntil: T4,
  });
  const inferred = await createClaim({
    classification: EPISTEMIC_CLASS.INFERRED, statement: 'Shipment will remain in transit until noon', recordedAt: T1,
    supports: [observed.ref], confidence: 0.65,
  });
  const assumed = await createClaim({
    classification: EPISTEMIC_CLASS.ASSUMED, statement: 'Carrier scan cadence remains normal', recordedAt: T1,
  });
  const reported = await createClaim({
    classification: EPISTEMIC_CLASS.REPORTED, statement: 'Carrier support says customs review is pending', recordedAt: T1,
    sourceRef: 'pf.source.carrier-support', evidenceRefs: ['pf.evidence.support-call-1'],
  });
  const unknown = await createUncertainty({ question: 'Has customs clearance completed?', recordedAt: T1 });
  const contradicted = await createConflict({
    statement: 'Delivery evidence contradicts the earlier in-transit inference', recordedAt: T2,
    recordRefs: [observed.ref, inferred.ref], evidenceRefs: ['pf.evidence.delivery-1'],
  });

  assert.equal(observed.classification, 'OBSERVED');
  assert.equal(inferred.classification, 'INFERRED');
  assert.equal(assumed.classification, 'ASSUMED');
  assert.equal(reported.classification, 'REPORTED');
  assert.equal(unknown.classification, 'UNKNOWN');
  assert.equal(contradicted.classification, 'CONTRADICTED');
  for (const record of [observed, inferred, assumed, reported, unknown, contradicted]) {
    assert.match(record.ref, /^pf\.epistemic\.[a-f0-9]{32}$/);
  }
});

test('OBSERVED and REPORTED records fail closed without durable evidence, and INFERRED records must cite their support', async () => {
  await assert.rejects(() => createObservation({
    statement: 'unsafe observation', recordedAt: T1, sourceRef: 'pf.source.world', evidenceRefs: [],
  }), /at least 1 reference/);
  await assert.rejects(() => createClaim({
    classification: EPISTEMIC_CLASS.INFERRED, statement: 'unsupported inference', recordedAt: T1,
  }), /must cite at least one supporting/);
  await assert.rejects(() => createClaim({
    classification: EPISTEMIC_CLASS.REPORTED, statement: 'anonymous report', recordedAt: T1,
    sourceRef: 'pf.source.reporter', evidenceRefs: [],
  }), /at least 1 reference/);
});

test('Memory owns durable epistemic records while Heartime alone owns next_sample', async () => {
  const card = await base();
  assert.throws(() => makeCardPatch({
    card, organ: 'heartime', at: T1,
    append: { 'epistemic.observations': [{ forged: true }] },
  }), /heartime does not own Card field epistemic\.observations/);
  assert.throws(() => makeCardPatch({
    card, organ: 'memory', at: T1,
    set: { 'epistemic.next_sample': T2 },
  }), /memory does not own Card field epistemic\.next_sample/);
});

test('Memory records evidence-backed world state without turning inference into observation', async () => {
  let card = await base();
  const observation = await createObservation({
    statement: 'Warehouse sensor reports door CLOSED', recordedAt: T1, sourceRef: 'pf.source.warehouse-sensor',
    evidenceRefs: ['pf.evidence.sensor-1'], freshUntil: T4,
  });
  const claim = await createClaim({
    classification: EPISTEMIC_CLASS.INFERRED, statement: 'No loading activity is currently visible', recordedAt: T1,
    supports: [observation.ref], confidence: 0.8,
  });
  const uncertainty = await createUncertainty({ question: 'Is a truck scheduled but not yet present?', recordedAt: T1 });
  card = await recordEpistemicRecords(card, { at: T1, observations: [observation], claims: [claim], uncertainties: [uncertainty] });
  assert.equal(await verifyCardSeal(card), true);
  assert.equal(card.epistemic.observations[0].classification, 'OBSERVED');
  assert.equal(card.epistemic.claims[0].classification, 'INFERRED');
  assert.equal(card.epistemic.uncertainties[0].classification, 'UNKNOWN');
  assert.deepEqual(card.evidence.refs, ['pf.evidence.sensor-1']);
  assert.deepEqual(card.epistemic.evidence_refs, ['pf.evidence.sensor-1']);
});

test('Heartime epistemic sampling can wake a Card before its ordinary next_expected', async () => {
  let card = await base();
  card = await scheduleEpistemicSample(card, { at: T1, nextSample: T2 });
  const assessment = assessCardCirculation(card, { now: T3 });
  assert.equal(assessment.decision, 'CIRCULATE');
  assert.equal(assessment.reason, 'epistemic_sample_due');
  assert.equal(assessment.epistemic.next_sample_due, true);
});

test('Heartime also wakes when a durable observation has become stale', async () => {
  let card = await base();
  const observation = await createObservation({
    statement: 'Inventory count is 12', recordedAt: T1, sourceRef: 'pf.source.inventory',
    evidenceRefs: ['pf.evidence.inventory-1'], freshUntil: T2,
  });
  card = await recordEpistemicRecords(card, { at: T1, observations: [observation] });
  const assessment = assessCardCirculation(card, { now: T3 });
  assert.equal(assessment.decision, 'CIRCULATE');
  assert.equal(assessment.reason, 'epistemic_stale');
  assert.deepEqual(assessment.epistemic.stale_observation_refs, [observation.ref]);
});

test('a Card cannot be deferred with unresolved uncertainty unless Heartime leaves a sampling condition', async () => {
  let card = await base();
  const uncertainty = await createUncertainty({ question: 'Did the bank settle the transfer?', recordedAt: T1 });
  card = await recordEpistemicRecords(card, { at: T1, uncertainties: [uncertainty] });
  await assert.rejects(() => transitionCard(card, { to: 'deferred', at: T2, nextExpected: T7 }), /requires epistemic\.next_sample/);
  const deferred = await transitionCard(card, { to: 'deferred', at: T2, nextExpected: T7, nextSample: T4 });
  assert.equal(deferred.card.epistemic.next_sample, T4);
});

test('wake context reconstructs stale observations, inference, contradiction, and unresolved uncertainty without private model state', async () => {
  let card = await base();
  const observation = await createObservation({
    statement: 'Shipment is IN_TRANSIT', recordedAt: T1, sourceRef: 'pf.source.supplier-api',
    evidenceRefs: ['pf.evidence.shipment-1'], freshUntil: T2,
  });
  const claim = await createClaim({
    classification: EPISTEMIC_CLASS.INFERRED, statement: 'Shipment likely remains in transit', recordedAt: T1,
    supports: [observation.ref], confidence: 0.6,
  });
  const uncertainty = await createUncertainty({ question: 'Has customs cleared?', recordedAt: T1 });
  const conflict = await createConflict({
    statement: 'A later source contradicts the in-transit view', recordedAt: T2,
    recordRefs: [observation.ref, claim.ref], evidenceRefs: ['pf.evidence.conflict-1'],
  });
  card = await recordEpistemicRecords(card, { at: T2, observations: [observation], claims: [claim], uncertainties: [uncertainty], conflicts: [conflict] });
  card = await scheduleEpistemicSample(card, { at: T2, nextSample: T4 });
  const durable = JSON.parse(JSON.stringify(card));
  const context = buildEpistemicWakeContext(durable, { now: T5 });
  assert.equal(context.observations[0].freshness, 'STALE');
  assert.equal(context.claims[0].classification, 'INFERRED');
  assert.equal(context.uncertainties[0].status, 'UNRESOLVED');
  assert.equal(context.conflicts[0].classification, 'CONTRADICTED');
  assert.equal(context.next_sample, T4);
});

test('a later evidence-backed claim can resolve an earlier UNKNOWN while preserving its lineage', async () => {
  let card = await base();
  const uncertainty = await createUncertainty({ question: 'Has customs cleared?', recordedAt: T1 });
  card = await recordEpistemicRecords(card, { at: T1, uncertainties: [uncertainty] });
  assert.deepEqual(unresolvedUncertainties(card).map((item) => item.ref), [uncertainty.ref]);
  const observation = await createObservation({
    statement: 'Carrier API reports DELIVERED', recordedAt: T2, sourceRef: 'pf.source.carrier-api',
    evidenceRefs: ['pf.evidence.delivery-2'], freshUntil: T7,
  });
  const resolution = await createClaim({
    classification: EPISTEMIC_CLASS.INFERRED,
    statement: 'Customs clearance necessarily completed before final delivery',
    recordedAt: T2,
    supports: [observation.ref], resolves: [uncertainty.ref], confidence: 0.99,
  });
  card = await recordEpistemicRecords(card, { at: T2, observations: [observation], claims: [resolution] });
  assert.deepEqual(unresolvedUncertainties(card), []);
  const context = buildEpistemicWakeContext(card, { now: T3 });
  assert.equal(context.uncertainties[0].status, 'RESOLVED');
  assert.equal(card.epistemic.uncertainties[0].ref, uncertainty.ref, 'UNKNOWN remains durable rather than being rewritten away');
});

test('epistemic record refs are content-addressed and tampering cannot be resealed through CardPatch', async () => {
  let card = await base();
  const observation = await createObservation({
    statement: 'Temperature is 4C', recordedAt: T1, sourceRef: 'pf.source.thermometer',
    evidenceRefs: ['pf.evidence.temperature-1'], freshUntil: T4,
  });
  card = await recordEpistemicRecords(card, { at: T1, observations: [observation] });
  const tampered = structuredClone(card);
  tampered.epistemic.observations[0].statement = 'Temperature is 40C';
  delete tampered.content_sha256;
  const { sealCard } = await import('../lib/index.mjs');
  await assert.rejects(() => sealCard(tampered), /content-addressed ref does not match its body/);
});
