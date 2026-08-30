import test from 'node:test';
import assert from 'node:assert/strict';
import { planRosterReconciliation, reconcileRoster, validateDesiredRoster } from '../lib/reconcile.mjs';

const desired = {
  schemaVersion: 2,
  organs: [
    { id: 'pf.organ.registry', kind: 'service', title: 'Registry', freshness_minutes: 15 },
    { id: 'pf.organ.memory', kind: 'service', title: 'Memory', freshness_minutes: 60 },
  ],
};

test('desired roster is validated and duplicate identity is rejected', () => {
  assert.equal(validateDesiredRoster(desired), desired);
  assert.throws(() => validateDesiredRoster({ schemaVersion: 2, organs: [desired.organs[0], desired.organs[0]] }), /duplicate/);
});

test('planner creates, updates and retires without deleting lineage', () => {
  const plan = planRosterReconciliation(desired, [
    { id: 'pf.organ.registry', kind: 'service', title: 'Old Registry', freshness_minutes: 30, status: 'active' },
    { id: 'pf.organ.ghost', kind: 'service', title: 'Ghost', freshness_minutes: 15, status: 'active' },
  ]);
  assert.deepEqual(plan.actions.map((a) => [a.type, a.id]), [
    ['retire', 'pf.organ.ghost'],
    ['update', 'pf.organ.registry'],
    ['create', 'pf.organ.memory'],
  ]);
  assert.equal(plan.actions.some((a) => a.type === 'delete'), false);
});

test('planner is level-triggered and converges from current state', () => {
  const observed = desired.organs.map((organ) => ({ ...organ, status: 'active' }));
  assert.deepEqual(planRosterReconciliation(desired, observed).actions, []);
});

test('reconciliation requires attributed identity and records evidence', async () => {
  const calls = [];
  const writer = {
    create: async (organ, meta) => calls.push(['create', organ.id, meta.actorIdentityRef]),
    update: async (id, organ, meta) => calls.push(['update', id, meta.actorIdentityRef]),
    retire: async (id, meta) => calls.push(['retire', id, meta.actorIdentityRef]),
  };
  await assert.rejects(() => reconcileRoster({ desiredDocument: desired, observedOrgans: [], writer }), /actorIdentityRef/);
  const result = await reconcileRoster({
    desiredDocument: desired,
    observedOrgans: [],
    writer,
    actorIdentityRef: 'pf.identity.organism-controller',
    observedAt: new Date('2026-08-23T12:00:00Z'),
  });
  assert.equal(result.evidence.action_count, 2);
  assert.equal(result.evidence.actor, 'pf.identity.organism-controller');
  assert.equal(calls.length, 2);
});
