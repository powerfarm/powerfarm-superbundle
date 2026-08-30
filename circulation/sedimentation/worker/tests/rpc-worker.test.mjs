import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileFromServiceBindings, validateHeartimeCaller } from '../src/core.mjs';
import { PORT_VERSIONS } from '../../lib/contract.mjs';

const envelope = (contract_version, data) => ({ contract_version, data });

function learningScope() {
  return {
    ref: 'pf.learning-scope.market-signal',
    capability_ref: 'pf.capability.classify-market-signal',
    capability_revision: 1,
    work_class_ref: 'pf.work-class.market-signal',
    semantic_contract_ref: 'pf.contract.semantic.market-signal-v1',
    authority_contract_ref: 'pf.contract.authority.market-signal-v1',
    evidence_contract_ref: 'pf.contract.evidence.market-signal-v1',
    learning_policy_ref: 'pf.policy.capability-learning.market-signal-v1',
    learning_policy_revision: 1,
    active_occupancy: {
      ref: 'pf.capability-occupancy.market-signal',
      implementation_ref: 'pf.implementation.frontier-classifier',
      implementation_revision: 1,
      substrate: 'inference',
      status: 'active',
      fallback_implementation_ref: null,
      fallback_implementation_revision: null,
      fallback_substrate: null,
      cognition_fraction: 1,
      activated_at: '2026-08-01T00:00:00.000Z',
    },
    learning_policy: {
      minimum_observed_runs: 100,
      minimum_stable_runs: 90,
      minimum_assessment_runs: 100,
      minimum_window_seconds: 604800,
      profile_stale_after_seconds: 86400,
      maximum_exception_rate: 0.02,
      maximum_contradictions: 0,
      maximum_workarounds: 0,
      maximum_residual_uncertainty: 0.05,
      minimum_savings_ratio: 0.25,
      minimum_cognition_reduction: 0.25,
      maximum_quality_regression: 0.01,
      maximum_latency_regression: 0.50,
      soften_exception_rate: 0.05,
      soften_contradictions: 1,
      soften_workarounds: 1,
      soften_residual_uncertainty: 0.10,
      allowed_substrates: ['inference', 'configuration', 'fixed'],
    },
  };
}

function workProfile() {
  return {
    ref: 'pf.profile.market-signal-2026-08',
    scope_ref: 'pf.learning-scope.market-signal',
    capability_ref: 'pf.capability.classify-market-signal',
    capability_revision: 1,
    work_class_ref: 'pf.work-class.market-signal',
    occupancy_ref: 'pf.capability-occupancy.market-signal',
    implementation_ref: 'pf.implementation.frontier-classifier',
    window_started_at: '2026-08-01T00:00:00.000Z',
    window_ended_at: '2026-08-23T12:00:00.000Z',
    observed_runs: 200,
    stable_runs: 195,
    exception_count: 2,
    contradiction_count: 0,
    workaround_count: 0,
    exception_rate: 0.01,
    residual_uncertainty: 0.02,
    quality_score: 0.98,
    baseline_quality_score: 0.98,
    cost_per_run: 1,
    latency_ms: 1000,
    epistemic_state: 'verified',
    distribution_ref: 'pf.distribution.market-signal-august',
    evidence_refs: ['pf.evidence.profile-market-signal'],
  };
}

function environment({ mismatch = false } = {}) {
  const version = (expected) => mismatch ? `${expected}.wrong` : expected;
  const constructions = [];
  const decisions = [];
  return {
    constructions,
    decisions,
    RECONCILER_IDENTITY_REF: 'pf.runtime.sedimentation-reconciler',
    REGISTRY: {
      async resolveCapabilityLearningScope() {
        return envelope(version(PORT_VERSIONS.registry), learningScope());
      },
      async findCapabilityImplementationCandidate() {
        return envelope(version(PORT_VERSIONS.registry), null);
      },
    },
    EVIDENCE_STORE: {
      async profileCapabilityWorkClass() {
        return envelope(version(PORT_VERSIONS.evidence), workProfile());
      },
      async assessCapabilityImplementation() {
        return envelope(version(PORT_VERSIONS.evidence), null);
      },
      async recordCapabilityLearningEvidence(input) {
        decisions.push(input);
        return envelope(version(PORT_VERSIONS.evidence), { ref: 'pf.evidence.capability-learning-1' });
      },
    },
    IMAGINEERING: {
      async ensureCapabilityConstruction(input) {
        constructions.push(input);
        return envelope(version(PORT_VERSIONS.imagineering), {
          ref: 'pf.construction.capability-1',
          created: true,
          state: 'open',
          target_substrate: input.targetSubstrate,
        });
      },
      async ensureCapabilityEvaluation(input) {
        return envelope(version(PORT_VERSIONS.imagineering), {
          ref: 'pf.construction.evaluation-1',
          created: true,
          state: 'open',
          target_substrate: input.targetSubstrate,
        });
      },
    },
    PROCESS: {
      async ensureCapabilityTransitionProposal() {
        throw new Error('not expected without a verified candidate');
      },
    },
  };
}

test('private RPC setting performs permanent capability-learning reconciliation through versioned ports', async () => {
  const env = environment();
  const result = await reconcileFromServiceBindings({
    hint: {
      beat_ref: 'pf.beat.learning-1',
      reconciler_ref: 'pf.reconciler.sedimentation',
      resource_hint: 'pf.learning-scope.market-signal',
    },
    env,
    now: new Date('2026-08-24T00:00:00.000Z'),
  });
  assert.equal(result.state, 'reconciled');
  assert.equal(result.decision, 'construction_requested');
  assert.equal(env.constructions.length, 1);
  assert.equal(env.decisions.length, 1);
  assert.equal('profile' in result, false);
});

test('port contract mismatch fails closed before a learning obligation is accepted', async () => {
  await assert.rejects(() => reconcileFromServiceBindings({
    hint: {
      beat_ref: 'pf.beat.learning-1',
      reconciler_ref: 'pf.reconciler.sedimentation',
      resource_hint: 'pf.learning-scope.market-signal',
    },
    env: environment({ mismatch: true }),
  }), /contract mismatch/);
});

test('wake hint cannot smuggle capability or profile bodies into the reconciler', async () => {
  await assert.rejects(() => reconcileFromServiceBindings({
    hint: {
      beat_ref: 'pf.beat.learning-1',
      reconciler_ref: 'pf.reconciler.sedimentation',
      resource_hint: 'pf.learning-scope.market-signal',
      profile: { observed_runs: 999 },
    },
    env: environment(),
  }), /must not carry|unsupported field/);
});

test('private sedimentation entrypoint binds Heartime identity, component and exact BeatRef', () => {
  const input = {
    caller: {
      identity_ref: 'pf.runtime.heartime',
      component_ref: 'pf.runtime.heartime',
      beat_ref: 'pf.beat.learning-1',
    },
    hint: {
      beat_ref: 'pf.beat.learning-1',
      reconciler_ref: 'pf.reconciler.sedimentation',
      resource_hint: 'pf.learning-scope.market-signal',
    },
    expectedIdentityRef: 'pf.runtime.heartime',
  };
  assert.equal(validateHeartimeCaller(input).hint.beat_ref, 'pf.beat.learning-1');
  assert.throws(() => validateHeartimeCaller({
    ...input,
    caller: { ...input.caller, component_ref: 'pf.runtime.impostor' },
  }), /component mismatch/);
  assert.throws(() => validateHeartimeCaller({
    ...input,
    caller: { ...input.caller, beat_ref: 'pf.beat.other' },
  }), /BeatRef does not match/);
});

test('L16: private Sedimentation entrypoint remains digital-only and closed to public HTTP', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const entrypoint = fs.readFileSync(path.resolve(here, '../src/index.js'), 'utf8');
  const core = fs.readFileSync(path.resolve(here, '../src/core.mjs'), 'utf8');
  assert.match(entrypoint, /EXPECTED_HEARTIME_IDENTITY_REF/);
  assert.match(entrypoint, /validateHeartimeCaller/);
  assert.match(core, /validatedCaller\.beat_ref !== wake\.beat_ref/);
  assert.match(entrypoint, /status: 404/);
  assert.doesNotMatch(entrypoint, /\b(?:activate|promote)\s*\(/);
  assert.doesNotMatch(entrypoint + core, /vivado|verilator|yosys|circt|calyx|fpga|asic/i);
});
