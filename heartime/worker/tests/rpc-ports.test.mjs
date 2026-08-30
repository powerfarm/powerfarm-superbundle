import test from 'node:test';
import assert from 'node:assert/strict';
import { HEARTIME_PORT_VERSIONS } from '../../../circulation/lib/contract.mjs';
import {
  PORT_VERSIONS as ATTENTION_PORT_VERSIONS,
} from '../../../circulation/attention/lib/contract.mjs';
import {
  PORT_VERSIONS as SEDIMENTATION_PORT_VERSIONS,
} from '../../../circulation/sedimentation/lib/contract.mjs';
import {
  createAttentionReconcilerRpcPort,
  createHeartimeStateRpcPort,
  createReconcilerRouter,
  createSedimentationReconcilerRpcPort,
} from '../src/rpc-ports.mjs';

const envelope = (contract_version, data) => ({ contract_version, data });
const caller = {
  identity_ref: 'pf.runtime.heartime',
  component_ref: 'pf.runtime.heartime',
};

test('Heartime state port carries and verifies its permanent contract version', async () => {
  const calls = [];
  const binding = {
    async nextWake(input) {
      calls.push(input);
      return envelope(HEARTIME_PORT_VERSIONS.heartime_state, '2026-08-23T12:00:00Z');
    },
  };
  const port = createHeartimeStateRpcPort(binding, caller);
  assert.equal(await port.nextWake({ now: '2026-08-23T11:00:00Z' }), '2026-08-23T12:00:00Z');
  assert.equal(calls[0].contract_version, HEARTIME_PORT_VERSIONS.heartime_state);
});

test('Heartime state port fails closed on incompatible callee', async () => {
  const port = createHeartimeStateRpcPort({
    async nextWake() { return envelope('wrong.version', null); },
  }, caller);
  await assert.rejects(() => port.nextWake({ now: '2026-08-23T11:00:00Z' }), /contract mismatch/);
});

test('attention reconciler port transports only a versioned hint and carries its summary validator', async () => {
  const binding = {
    async reconcile(input) {
      assert.equal(input.contract_version, ATTENTION_PORT_VERSIONS.reconciler);
      assert.equal(input.hint.beat_ref, 'pf.beat.1');
      assert.equal(input.caller.beat_ref, 'pf.beat.1');
      assert.equal('card_body' in input.hint, false);
      return envelope(ATTENTION_PORT_VERSIONS.reconciler, {
        state: 'reconciled',
        scope: 'pf.office.research',
        beat_ref: 'pf.beat.1',
        observed_at: '2026-08-24T00:00:00.000Z',
        returned: [],
        returned_count: 0,
        observations: [],
        observation_count: 0,
      });
    },
  };
  const port = createAttentionReconcilerRpcPort(binding, caller);
  const result = await port.reconcile({ beat_ref: 'pf.beat.1', reconciler_ref: 'pf.reconciler.attention' });
  assert.equal(port.validateSummary(result), result);
});

test('sedimentation reconciler port is separately versioned and validates learning summaries', async () => {
  const binding = {
    async reconcile(input) {
      assert.equal(input.contract_version, SEDIMENTATION_PORT_VERSIONS.reconciler);
      assert.equal(input.caller.beat_ref, 'pf.beat.2');
      return envelope(SEDIMENTATION_PORT_VERSIONS.reconciler, {
        state: 'reconciled',
        scope: 'pf.learning-scope.market-signal',
        beat_ref: 'pf.beat.2',
        observed_at: '2026-08-24T00:00:00.000Z',
        decision: 'no_change',
      });
    },
  };
  const port = createSedimentationReconcilerRpcPort(binding, caller);
  const result = await port.reconcile({ beat_ref: 'pf.beat.2', reconciler_ref: 'pf.reconciler.sedimentation' });
  assert.equal(port.validateSummary(result), result);
});

test('reconciler router selects each admitted permanent seam and fails closed otherwise', () => {
  const router = createReconcilerRouter({
    attentionBinding: { reconcile() {} },
    sedimentationBinding: { reconcile() {} },
    caller,
  });
  assert.equal(typeof router('pf.reconciler.attention').validateSummary, 'function');
  assert.equal(typeof router('pf.reconciler.sedimentation').validateSummary, 'function');
  assert.throws(() => router('pf.reconciler.unknown'), /no physical reconciler binding/);
});
