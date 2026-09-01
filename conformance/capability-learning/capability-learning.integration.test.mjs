import test from 'node:test';
import assert from 'node:assert/strict';
import { HEARTIME_CYCLE_VERSION } from '../../circulation/lib/contract.mjs';
import { reconcileSedimentation } from '../../circulation/sedimentation/lib/controller.mjs';
import { validateSedimentationSummary } from '../../circulation/sedimentation/lib/contract.mjs';
import {
  InMemoryCapabilityProcess,
  InMemoryImagineering,
  InMemoryLearningEvidence,
  InMemoryLearningRegistry,
} from '../../circulation/sedimentation/tests/fixtures/in-memory.mjs';
import { runHeartimeAlarm } from '../../heartime/worker/src/alarm-core.mjs';

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
      ref: 'pf.reconciliation.capability-learning',
      generation: 1,
      resourceHint: 'pf.learning-scope.market-signal',
      dueAt: Date.parse(dueAt),
      freshnessMs: 15 * 60_000,
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
        ref: `pf.beat.learning-${this.nextBeat++}`,
        emittedAt: nowMs,
        generation: this.contract.generation,
      };
      this.contract.dueAt = nowMs + this.contract.freshnessMs;
    }
    const beats = this.openBeat ? [{
      ref: this.openBeat.ref,
      reconciler_ref: 'pf.reconciler.sedimentation',
      reason: 'reconciliation_due',
      resource_hint: this.contract.resourceHint,
      contract_ref: this.contract.ref,
      contract_generation: this.openBeat.generation,
    }] : [];
    return this.envelope({ beats });
  }

  async finishCycle({ now, beat_refs, summaries }) {
    assert.deepEqual(beat_refs, [this.openBeat.ref]);
    this.observations.push({ beat_ref: beat_refs[0], summary: structuredClone(summaries[0]) });
    this.openBeat = null;
    this.contract.dueAt = Date.parse(now) + this.contract.freshnessMs;
    return this.envelope();
  }

  async deferFailure({ now, beat_refs, error }) {
    this.observations.push({ beat_ref: beat_refs[0], state: 'failed', error });
    this.openBeat = null;
    this.contract.dueAt = Date.parse(now) + 5_000;
    return this.envelope();
  }
}

const baseScope = {
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

const baseProfile = {
  ref: 'pf.profile.market-signal-2026-08',
  scope_ref: baseScope.ref,
  capability_ref: baseScope.capability_ref,
  capability_revision: baseScope.capability_revision,
  work_class_ref: baseScope.work_class_ref,
  occupancy_ref: baseScope.active_occupancy.ref,
  implementation_ref: baseScope.active_occupancy.implementation_ref,
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

const candidate = {
  ref: 'pf.implementation.compiled-classifier',
  scope_ref: baseScope.ref,
  capability_ref: baseScope.capability_ref,
  capability_revision: 1,
  work_class_ref: baseScope.work_class_ref,
  implementation_revision: 1,
  target_substrate: 'configuration',
  status: 'verified',
  semantic_contract_ref: baseScope.semantic_contract_ref,
  authority_contract_ref: baseScope.authority_contract_ref,
  evidence_contract_ref: baseScope.evidence_contract_ref,
  equivalence_contract_ref: 'pf.contract.equivalence.compiled-classifier-v1',
  fallback_implementation_ref: baseScope.active_occupancy.implementation_ref,
  fallback_implementation_revision: baseScope.active_occupancy.implementation_revision,
  fallback_substrate: baseScope.active_occupancy.substrate,
  residual_uncertainty: 0.02,
  expected_cognition_fraction: 0.17,
  expected_cost_per_run: 0.2,
  expected_latency_ms: 900,
  expected_quality_score: 0.98,
  artifact_ref: 'pf.artifact.compiled-classifier-v1',
  authored_by: 'pf.actor.builder-one',
  created_at: '2026-08-23T00:00:00.000Z',
};

const assessment = {
  ref: 'pf.assessment.compiled-classifier-v1',
  scope_ref: 'pf.learning-scope.market-signal',
  capability_ref: 'pf.capability.classify-market-signal',
  capability_revision: 1,
  work_class_ref: 'pf.work-class.market-signal',
  candidate_ref: candidate.ref,
  candidate_revision: candidate.implementation_revision,
  profile_ref: baseProfile.ref,
  equivalence_contract_ref: candidate.equivalence_contract_ref,
  state: 'verified',
  independent: true,
  evaluated_by: 'pf.actor.reviewer-one',
  observed_runs: 120,
  exception_count: 0,
  contradiction_count: 0,
  quality_regression: 0,
  residual_uncertainty: 0.02,
  observed_cognition_fraction: 0.17,
  observed_cost_per_run: 0.2,
  observed_latency_ms: 900,
  observed_quality_score: 0.98,
  evidence_refs: ['pf.evidence.shadow-compiled-classifier'],
  evaluated_at: '2026-08-23T13:00:00.000Z',
};

test('Capability Learning Seam turns repeated work into construction, verified succession, and reversible softening without direct activation', async () => {
  const stateApi = new CanonicalHeartimeState({ dueAt: '2026-08-24T00:00:00.000Z' });
  const mechanism = storage();
  const registry = new InMemoryLearningRegistry({ scope: baseScope, candidates: {} });
  const evidence = new InMemoryLearningEvidence({ profile: baseProfile, assessments: {} });
  const imagineering = new InMemoryImagineering();
  const process = new InMemoryCapabilityProcess();
  const organs = { registry, evidence, imagineering, process };
  const reconcilerFor = () => ({
    validateSummary: validateSedimentationSummary,
    reconcile: (hint) => reconcileSedimentation({
      scopeRef: hint.resource_hint,
      beatRef: hint.beat_ref,
      now: new Date('2026-08-24T00:00:00.000Z'),
      ...organs,
    }),
  });

  const first = await runHeartimeAlarm({
    stateApi,
    reconcilerFor,
    storage: mechanism,
    now: new Date('2026-08-24T00:00:00.000Z'),
  });
  assert.equal(first.status, 'ok');
  assert.equal(first.summaries[0].decision, 'construction_requested');
  assert.equal(imagineering.constructions.length, 1);
  assert.equal(process.proposals.length, 0);

  // Imagineering and independent Evidence finish outside the controller. The
  // following beat reads their durable result and only proposes succession.
  registry.candidates.set('configuration', structuredClone(candidate));
  evidence.assessments.set(candidate.ref, structuredClone(assessment));
  stateApi.contract.dueAt = Date.parse('2026-08-24T00:15:00.000Z');

  const second = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({
      validateSummary: validateSedimentationSummary,
      reconcile: (hint) => reconcileSedimentation({
        scopeRef: hint.resource_hint,
        beatRef: hint.beat_ref,
        now: new Date('2026-08-24T00:15:00.000Z'),
        ...organs,
      }),
    }),
    storage: mechanism,
    now: new Date('2026-08-24T00:15:00.000Z'),
  });
  assert.equal(second.summaries[0].decision, 'proposal_created');
  assert.equal(process.proposals.length, 1);
  assert.equal(registry.scope.active_occupancy.implementation_ref, 'pf.implementation.frontier-classifier');

  // Process/Registry promote externally. Later evidence contradicts the new
  // occupancy, and the same seam proposes a return to the admitted fallback.
  registry.scope.active_occupancy = {
    ref: 'pf.capability-occupancy.market-signal-v2',
    implementation_ref: candidate.ref,
    implementation_revision: 1,
    substrate: 'configuration',
    status: 'degraded',
    fallback_implementation_ref: 'pf.implementation.frontier-classifier',
    fallback_implementation_revision: 1,
    fallback_substrate: 'inference',
    cognition_fraction: 0.17,
    activated_at: '2026-08-24T00:20:00.000Z',
  };
  evidence.profile = {
    ...baseProfile,
    ref: 'pf.profile.market-signal-contradicted',
    occupancy_ref: registry.scope.active_occupancy.ref,
    implementation_ref: candidate.ref,
    window_ended_at: '2026-08-24T00:29:00.000Z',
    contradiction_count: 1,
    epistemic_state: 'contradicted',
  };
  stateApi.contract.dueAt = Date.parse('2026-08-24T00:30:00.000Z');

  const third = await runHeartimeAlarm({
    stateApi,
    reconcilerFor: () => ({
      validateSummary: validateSedimentationSummary,
      reconcile: (hint) => reconcileSedimentation({
        scopeRef: hint.resource_hint,
        beatRef: hint.beat_ref,
        now: new Date('2026-08-24T00:30:00.000Z'),
        ...organs,
      }),
    }),
    storage: mechanism,
    now: new Date('2026-08-24T00:30:00.000Z'),
  });
  assert.equal(third.summaries[0].decision, 'softening_proposed');
  assert.equal(process.proposals.length, 2);
  assert.equal(process.proposals[1].toImplementationRef, 'pf.implementation.frontier-classifier');
  assert.equal('profile' in third.summaries[0], false);
});
