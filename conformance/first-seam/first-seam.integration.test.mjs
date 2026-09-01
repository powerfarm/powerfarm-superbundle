import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAttention } from '../../circulation/attention/lib/controller.mjs';
import {
  InMemoryAuthority,
  InMemoryCards,
  InMemoryEvidence,
  InMemoryOccupancies,
  InMemoryRuns,
} from '../../circulation/attention/tests/fixtures/in-memory.mjs';
import { HEARTIME_CYCLE_VERSION } from '../../circulation/lib/contract.mjs';
import { validateReconciliationSummary } from '../../circulation/attention/lib/contract.mjs';
import { runHeartimeAlarm } from '../../heartime/worker/src/alarm-core.mjs';

const card = {
  ref: 'pf.card.first-seam',
  generation: 1,
  scope: 'pf.office.research',
  title: 'Investigate the first permanent seam',
  why: 'a durable attention obligation exists',
  response_contract: 'investigate',
  evidence_refs: [],
  affordances: [{ id: 'inspect' }],
};

function storage() {
  return {
    alarm: null,
    values: new Map(),
    async setAlarm(value) { this.alarm = value; },
    async deleteAlarm() { this.alarm = null; },
    async get(key) { return this.values.get(key); },
    async put(key, value) { this.values.set(key, value); },
    async delete(key) { this.values.delete(key); },
  };
}

class CanonicalHeartimeState {
  constructor({ dueAt }) {
    this.contract = {
      ref: 'pf.reconciliation.first-seam',
      generation: 1,
      scope: 'pf.office.research',
      dueAt: Date.parse(dueAt),
      freshnessMs: 15 * 60_000,
      failureCount: 0,
    };
    this.nextBeat = 1;
    this.openBeat = null;
    this.observations = [];
  }

  // Which institution is this waking? The alarm establishes it before any cycle
  // work, so a canonical state double must be able to answer.
  async assertInstitution() {
    return { institution_ref: `inst_${'1'.repeat(32)}` };
  }

  envelope(data = {}) {
    return { contract_version: HEARTIME_CYCLE_VERSION, next_wake: this.nextWakeValue(), ...data };
  }

  nextWakeValue() {
    if (this.openBeat) return new Date(this.openBeat.emittedAt).toISOString();
    return new Date(this.contract.dueAt).toISOString();
  }

  async nextWake() { return this.nextWakeValue(); }

  async prepareCycle({ now }) {
    const nowMs = Date.parse(now);
    if (!this.openBeat && this.contract.dueAt <= nowMs) {
      this.openBeat = {
        ref: `pf.beat.${this.nextBeat++}`,
        emittedAt: nowMs,
        generation: this.contract.generation,
      };
      this.contract.dueAt = nowMs + this.contract.freshnessMs;
    }
    const beats = this.openBeat ? [{
      ref: this.openBeat.ref,
      reconciler_ref: 'pf.reconciler.attention',
      reason: 'reconciliation_due',
      resource_hint: this.contract.scope,
      contract_ref: this.contract.ref,
      contract_generation: this.openBeat.generation,
    }] : [];
    return this.envelope({ beats });
  }

  async finishCycle({ now, beat_refs, summaries }) {
    assert.deepEqual(beat_refs, [this.openBeat.ref]);
    this.observations.push({ beat_ref: beat_refs[0], summary: structuredClone(summaries[0]) });
    this.openBeat = null;
    this.contract.failureCount = 0;
    this.contract.dueAt = Date.parse(now) + this.contract.freshnessMs;
    return this.envelope();
  }

  async deferFailure({ now, beat_refs, error }) {
    this.observations.push({ beat_ref: beat_refs[0], state: 'failed', error });
    this.openBeat = null;
    this.contract.failureCount += 1;
    this.contract.dueAt = Date.parse(now) + 5_000;
    return this.envelope();
  }
}

function organs() {
  return {
    cards: new InMemoryCards([card]),
    occupancies: new InMemoryOccupancies({
      'pf.office.research': {
        ref: 'pf.occupancy.research',
        office_ref: 'pf.office.research',
        species: 'llm',
      },
    }),
    authority: new InMemoryAuthority({ 'pf.occupancy.research': [] }),
    runs: new InMemoryRuns(),
    evidence: new InMemoryEvidence(),
  };
}

test('First Seam persists attention, wakes by deadline, and observes the durable response without a bus', async () => {
  const stateApi = new CanonicalHeartimeState({ dueAt: '2026-08-23T12:00:00.000Z' });
  const mechanism = storage();
  const system = organs();
  const reconcilerFor = () => ({
    validateSummary: validateReconciliationSummary,
    reconcile: (hint) => reconcileAttention({
      scope: hint.resource_hint,
      beatRef: hint.beat_ref,
      now: new Date('2026-08-23T12:00:00.000Z'),
      ...system,
    }),
  });

  const first = await runHeartimeAlarm({
    stateApi,
    reconcilerFor,
    storage: mechanism,
    now: new Date('2026-08-23T12:00:00.000Z'),
  });

  assert.equal(first.status, 'ok');
  assert.equal(system.runs.attempts.length, 1);
  assert.equal(stateApi.observations.length, 1);
  assert.equal(stateApi.observations[0].summary.wake_pack_ref, 'pf.wakepack.1');
  assert.equal('wake_pack' in stateApi.observations[0].summary, false);

  // A worker completes later. No reply topic is required; Platform owns the
  // durable attempt and the next level-triggered pass discovers it.
  system.runs.complete(system.runs.attempts[0].ref, {
    disposition: 'answer',
    value: 'the permanent seam was inspected',
  });

  const second = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({
      validateSummary: validateReconciliationSummary,
      reconcile: (hint) => reconcileAttention({
        scope: hint.resource_hint,
        beatRef: hint.beat_ref,
        now: new Date('2026-08-23T12:15:00.000Z'),
        ...system,
      }),
    }),
    storage: mechanism,
    now: new Date('2026-08-23T12:15:00.000Z'),
  });

  assert.equal(second.status, 'ok');
  assert.equal(system.cards.cards.get(card.ref).responses.length, 1);
  assert.equal(system.cards.cards.get(card.ref).condition, 'resolved');
  assert.equal(system.evidence.records.length, 1);
  assert.equal(system.runs.attempts.length, 1, 'response observation does not create a second obligation');
  assert.equal(stateApi.observations.at(-1).summary.returned_count, 1);

  // A duplicate provider wake after convergence reads current state and does
  // nothing. Correctness does not depend on consuming an event exactly once.
  const duplicate = await runHeartimeAlarm({
    stateApi,
    reconcilerFor,
    storage: mechanism,
    now: new Date('2026-08-23T12:15:01.000Z'),
  });
  assert.equal(duplicate.beat_count, 0);
  assert.equal(system.runs.attempts.length, 1);
});
