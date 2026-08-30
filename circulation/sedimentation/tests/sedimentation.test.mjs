import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sedimentationObligationKey,
  expectedSavingsRatio,
  nextSubstrate,
  reconcileSedimentation,
  sedimentationDecisionKey,
  shouldSoften,
  stableEnoughToHarden,
} from '../lib/controller.mjs';
import {
  validateCandidate,
  validateCapabilityOccupancy,
  validateEquivalenceAssessment,
  validateLearningPolicy,
  validateLearningScope,
  validateSedimentationSummary,
  validateTransitionProposal,
  validateWorkProfile,
} from '../lib/contract.mjs';
import {
  InMemoryCapabilityProcess,
  InMemoryImagineering,
  InMemoryLearningEvidence,
  InMemoryLearningRegistry,
} from './fixtures/in-memory.mjs';

const scope = (overrides = {}) => ({
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
  ...overrides,
});

const profile = (overrides = {}) => ({
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
  ...overrides,
});

const candidate = (overrides = {}) => ({
  ref: 'pf.implementation.compiled-classifier',
  scope_ref: 'pf.learning-scope.market-signal',
  capability_ref: 'pf.capability.classify-market-signal',
  capability_revision: 1,
  work_class_ref: 'pf.work-class.market-signal',
  implementation_revision: 1,
  target_substrate: 'configuration',
  status: 'verified',
  semantic_contract_ref: 'pf.contract.semantic.market-signal-v1',
  authority_contract_ref: 'pf.contract.authority.market-signal-v1',
  evidence_contract_ref: 'pf.contract.evidence.market-signal-v1',
  equivalence_contract_ref: 'pf.contract.equivalence.compiled-classifier-v1',
  fallback_implementation_ref: 'pf.implementation.frontier-classifier',
  fallback_implementation_revision: 1,
  fallback_substrate: 'inference',
  residual_uncertainty: 0.02,
  expected_cognition_fraction: 0.17,
  expected_cost_per_run: 0.20,
  expected_latency_ms: 900,
  expected_quality_score: 0.98,
  artifact_ref: 'pf.artifact.compiled-classifier-v1',
  authored_by: 'pf.actor.builder-one',
  created_at: '2026-08-22T00:00:00.000Z',
  ...overrides,
});

const assessment = (overrides = {}) => ({
  ref: 'pf.assessment.compiled-classifier-v1',
  scope_ref: 'pf.learning-scope.market-signal',
  capability_ref: 'pf.capability.classify-market-signal',
  capability_revision: 1,
  work_class_ref: 'pf.work-class.market-signal',
  candidate_ref: 'pf.implementation.compiled-classifier',
  candidate_revision: 1,
  profile_ref: 'pf.profile.market-signal-2026-08',
  equivalence_contract_ref: 'pf.contract.equivalence.compiled-classifier-v1',
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
  ...overrides,
});

function system({
  learningScope = scope(),
  workProfile = profile(),
  candidates = {},
  assessments = {},
} = {}) {
  return {
    registry: new InMemoryLearningRegistry({ scope: learningScope, candidates }),
    evidence: new InMemoryLearningEvidence({ profile: workProfile, assessments }),
    imagineering: new InMemoryImagineering(),
    process: new InMemoryCapabilityProcess(),
  };
}

const run = (sys, beatRef = 'pf.beat.sedimentation-1', now = '2026-08-24T00:00:00.000Z') => reconcileSedimentation({
  scopeRef: 'pf.learning-scope.market-signal',
  beatRef,
  now: new Date(now),
  ...sys,
});

test('L14: decision identity is deterministic and independent of provider machinery', async () => {
  const input = {
    scopeRef: 'pf.learning-scope.market-signal',
    capabilityRevision: 1,
    learningPolicyRef: 'pf.policy.capability-learning.market-signal-v1',
    learningPolicyRevision: 1,
    occupancyRef: 'pf.capability-occupancy.market-signal',
    profileRef: 'pf.profile.market-signal-2026-08',
    decision: 'construction',
    targetSubstrate: 'configuration',
  };
  assert.equal(await sedimentationDecisionKey(input), await sedimentationDecisionKey(input));
  assert.match(await sedimentationDecisionKey(input), /^sha256:[a-f0-9]{64}$/);
});

test('L7: substrate succession follows the admitted order and never skips a rung', () => {
  assert.equal(nextSubstrate('inference', ['inference', 'configuration', 'fixed']), 'configuration');
  assert.equal(nextSubstrate('configuration', ['inference', 'configuration', 'fixed']), 'fixed');
  assert.equal(nextSubstrate('fixed', ['inference', 'configuration', 'fixed']), null);
});

test('C30/C56: stable competence without a candidate creates one durable construction responsibility', async () => {
  const sys = system();
  const result = await run(sys);
  assert.equal(result.decision, 'construction_requested');
  assert.equal(result.target_substrate, 'configuration');
  assert.equal(sys.imagineering.constructions.length, 1);
  assert.equal(sys.process.proposals.length, 0);
  assert.equal(sys.evidence.records.length, 1);
});

test('L11: duplicate Heartime passes do not duplicate construction or decision evidence', async () => {
  const sys = system();
  await run(sys, 'pf.beat.sedimentation-1');
  await run(sys, 'pf.beat.sedimentation-2');
  assert.equal(sys.imagineering.constructions.length, 1);
  assert.equal(sys.evidence.records.length, 1);
});

test('candidate awaiting verification creates an evaluation responsibility, not a transition', async () => {
  const c = candidate({ status: 'shadow' });
  const sys = system({ candidates: { configuration: c } });
  const result = await run(sys);
  assert.equal(result.decision, 'evaluation_requested');
  assert.equal(sys.imagineering.evaluations.length, 1);
  assert.equal(sys.process.proposals.length, 0);
});

test('L10/L12: verified equivalent candidate creates an exact proposal but never activates itself', async () => {
  const c = candidate();
  const sys = system({
    candidates: { configuration: c },
    assessments: { [c.ref]: assessment() },
  });
  const result = await run(sys);
  assert.equal(result.decision, 'proposal_created');
  assert.equal(result.proposal_ref, 'pf.proposal.capability-transition-1');
  assert.equal(sys.process.proposals.length, 1);
  assert.equal(sys.process.proposals[0].fromOccupancyRef, scope().active_occupancy.ref);
  assert.equal(sys.process.proposals[0].toSubstrate, 'configuration');
  assert.equal(sys.process.proposals[0].toCognitionFraction, 0.17);
  assert.equal(sys.registry.scope.active_occupancy.implementation_ref, 'pf.implementation.frontier-classifier');
});

test('repeated reconciliation observes the same open proposal rather than creating parallel power', async () => {
  const c = candidate();
  const sys = system({ candidates: { configuration: c }, assessments: { [c.ref]: assessment() } });
  assert.equal((await run(sys, 'pf.beat.sedimentation-1')).decision, 'proposal_created');
  assert.equal((await run(sys, 'pf.beat.sedimentation-2')).decision, 'proposal_open');
  assert.equal(sys.process.proposals.length, 1);
});

test('L2: semantic drift in a candidate is not sedimentation', async () => {
  const c = candidate({ semantic_contract_ref: 'pf.contract.semantic.different' });
  const sys = system({ candidates: { configuration: c } });
  await assert.rejects(() => run(sys), /changes capability semantics/);
});


test('L1: capability identity and revision survive implementation succession', () => {
  assert.throws(() => validateCandidate(candidate({
    capability_revision: 2,
  }), scope(), 'configuration'), /changes capability identity or revision/);
});

test('L2: authority widening in a candidate is not sedimentation', async () => {
  const c = candidate({ authority_contract_ref: 'pf.contract.authority.wider' });
  const sys = system({ candidates: { configuration: c } });
  await assert.rejects(() => run(sys), /changes authority requirements/);
});

test('L2: evidence obligations cannot be weakened during substrate succession', async () => {
  const c = candidate({ evidence_contract_ref: 'pf.contract.evidence.weaker' });
  const sys = system({ candidates: { configuration: c } });
  await assert.rejects(() => run(sys), /changes evidence obligations/);
});

test('L3: candidate author cannot certify their own equivalence', async () => {
  const c = candidate();
  const sys = system({
    candidates: { configuration: c },
    assessments: { [c.ref]: assessment({ evaluated_by: c.authored_by }) },
  });
  await assert.rejects(() => run(sys), /cannot be the independent evaluator/);
});

test('L4: candidate forecast cannot substitute for independently observed economic gain', async () => {
  const c = candidate({ expected_cost_per_run: 0.1 });
  const sys = system({
    candidates: { configuration: c },
    assessments: { [c.ref]: assessment({ observed_cost_per_run: 0.9 }) },
  });
  const result = await run(sys);
  assert.equal(result.decision, 'construction_requested');
  assert.equal(result.reason, undefined);
  assert.equal(sys.process.proposals.length, 0);
  assert.equal(sys.imagineering.constructions[0].reason, 'candidate_failed_equivalence_or_economics');
});



test('independent assessment must contain enough observed runs before succession', async () => {
  const c = candidate();
  const sys = system({
    candidates: { configuration: c },
    assessments: { [c.ref]: assessment({ observed_runs: 20 }) },
  });
  const result = await run(sys);
  assert.equal(result.decision, 'construction_requested');
  assert.equal(sys.process.proposals.length, 0);
});

test('L5: candidate must reduce observed cognition, not merely promise lower cost', async () => {
  const c = candidate({ expected_cognition_fraction: 0.1 });
  const sys = system({
    candidates: { configuration: c },
    assessments: { [c.ref]: assessment({ observed_cognition_fraction: 0.9 }) },
  });
  const result = await run(sys);
  assert.equal(result.decision, 'construction_requested');
  assert.equal(sys.process.proposals.length, 0);
});

test('latency regression outside the declared ceiling prevents hardening', async () => {
  const c = candidate();
  const sys = system({
    candidates: { configuration: c },
    assessments: { [c.ref]: assessment({ observed_latency_ms: 1700 }) },
  });
  const result = await run(sys);
  assert.equal(result.decision, 'construction_requested');
  assert.equal(sys.process.proposals.length, 0);
});

test('L13: assessment quality regression is derived from observed quality, not narrated', async () => {
  const c = candidate();
  const sys = system({
    candidates: { configuration: c },
    assessments: {
      [c.ref]: assessment({ observed_quality_score: 0.95, quality_regression: 0 }),
    },
  });
  await assert.rejects(() => run(sys), /quality_regression must be derived/);
});

test('L6: future-dated work evidence cannot drive succession', async () => {
  const sys = system({
    workProfile: profile({ window_ended_at: '2026-08-25T00:00:00.000Z' }),
  });
  const result = await run(sys);
  assert.equal(result.state, 'blocked');
  assert.equal(result.reason, 'work_profile_stale');
});

test('workarounds prevent hardening even before the softening threshold is reached', async () => {
  const sys = system({ workProfile: profile({ workaround_count: 1 }) });
  const result = await run(sys);
  assert.equal(result.state, 'blocked');
  assert.equal(result.decision, 'insufficient_evidence');
});

test('candidate fallback must preserve exact admitted inference lineage', () => {
  assert.throws(() => validateCandidate(candidate({
    fallback_implementation_revision: 2,
  }), scope(), 'configuration'), /not the admitted inference lineage/);
});

test('insufficient evidence remains blocked rather than being converted into a plausible optimization', async () => {
  const sys = system({ workProfile: profile({ observed_runs: 20, stable_runs: 20, exception_count: 0, exception_rate: 0 }) });
  const result = await run(sys);
  assert.equal(result.state, 'blocked');
  assert.equal(result.decision, 'insufficient_evidence');
  assert.equal(sys.imagineering.constructions.length, 0);
});

test('stale evidence cannot cause hardening', async () => {
  const sys = system({ workProfile: profile({ window_ended_at: '2026-08-20T00:00:00.000Z' }) });
  const result = await run(sys);
  assert.equal(result.state, 'blocked');
  assert.equal(result.reason, 'work_profile_stale');
});

test('C31/L8: contradiction in a hardened occupancy proposes reversible softening to its admitted fallback', async () => {
  const hardenedScope = scope({
    active_occupancy: {
      ref: 'pf.capability-occupancy.market-signal',
      implementation_ref: 'pf.implementation.compiled-classifier',
      implementation_revision: 2,
      substrate: 'configuration',
      status: 'degraded',
      fallback_implementation_ref: 'pf.implementation.frontier-classifier',
      fallback_implementation_revision: 1,
      fallback_substrate: 'inference',
      cognition_fraction: 0.17,
      activated_at: '2026-08-20T00:00:00.000Z',
    },
  });
  const contradicted = profile({
    occupancy_ref: hardenedScope.active_occupancy.ref,
    implementation_ref: hardenedScope.active_occupancy.implementation_ref,
    contradiction_count: 1,
    epistemic_state: 'contradicted',
  });
  const sys = system({ learningScope: hardenedScope, workProfile: contradicted });
  const result = await run(sys);
  assert.equal(result.decision, 'softening_proposed');
  assert.equal(result.target_substrate, 'inference');
  assert.equal(sys.process.proposals[0].toImplementationRef, 'pf.implementation.frontier-classifier');
});

test('contradiction while already on inference does not fabricate a lower fallback', async () => {
  const sys = system({ workProfile: profile({ contradiction_count: 1, epistemic_state: 'contradicted' }) });
  const result = await run(sys);
  assert.equal(result.state, 'blocked');
  assert.equal(result.decision, 'insufficient_evidence');
  assert.equal(sys.process.proposals.length, 0);
});

test('a fixed stable occupancy produces no fictitious fourth substrate', async () => {
  const fixedScope = scope({
    active_occupancy: {
      ref: 'pf.capability-occupancy.market-signal',
      implementation_ref: 'pf.implementation.fixed-classifier',
      implementation_revision: 3,
      substrate: 'fixed',
      status: 'active',
      fallback_implementation_ref: 'pf.implementation.frontier-classifier',
      fallback_implementation_revision: 1,
      fallback_substrate: 'inference',
      cognition_fraction: 0,
      activated_at: '2026-08-20T00:00:00.000Z',
    },
  });
  const sys = system({
    learningScope: fixedScope,
    workProfile: profile({ implementation_ref: 'pf.implementation.fixed-classifier' }),
  });
  assert.equal((await run(sys)).decision, 'already_fixed');
});

test('L9: non-inference occupancy without exact fallback is structurally invalid', () => {
  assert.throws(() => validateLearningScope(scope({
    active_occupancy: {
      ...scope().active_occupancy,
      substrate: 'configuration',
      cognition_fraction: 0.2,
    },
  })), /requires a complete inference fallback/);
});

test('profile exception rate is derived, never trusted as narration', () => {
  assert.throws(() => validateWorkProfile(profile({ exception_rate: 0.5 }), scope()), /must be derived/);
});

test('L7: candidate cannot skip from inference directly to fixed', () => {
  assert.throws(() => validateCandidate(candidate({ target_substrate: 'fixed' }), scope(), 'configuration'), /different substrate/);
});

test('L15: Heartime summary carries references and decisions, never profile/candidate/proposal bodies', async () => {
  const sys = system();
  const result = await run(sys);
  assert.equal(validateSedimentationSummary(result), result);
  assert.equal('profile' in result, false);
  assert.equal('candidate' in result, false);
  assert.equal('proposal' in result, false);
  assert.throws(() => validateSedimentationSummary({ ...result, profile: {} }), /forbidden field|unsupported field/);
});

test('missing learning scope is a legal blocked reconciliation', async () => {
  const sys = system();
  sys.registry.scope = null;
  const result = await run(sys);
  assert.equal(result.state, 'blocked');
  assert.equal(result.reason, 'learning_scope_not_found');
});

test('profile from a superseded occupancy cannot drive succession', async () => {
  const sys = system({ workProfile: profile({ occupancy_ref: 'pf.capability-occupancy.old' }) });
  await assert.rejects(() => run(sys), /stale occupancy/);
});

test('pure decision helpers preserve explicit thresholds', () => {
  const s = scope();
  const p = profile();
  assert.equal(stableEnoughToHarden(s, p), true);
  assert.equal(shouldSoften(s, p), false);
  assert.equal(expectedSavingsRatio(1, 0.2), 0.8);
});

test('L17: learning policy admits only a contiguous prefix of the canonical digital substrate order', () => {
  assert.throws(() => validateLearningPolicy({
    ...scope().learning_policy,
    allowed_substrates: ['inference', 'fixed'],
  }), /contiguous prefix/);
  assert.throws(() => validateLearningPolicy({
    ...scope().learning_policy,
    allowed_substrates: ['inference', 'fixed', 'configuration'],
  }), /contiguous prefix/);
  assert.equal(validateLearningPolicy({
    ...scope().learning_policy,
    allowed_substrates: ['inference', 'configuration'],
  }).allowed_substrates.length, 2);
});

test('L18: cognition fractions are constitutional properties of each substrate', () => {
  assert.throws(() => validateCapabilityOccupancy({
    ...scope().active_occupancy,
    cognition_fraction: 0.99,
  }), /inference occupancy cognition_fraction must be 1/);

  const configured = {
    ...scope().active_occupancy,
    implementation_ref: 'pf.implementation.configured-classifier',
    implementation_revision: 2,
    substrate: 'configuration',
    cognition_fraction: 1,
    fallback_implementation_ref: 'pf.implementation.frontier-classifier',
    fallback_implementation_revision: 1,
    fallback_substrate: 'inference',
  };
  assert.throws(() => validateCapabilityOccupancy(configured), /must reduce cognition fraction/);

  assert.throws(() => validateCapabilityOccupancy({
    ...configured,
    substrate: 'fixed',
    cognition_fraction: 0.01,
  }), /fixed occupancy cognition_fraction must be 0/);
});

test('L19: fixed candidates and assessments must eliminate runtime cognition rather than rename it', () => {
  const configuredScope = scope({
    active_occupancy: {
      ref: 'pf.capability-occupancy.market-signal',
      implementation_ref: 'pf.implementation.configured-classifier',
      implementation_revision: 2,
      substrate: 'configuration',
      status: 'active',
      fallback_implementation_ref: 'pf.implementation.frontier-classifier',
      fallback_implementation_revision: 1,
      fallback_substrate: 'inference',
      cognition_fraction: 0.17,
      activated_at: '2026-08-20T00:00:00.000Z',
    },
  });
  const fixedCandidate = candidate({
    ref: 'pf.implementation.fixed-classifier',
    implementation_revision: 3,
    target_substrate: 'fixed',
    expected_cognition_fraction: 0,
    fallback_implementation_ref: 'pf.implementation.frontier-classifier',
    fallback_implementation_revision: 1,
    fallback_substrate: 'inference',
  });
  assert.throws(() => validateCandidate({
    ...fixedCandidate,
    expected_cognition_fraction: 0.01,
  }, configuredScope, 'fixed'), /fixed candidate expected_cognition_fraction must be 0/);

  const fixedAssessment = assessment({
    candidate_ref: fixedCandidate.ref,
    candidate_revision: fixedCandidate.implementation_revision,
    equivalence_contract_ref: fixedCandidate.equivalence_contract_ref,
    observed_cognition_fraction: 0,
  });
  assert.throws(() => validateEquivalenceAssessment({
    ...fixedAssessment,
    observed_cognition_fraction: 0.01,
  }, fixedCandidate, profile()), /fixed assessment observed_cognition_fraction must be 0/);
});

test('L20: work evidence is bound to the exact capability revision and work class', () => {
  assert.throws(() => validateWorkProfile(profile({
    capability_revision: 2,
  }), scope()), /different capability revision/);
  assert.throws(() => validateWorkProfile(profile({
    work_class_ref: 'pf.work-class.unrelated',
  }), scope()), /different work class/);
  assert.throws(() => validateWorkProfile(profile({
    observed_runs: 200,
    stable_runs: 199,
    exception_count: 2,
    exception_rate: 0.01,
  }), scope()), /cannot exceed observed_runs together/);
});

test('L21: equivalence evidence is bound to candidate revision, profile and contract', () => {
  const c = candidate();
  const p = profile();
  assert.throws(() => validateEquivalenceAssessment(assessment({
    candidate_revision: 2,
  }), c, p), /different candidate revision/);
  assert.throws(() => validateEquivalenceAssessment(assessment({
    profile_ref: 'pf.profile.other-window',
  }), c, p), /different work profile/);
  assert.throws(() => validateEquivalenceAssessment(assessment({
    equivalence_contract_ref: 'pf.contract.equivalence.other',
  }), c, p), /different equivalence contract/);
  assert.throws(() => validateEquivalenceAssessment(assessment({
    capability_revision: 2,
  }), c, p), /different capability revision/);
  assert.throws(() => validateEquivalenceAssessment(assessment({
    work_class_ref: 'pf.work-class.other',
  }), c, p), /different work class/);
});

test('L22: equivalence assessment cannot predate either the candidate or its evidence window', () => {
  const c = candidate();
  const p = profile();
  assert.throws(() => validateEquivalenceAssessment(assessment({
    evaluated_at: '2026-08-21T00:00:00.000Z',
  }), c, p), /predates the candidate/);
  assert.throws(() => validateEquivalenceAssessment(assessment({
    evaluated_at: '2026-08-23T11:59:59.000Z',
  }), c, p), /predates the work profile/);
});

test('L23: zero-cost capability cannot manufacture savings by division', () => {
  assert.equal(expectedSavingsRatio(0, 1), 0);
  assert.equal(expectedSavingsRatio(0, 0), 0);
  assert.equal(expectedSavingsRatio(1, 2), 0);
});

test('L24: institutional obligation survives new evidence while decision evidence remains revision-specific', async () => {
  const sys = system();
  await run(sys, 'pf.beat.sedimentation-1');
  const firstObligation = sys.imagineering.constructions[0].idempotencyKey;
  const firstEvidenceKey = sys.evidence.records[0].idempotency_key;

  sys.evidence.profile = profile({
    ref: 'pf.profile.market-signal-2026-08-recheck',
    window_started_at: '2026-08-02T00:00:00.000Z',
    window_ended_at: '2026-08-24T00:00:00.000Z',
    evidence_refs: ['pf.evidence.profile-market-signal-recheck'],
  });
  await run(sys, 'pf.beat.sedimentation-2', '2026-08-24T01:00:00.000Z');

  assert.equal(sys.imagineering.constructions.length, 1);
  assert.equal(sys.imagineering.constructions[0].idempotencyKey, firstObligation);
  assert.equal(sys.evidence.records.length, 2);
  assert.notEqual(sys.evidence.records[1].idempotency_key, firstEvidenceKey);
  assert.equal(sys.evidence.records[1].obligation_key, firstObligation);
});

test('L25: a learning-policy revision creates a new institutional learning obligation', async () => {
  const first = await sedimentationObligationKey({
    scopeRef: scope().ref,
    capabilityRevision: 1,
    learningPolicyRef: scope().learning_policy_ref,
    learningPolicyRevision: 1,
    occupancyRef: scope().active_occupancy.ref,
    decision: 'construction',
    targetSubstrate: 'configuration',
  });
  const second = await sedimentationObligationKey({
    scopeRef: scope().ref,
    capabilityRevision: 1,
    learningPolicyRef: scope().learning_policy_ref,
    learningPolicyRevision: 2,
    occupancyRef: scope().active_occupancy.ref,
    decision: 'construction',
    targetSubstrate: 'configuration',
  });
  assert.notEqual(first, second);
});

test('L26: draft candidate remains a construction responsibility rather than entering evaluation', async () => {
  const c = candidate({ status: 'draft' });
  const sys = system({ candidates: { configuration: c } });
  const result = await run(sys);
  assert.equal(result.decision, 'construction_requested');
  assert.equal(sys.imagineering.constructions.length, 1);
  assert.equal(sys.imagineering.evaluations.length, 0);
  assert.equal(sys.imagineering.constructions[0].replacesCandidateRevision, c.implementation_revision);
});

test('L27: non-final independent assessment continues evaluation instead of rebuilding the candidate', async () => {
  const c = candidate({ status: 'shadow' });
  const sys = system({
    candidates: { configuration: c },
    assessments: { [c.ref]: assessment({ state: 'evidenced' }) },
  });
  const result = await run(sys);
  assert.equal(result.decision, 'evaluation_requested');
  assert.equal(sys.imagineering.evaluations.length, 1);
  assert.equal(sys.imagineering.constructions.length, 0);
});

test('L28: contradicted assessment invalidates the candidate path and requests replacement construction', async () => {
  const c = candidate({ status: 'verified' });
  const sys = system({
    candidates: { configuration: c },
    assessments: { [c.ref]: assessment({ state: 'contradicted', contradiction_count: 1 }) },
  });
  const result = await run(sys);
  assert.equal(result.decision, 'construction_requested');
  assert.equal(sys.imagineering.constructions.length, 1);
  assert.equal(sys.imagineering.constructions[0].reason, 'candidate_assessment_contradicted');
  assert.equal(sys.imagineering.constructions[0].replacesCandidateRevision, c.implementation_revision);
});

test('L29: Process cannot substitute a different implementation revision or policy revision', async () => {
  const c = candidate();
  const sys = system({ candidates: { configuration: c }, assessments: { [c.ref]: assessment() } });
  const original = sys.process.ensureTransitionProposal.bind(sys.process);
  sys.process.ensureTransitionProposal = async (input) => ({
    ...(await original(input)),
    to_implementation_revision: input.toImplementationRevision + 1,
  });
  await assert.rejects(() => run(sys), /mismatched to_implementation_revision/);

  const sys2 = system({ candidates: { configuration: c }, assessments: { [c.ref]: assessment() } });
  const original2 = sys2.process.ensureTransitionProposal.bind(sys2.process);
  sys2.process.ensureTransitionProposal = async (input) => ({
    ...(await original2(input)),
    learning_policy_revision: input.learningPolicyRevision + 1,
  });
  await assert.rejects(() => run(sys2), /mismatched learning_policy_revision/);
});

test('L30: proposal validation forbids substrate skips and malformed softening', () => {
  const base = {
    ref: 'pf.proposal.capability-transition-test',
    created: true,
    state: 'open',
    direction: 'harden',
    capability_ref: scope().capability_ref,
    capability_revision: 1,
    work_class_ref: scope().work_class_ref,
    learning_policy_ref: scope().learning_policy_ref,
    learning_policy_revision: 1,
    from_occupancy_ref: scope().active_occupancy.ref,
    from_implementation_ref: scope().active_occupancy.implementation_ref,
    from_implementation_revision: 1,
    from_substrate: 'inference',
    to_implementation_ref: 'pf.implementation.fixed-classifier',
    to_implementation_revision: 3,
    to_substrate: 'fixed',
    to_cognition_fraction: 0,
    semantic_contract_ref: scope().semantic_contract_ref,
    authority_contract_ref: scope().authority_contract_ref,
    evidence_contract_ref: scope().evidence_contract_ref,
    equivalence_contract_ref: 'pf.contract.equivalence.fixed-classifier-v1',
    profile_ref: profile().ref,
    assessment_ref: assessment().ref,
    fallback_implementation_ref: scope().active_occupancy.implementation_ref,
    fallback_implementation_revision: 1,
    fallback_substrate: 'inference',
  };
  assert.throws(() => validateTransitionProposal(base), /exactly one substrate rung/);
  assert.throws(() => validateTransitionProposal({
    ...base,
    direction: 'soften',
    from_substrate: 'fixed',
    to_substrate: 'configuration',
    to_cognition_fraction: 0.1,
  }), /must return to the admitted inference fallback/);
});
