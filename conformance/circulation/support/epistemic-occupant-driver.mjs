import fs from 'node:fs';

import {
  EPISTEMIC_CLASS,
  buildEpistemicWakeContext,
  createClaim,
  createConflict,
  createObservation,
  createUncertainty,
  recordEpistemicRecords,
  scheduleEpistemicSample,
  transitionCard,
  unresolvedUncertainties,
  verifyCardSeal,
} from '../../../circulation/cards/lib/index.mjs';

const [mode, inputPath, outputPath] = process.argv.slice(2);
if (!['A', 'B'].includes(mode) || !inputPath || !outputPath) {
  console.error('usage: epistemic-occupant-driver.mjs A|B input.json output.json');
  process.exit(2);
}

let card = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!(await verifyCardSeal(card))) throw new Error('input Card seal mismatch');

if (mode === 'A') {
  const observation = await createObservation({
    statement: 'Supplier API reports shipment IN_TRANSIT',
    recordedAt: '2026-08-30T06:01:00.000Z',
    sourceRef: 'pf.source.supplier-api',
    evidenceRefs: ['pf.evidence.shipment-status-001'],
    freshUntil: '2026-08-30T06:04:00.000Z',
  });
  const claim = await createClaim({
    classification: EPISTEMIC_CLASS.INFERRED,
    statement: 'Shipment will remain in transit until noon',
    recordedAt: '2026-08-30T06:01:00.000Z',
    supports: [observation.ref],
    confidence: 0.65,
  });
  const uncertainty = await createUncertainty({
    question: 'Has customs clearance completed?',
    recordedAt: '2026-08-30T06:01:00.000Z',
  });
  card = await recordEpistemicRecords(card, {
    at: '2026-08-30T06:01:00.000Z',
    observations: [observation],
    claims: [claim],
    uncertainties: [uncertainty],
    reason: 'Occupant A recorded the world for a future occupant',
  });
  card = await scheduleEpistemicSample(card, {
    at: '2026-08-30T06:01:00.000Z',
    nextSample: '2026-08-30T06:04:00.000Z',
  });
  card = (await transitionCard(card, {
    to: 'deferred',
    at: '2026-08-30T06:02:00.000Z',
    nextExpected: '2026-08-30T08:00:00.000Z',
    nextSample: '2026-08-30T06:04:00.000Z',
    reason: 'Sleep until the world should be sampled again',
  })).card;
  fs.writeFileSync(outputPath, JSON.stringify(card, null, 2) + '\n');
  process.stdout.write(JSON.stringify({
    mode,
    card_ref: card.ref,
    revision: card.revision,
    observation_ref: observation.ref,
    claim_ref: claim.ref,
    uncertainty_ref: uncertainty.ref,
  }) + '\n');
} else {
  const wake = buildEpistemicWakeContext(card, { now: '2026-08-30T06:05:00.000Z' });
  const previousObservation = wake.observations.at(0);
  const previousClaim = wake.claims.at(0);
  const previousUnknown = wake.uncertainties.at(0);
  if (!previousObservation || !previousClaim || !previousUnknown) throw new Error('future occupant did not receive durable epistemic state');

  const observation = await createObservation({
    statement: 'Supplier API reports shipment DELIVERED',
    recordedAt: '2026-08-30T06:05:00.000Z',
    sourceRef: 'pf.source.supplier-api',
    evidenceRefs: ['pf.evidence.shipment-status-002'],
    freshUntil: '2026-08-30T09:00:00.000Z',
  });
  const resolution = await createClaim({
    classification: EPISTEMIC_CLASS.INFERRED,
    statement: 'Customs clearance necessarily completed before final delivery',
    recordedAt: '2026-08-30T06:05:00.000Z',
    supports: [observation.ref],
    resolves: [previousUnknown.ref],
    confidence: 0.99,
  });
  const conflict = await createConflict({
    statement: 'Observed delivery contradicts the earlier inference that the shipment would remain in transit until noon',
    recordedAt: '2026-08-30T06:05:00.000Z',
    recordRefs: [previousClaim.ref, observation.ref],
    evidenceRefs: ['pf.evidence.shipment-status-002'],
  });
  card = await recordEpistemicRecords(card, {
    at: '2026-08-30T06:05:00.000Z',
    observations: [observation],
    claims: [resolution],
    conflicts: [conflict],
    reason: 'Occupant B sampled the changed world from durable Card state only',
  });
  card = await scheduleEpistemicSample(card, {
    at: '2026-08-30T06:05:00.000Z',
    nextSample: '2026-08-30T09:00:00.000Z',
    reason: 'Verify delivery acceptance later',
  });
  const after = buildEpistemicWakeContext(card, { now: '2026-08-30T06:05:00.000Z' });
  fs.writeFileSync(outputPath, JSON.stringify(card, null, 2) + '\n');
  process.stdout.write(JSON.stringify({
    mode,
    card_ref: card.ref,
    revision: card.revision,
    inherited: {
      observation_ref: previousObservation.ref,
      observation_freshness: previousObservation.freshness,
      claim_ref: previousClaim.ref,
      claim_classification: previousClaim.classification,
      uncertainty_ref: previousUnknown.ref,
      uncertainty_status: previousUnknown.status,
    },
    new_observation_ref: observation.ref,
    resolution_ref: resolution.ref,
    conflict_ref: conflict.ref,
    unresolved_after: unresolvedUncertainties(card).map((record) => record.ref),
    next_sample: after.next_sample,
  }) + '\n');
}
