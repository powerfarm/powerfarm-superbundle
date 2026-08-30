import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileFromServiceBindings, validateHeartimeCaller } from '../src/core.mjs';
import { PORT_VERSIONS } from '../../lib/contract.mjs';
import { createCardV1 } from '../../../cards/lib/card-v1.mjs';

const envelope = (contract_version, data) => ({ contract_version, data });

function environment({ mismatch = false } = {}) {
  const version = (expected) => mismatch ? `${expected}.wrong` : expected;
  const attempts = [];
  return {
    attempts,
    RECONCILER_IDENTITY_REF: 'pf.runtime.attention-reconciler',
    CARDS: {
      async listCurrentAttention(input) {
        const card = await createCardV1({
          ref: 'pf.card.market-change',
          generation: 1,
          scope: input.scope,
          created_at: '2026-08-23T11:00:00.000Z',
          attention: {
            why: 'material delta',
            response_contract: 'investigate',
            condition: 'pending',
            affordances: [{ id: 'inspect' }],
          },
          circulation: { state: 'prepared', next_expected: '2026-08-23T12:00:00.000Z' },
        });
        return envelope(version(PORT_VERSIONS.cards), [card]);
      },
      async compileWakePack(input) {
        return envelope(version(PORT_VERSIONS.cards), {
          ref: 'pf.wakepack.rpc.1',
          cards: input.cards.map((card) => ({ ...card, presentation: { semantic_context: card.why } })),
        });
      },
      async recordAttentionResponse() {
        return envelope(version(PORT_VERSIONS.cards), { ref: 'pf.card-response.1', stale: false });
      },
    },
    REGISTRY: {
      async resolveCurrentOccupancy() {
        return envelope(version(PORT_VERSIONS.registry), { ref: 'pf.occupancy.research', species: 'llm' });
      },
    },
    PROCESS: {
      async projectCardAffordances(input) {
        return envelope(version(PORT_VERSIONS.authority), input.card.affordances.map((item) => ({ ...item, state: 'available' })));
      },
    },
    PLATFORM: {
      async listCompletedAttentionAttempts() {
        return envelope(version(PORT_VERSIONS.runs), []);
      },
      async markAttentionAttemptRecorded() {
        return envelope(version(PORT_VERSIONS.runs), { recorded: true });
      },
      async ensureAttentionAttempt(input) {
        const existing = attempts.find((attempt) => attempt.idempotency_key === input.idempotencyKey);
        if (existing) return envelope(version(PORT_VERSIONS.runs), existing);
        const attempt = { ref: `pf.attempt.rpc.${attempts.length + 1}`, idempotency_key: input.idempotencyKey, status: 'running' };
        attempts.push(attempt);
        return envelope(version(PORT_VERSIONS.runs), attempt);
      },
      async observeAttentionAttempt(input) {
        return envelope(version(PORT_VERSIONS.runs), attempts.find((attempt) => attempt.ref === input.attempt_ref));
      },
    },
    EVIDENCE_STORE: {
      async recordEvidence() {
        return envelope(version(PORT_VERSIONS.evidence), { ref: 'pf.evidence.rpc.1' });
      },
    },
  };
}

test('private RPC setting reconciles current state through versioned organ ports', async () => {
  const env = environment();
  const result = await reconcileFromServiceBindings({
    hint: {
      beat_ref: 'pf.beat.rpc.1',
      reconciler_ref: 'pf.reconciler.attention',
      resource_hint: 'pf.office.research',
    },
    env,
    now: new Date('2026-08-23T12:00:00Z'),
  });
  assert.equal(result.state, 'reconciled');
  assert.equal(result.wake_pack_ref, 'pf.wakepack.rpc.1');
  assert.equal(env.attempts.length, 1);
  assert.equal('wake_pack' in result, false);
});

test('port contract mismatch fails closed before work is accepted', async () => {
  await assert.rejects(() => reconcileFromServiceBindings({
    hint: {
      beat_ref: 'pf.beat.rpc.1',
      reconciler_ref: 'pf.reconciler.attention',
      resource_hint: 'pf.office.research',
    },
    env: environment({ mismatch: true }),
  }), /contract mismatch/);
});

test('wake hint cannot smuggle Card payload into the reconciler', async () => {
  await assert.rejects(() => reconcileFromServiceBindings({
    hint: {
      beat_ref: 'pf.beat.rpc.1',
      reconciler_ref: 'pf.reconciler.attention',
      resource_hint: 'pf.office.research',
      card_body: { ref: 'pf.card.bad' },
    },
    env: environment(),
  }), /must not carry/);
});


test('private attention entrypoint binds both Heartime identity and component', () => {
  const input = {
    caller: {
      identity_ref: 'pf.runtime.heartime',
      component_ref: 'pf.runtime.heartime',
      beat_ref: 'pf.beat.rpc.1',
    },
    hint: {
      beat_ref: 'pf.beat.rpc.1',
      reconciler_ref: 'pf.reconciler.attention',
      resource_hint: 'pf.office.research',
    },
    expectedIdentityRef: 'pf.runtime.heartime',
  };
  assert.equal(validateHeartimeCaller(input).hint.beat_ref, 'pf.beat.rpc.1');
  assert.throws(() => validateHeartimeCaller({
    ...input,
    caller: { ...input.caller, component_ref: 'pf.runtime.impostor' },
  }), /component mismatch/);
});


test('private Attention entrypoint requires explicit admitted Heartime caller and matching BeatRef', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const entrypoint = fs.readFileSync(path.resolve(here, '../src/index.js'), 'utf8');
  const core = fs.readFileSync(path.resolve(here, '../src/core.mjs'), 'utf8');
  assert.match(entrypoint, /EXPECTED_HEARTIME_IDENTITY_REF/);
  assert.match(entrypoint, /validateHeartimeCaller/);
  assert.match(core, /validatedCaller\.beat_ref !== wake\.beat_ref/);
  assert.match(entrypoint, /status: 404/);
});
