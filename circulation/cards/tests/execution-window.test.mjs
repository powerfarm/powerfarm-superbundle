import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertExecutionSliceTemporallyExecutable,
  createCardV1,
  deriveExecutionSlice,
  emitCard,
  makeCostAuthorization,
  makeEnergyAuthorization,
  sealExecutionSlice,
  transitionCard,
  verifyExecutionSliceSeal,
} from '../lib/index.mjs';

// Authorization is granted at T0 and expires at EXPIRY. The Card stops being
// updated at T2, well inside the window. Everything after EXPIRY is outside it.
const T0 = '2026-08-30T09:00:00.000Z';
const T1 = '2026-08-30T09:01:00.000Z';
const T2 = '2026-08-30T09:02:00.000Z';
const T3 = '2026-08-30T09:03:00.000Z';
const EXPIRY = '2026-08-30T09:10:00.000Z';
const AFTER_EXPIRY = '2026-08-30T09:10:00.001Z';

const LIMITS = {
  beats: 5,
  model_tokens: 100_000,
  tool_calls: 20,
  network_calls: 20,
  compute_ms: 600_000,
  sandbox_ms: 600_000,
  wall_ms: 900_000,
  human_attention_ms: 600_000,
};

async function expiringCard({ energyExpiresAt = EXPIRY, costExpiresAt = EXPIRY } = {}) {
  let card = await createCardV1({
    ref: 'pf.card.execution-window',
    scope: 'pf.office.operations',
    created_at: T0,
    institutional: {
      identity_ref: 'pf.identity.agent-1',
      office_ref: 'pf.office.operations',
      occupancy_ref: 'pf.occupancy.agent-1',
      direction_ref: 'pf.direction.execution-window',
      authority_ref: 'continuum:projected-at-admission',
      ecs_sha256: 'a'.repeat(64),
    },
    energy: {
      authorization: makeEnergyAuthorization({
        authorizationRef: 'pf.energy-authorization.execution-window',
        limits: LIMITS,
        effectiveAt: T0,
        expiresAt: energyExpiresAt,
      }),
    },
    cost: {
      authorization: makeCostAuthorization({
        authorizationRef: 'pf.cost-authorization.execution-window',
        mode: 'capped',
        currency: 'USD',
        ceilingMicros: 10_000_000,
        effectiveAt: T0,
        expiresAt: costExpiresAt,
      }),
    },
    circulation: { state: 'prepared', next_expected: T0, priority: 5 },
  });
  card = (await emitCard(card, { at: T0, beatRef: 'pf.beat.execution-window', nextExpected: T1 })).card;
  card = (await transitionCard(card, { to: 'acknowledged', at: T1, nextExpected: T2 })).card;
  card = (await transitionCard(card, {
    to: 'executing', at: T2, attemptRef: 'pf.attempt.execution-window', nextExpected: T3,
  })).card;
  return card;
}

const principal = {
  actor: 'agent-1',
  office: 'operations',
  toolName: 'search',
  kind: 'tool.invoke.search',
  subject: 'tool:search',
};

test('B04 regression: a Card last updated inside the window cannot yield a slice after authorization expiry', async () => {
  const card = await expiringCard();

  // The historical Card update time is inside the window. Deriving at
  // Card.updated_at is exactly the pre-v4 behaviour and would have succeeded.
  assert.ok(Date.parse(card.updated_at) < Date.parse(EXPIRY));
  const insideWindow = await deriveExecutionSlice(card, { ...principal, evaluatedAt: card.updated_at });
  assert.equal(insideWindow.resources.evaluated_at, card.updated_at);

  // The real boundary instant is after expiry, so no slice may be issued.
  await assert.rejects(
    () => deriveExecutionSlice(card, { ...principal, evaluatedAt: AFTER_EXPIRY }),
    /resource budget is not executable: energy_authorization_expired/,
  );
});

test('an expiring cost authorization blocks slice derivation even when energy is still authorized', async () => {
  const card = await expiringCard({ energyExpiresAt: null });
  await assert.rejects(
    () => deriveExecutionSlice(card, { ...principal, evaluatedAt: AFTER_EXPIRY }),
    /resource budget is not executable: cost_authorization_expired/,
  );
});

test('expires_at is an exclusive upper boundary at derivation', async () => {
  const card = await expiringCard();
  const justBefore = new Date(Date.parse(EXPIRY) - 1).toISOString();
  const slice = await deriveExecutionSlice(card, { ...principal, evaluatedAt: justBefore });
  assert.equal(slice.resources.evaluated_at, justBefore);
  await assert.rejects(
    () => deriveExecutionSlice(card, { ...principal, evaluatedAt: EXPIRY }),
    /resource budget is not executable: energy_authorization_expired/,
  );
});

test('a slice derived while authorization was valid cannot execute after expiry', async () => {
  const card = await expiringCard();
  const slice = await deriveExecutionSlice(card, { ...principal, evaluatedAt: T3 });

  // Still executable inside the window.
  assertExecutionSliceTemporallyExecutable(slice, { now: '2026-08-30T09:09:59.999Z' });

  assert.throws(
    () => assertExecutionSliceTemporallyExecutable(slice, { now: AFTER_EXPIRY }),
    /energy authorization expired before execution/,
  );
});

test('expires_at is an exclusive upper boundary at the execution boundary', async () => {
  const card = await expiringCard();
  const slice = await deriveExecutionSlice(card, { ...principal, evaluatedAt: T3 });
  assert.throws(
    () => assertExecutionSliceTemporallyExecutable(slice, { now: EXPIRY }),
    /energy authorization expired before execution/,
  );
});

test('a cost window that expires before the energy window still stops execution', async () => {
  const card = await expiringCard({ energyExpiresAt: null });
  const slice = await deriveExecutionSlice(card, { ...principal, evaluatedAt: T3 });
  assert.equal(slice.resources.authorization_window.energy.expires_at, null);
  assert.throws(
    () => assertExecutionSliceTemporallyExecutable(slice, { now: AFTER_EXPIRY }),
    /cost authorization expired before execution/,
  );
});

test('a rewound execution clock cannot precede the sealed evaluation instant', async () => {
  const card = await expiringCard();
  const slice = await deriveExecutionSlice(card, { ...principal, evaluatedAt: T3 });
  assert.throws(
    () => assertExecutionSliceTemporallyExecutable(slice, { now: T2 }),
    /resource budget was evaluated after execution time/,
  );
});

test('occupant identity cannot be re-sealed into a wider resource window', async () => {
  const card = await expiringCard();
  const slice = await deriveExecutionSlice(card, { ...principal, evaluatedAt: T3 });

  // A successor occupant may take over the same institutional run, but taking
  // over does not re-authorize anything: the window travels with the slice.
  const successor = structuredClone(slice);
  successor.principal.actor = 'agent-2';
  delete successor.slice_sha256;
  const resealed = await sealExecutionSlice(successor);
  assert.throws(
    () => assertExecutionSliceTemporallyExecutable(resealed, { now: AFTER_EXPIRY }),
    /energy authorization expired before execution/,
  );

});

test('a hand-widened resource window is caught by the seal, not by the temporal check alone', async () => {
  const card = await expiringCard();
  const slice = await deriveExecutionSlice(card, { ...principal, evaluatedAt: T3 });

  const tampered = structuredClone(slice);
  tampered.resources.authorization_window.energy.expires_at = '2099-01-01T00:00:00.000Z';
  tampered.resources.authorization_window.cost.expires_at = '2099-01-01T00:00:00.000Z';

  // Stated honestly: assertExecutionSliceTemporallyExecutable trusts the sealed
  // window it is handed. On its own it accepts the widened window.
  assertExecutionSliceTemporallyExecutable(tampered, { now: AFTER_EXPIRY });

  // The seal is what makes the window unforgeable, so every engine Setting must
  // verify the seal before it revalidates the window.
  assert.equal(await verifyExecutionSliceSeal(tampered), false);
  assert.equal(await verifyExecutionSliceSeal(slice), true);
});
