import {
  BASE_RECONCILIATION_FORBIDDEN_KEYS,
  HEARTIME_PORT_VERSIONS,
  MAX_RECONCILIATION_SUMMARY_BYTES,
  assertCompactJson,
  assertFiniteNumber,
  assertGeneration,
  assertInstitutionalRef,
  assertIsoTimestamp,
  assertNonNegativeInteger,
  assertOnlyFields,
  assertOptionalInstitutionalRef,
  assertPlainObject,
  assertRatio,
  validateCallerContext,
  validateWakeHintBase,
} from '../../lib/contract.mjs';

export const CAPABILITY_LEARNING_CONTRACT_ID = 'pf.contract.capability-learning.v1';
export const CAPABILITY_LEARNING_SCHEMA_VERSION = 1;
export const SEDIMENTATION_RECONCILER_REF = 'pf.reconciler.sedimentation';
export const SEDIMENTATION_RECONCILER_RUNTIME_REF = 'pf.runtime.sedimentation-reconciler';

export const PORT_VERSIONS = Object.freeze({
  registry: 'powerfarm.registry.capability-learning.v1',
  evidence: 'powerfarm.evidence.capability-learning.v1',
  imagineering: 'powerfarm.imagineering.capability-construction.v1',
  process: 'powerfarm.process.capability-succession.v1',
  reconciler: 'powerfarm.sedimentation.reconciler.v1',
  ...HEARTIME_PORT_VERSIONS,
});

export const SUBSTRATES = Object.freeze(['inference', 'configuration', 'fixed']);
export const IMPLEMENTATION_STATES = Object.freeze([
  'draft',
  'candidate',
  'shadow',
  'verified',
  'active',
  'degraded',
  'retired',
  'rejected',
  'invalidated',
]);
export const EPISTEMIC_STATES = Object.freeze([
  'unknown',
  'observed',
  'inferred',
  'hypothesis',
  'evidenced',
  'verified',
  'contradicted',
]);
export const TRANSITION_DIRECTIONS = Object.freeze(['harden', 'soften']);

const substrateSet = new Set(SUBSTRATES);
const implementationStateSet = new Set(IMPLEMENTATION_STATES);
const candidateStateSet = new Set(['draft', 'candidate', 'shadow', 'verified', 'rejected', 'invalidated']);
const epistemicStateSet = new Set(EPISTEMIC_STATES);
const summaryStateSet = new Set(['reconciled', 'blocked']);
const decisionSet = new Set([
  'no_change',
  'insufficient_evidence',
  'construction_requested',
  'evaluation_requested',
  'proposal_created',
  'proposal_open',
  'softening_proposed',
  'already_fixed',
  'blocked',
]);

const scopeFields = new Set([
  'ref',
  'capability_ref',
  'capability_revision',
  'work_class_ref',
  'semantic_contract_ref',
  'authority_contract_ref',
  'evidence_contract_ref',
  'active_occupancy',
  'learning_policy_ref',
  'learning_policy_revision',
  'learning_policy',
]);
const occupancyFields = new Set([
  'ref',
  'implementation_ref',
  'implementation_revision',
  'substrate',
  'status',
  'fallback_implementation_ref',
  'fallback_implementation_revision',
  'fallback_substrate',
  'cognition_fraction',
  'activated_at',
]);
const policyFields = new Set([
  'minimum_observed_runs',
  'minimum_stable_runs',
  'minimum_assessment_runs',
  'minimum_window_seconds',
  'profile_stale_after_seconds',
  'maximum_exception_rate',
  'maximum_contradictions',
  'maximum_workarounds',
  'maximum_residual_uncertainty',
  'minimum_savings_ratio',
  'minimum_cognition_reduction',
  'maximum_quality_regression',
  'maximum_latency_regression',
  'soften_exception_rate',
  'soften_contradictions',
  'soften_workarounds',
  'soften_residual_uncertainty',
  'allowed_substrates',
]);
const profileFields = new Set([
  'ref',
  'scope_ref',
  'capability_ref',
  'capability_revision',
  'work_class_ref',
  'occupancy_ref',
  'implementation_ref',
  'window_started_at',
  'window_ended_at',
  'observed_runs',
  'stable_runs',
  'exception_count',
  'contradiction_count',
  'workaround_count',
  'exception_rate',
  'residual_uncertainty',
  'quality_score',
  'baseline_quality_score',
  'cost_per_run',
  'latency_ms',
  'epistemic_state',
  'distribution_ref',
  'evidence_refs',
]);
const candidateFields = new Set([
  'ref',
  'scope_ref',
  'capability_ref',
  'capability_revision',
  'work_class_ref',
  'implementation_revision',
  'target_substrate',
  'status',
  'semantic_contract_ref',
  'authority_contract_ref',
  'evidence_contract_ref',
  'equivalence_contract_ref',
  'fallback_implementation_ref',
  'fallback_implementation_revision',
  'fallback_substrate',
  'residual_uncertainty',
  'expected_cognition_fraction',
  'expected_cost_per_run',
  'expected_latency_ms',
  'expected_quality_score',
  'artifact_ref',
  'authored_by',
  'created_at',
]);
const assessmentFields = new Set([
  'ref',
  'scope_ref',
  'capability_ref',
  'capability_revision',
  'work_class_ref',
  'candidate_ref',
  'candidate_revision',
  'profile_ref',
  'equivalence_contract_ref',
  'state',
  'independent',
  'evaluated_by',
  'observed_runs',
  'exception_count',
  'contradiction_count',
  'quality_regression',
  'residual_uncertainty',
  'observed_cognition_fraction',
  'observed_cost_per_run',
  'observed_latency_ms',
  'observed_quality_score',
  'evidence_refs',
  'evaluated_at',
]);
const responsibilityFields = new Set(['ref', 'created', 'state', 'target_substrate']);
const proposalFields = new Set([
  'ref',
  'created',
  'state',
  'direction',
  'capability_ref',
  'capability_revision',
  'work_class_ref',
  'learning_policy_ref',
  'learning_policy_revision',
  'from_occupancy_ref',
  'from_implementation_ref',
  'from_implementation_revision',
  'from_substrate',
  'to_implementation_ref',
  'to_implementation_revision',
  'to_substrate',
  'to_cognition_fraction',
  'semantic_contract_ref',
  'authority_contract_ref',
  'evidence_contract_ref',
  'equivalence_contract_ref',
  'profile_ref',
  'assessment_ref',
  'fallback_implementation_ref',
  'fallback_implementation_revision',
  'fallback_substrate',
]);
const summaryFields = new Set([
  'state',
  'reason',
  'scope',
  'beat_ref',
  'observed_at',
  'capability_ref',
  'capability_revision',
  'work_class_ref',
  'occupancy_ref',
  'active_implementation_ref',
  'active_substrate',
  'learning_policy_ref',
  'learning_policy_revision',
  'evidence_profile_ref',
  'decision',
  'target_substrate',
  'candidate_implementation_ref',
  'assessment_ref',
  'construction_ref',
  'proposal_ref',
  'decision_evidence_ref',
]);

const LEARNING_FORBIDDEN_KEYS = new Set([
  ...BASE_RECONCILIATION_FORBIDDEN_KEYS,
  'capability',
  'implementation',
  'candidate',
  'profile',
  'policy',
  'proposal',
  'assessment',
  'semantic_contract',
  'authority_contract',
  'evidence_contract',
  'learning_policy',
]);

function assertEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new TypeError(`${label} has unsupported value: ${String(value)}`);
  }
  return value;
}

function assertPositiveInteger(value, label) {
  assertNonNegativeInteger(value, label);
  if (value < 1) throw new RangeError(`${label} must be at least 1`);
  return value;
}

function assertRefArray(value, label, { minimum = 0 } = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (value.length < minimum) throw new Error(`${label} must contain at least ${minimum} reference(s)`);
  for (const ref of value) assertInstitutionalRef(ref, `${label}[]`);
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates`);
  return value;
}

export function validateWakeHint(hint) {
  return validateWakeHintBase(hint, {
    reconcilerRef: SEDIMENTATION_RECONCILER_REF,
    forbiddenKeys: LEARNING_FORBIDDEN_KEYS,
  });
}

export function validateLearningPolicy(policy) {
  assertPlainObject(policy, 'learning policy');
  assertOnlyFields(policy, policyFields, 'learning policy');
  assertPositiveInteger(policy.minimum_observed_runs, 'minimum_observed_runs');
  assertPositiveInteger(policy.minimum_stable_runs, 'minimum_stable_runs');
  assertPositiveInteger(policy.minimum_assessment_runs, 'minimum_assessment_runs');
  if (policy.minimum_stable_runs > policy.minimum_observed_runs) {
    throw new Error('minimum_stable_runs cannot exceed minimum_observed_runs');
  }
  assertPositiveInteger(policy.minimum_window_seconds, 'minimum_window_seconds');
  assertPositiveInteger(policy.profile_stale_after_seconds, 'profile_stale_after_seconds');
  assertRatio(policy.maximum_exception_rate, 'maximum_exception_rate');
  assertNonNegativeInteger(policy.maximum_contradictions, 'maximum_contradictions');
  assertNonNegativeInteger(policy.maximum_workarounds, 'maximum_workarounds');
  assertRatio(policy.maximum_residual_uncertainty, 'maximum_residual_uncertainty');
  assertRatio(policy.minimum_savings_ratio, 'minimum_savings_ratio');
  assertRatio(policy.minimum_cognition_reduction, 'minimum_cognition_reduction');
  assertRatio(policy.maximum_quality_regression, 'maximum_quality_regression');
  assertRatio(policy.maximum_latency_regression, 'maximum_latency_regression');
  assertRatio(policy.soften_exception_rate, 'soften_exception_rate');
  assertPositiveInteger(policy.soften_contradictions, 'soften_contradictions');
  assertPositiveInteger(policy.soften_workarounds, 'soften_workarounds');
  assertRatio(policy.soften_residual_uncertainty, 'soften_residual_uncertainty');
  if (policy.soften_exception_rate < policy.maximum_exception_rate) {
    throw new Error('soften_exception_rate must not be stricter than maximum_exception_rate');
  }
  if (policy.soften_residual_uncertainty < policy.maximum_residual_uncertainty) {
    throw new Error('soften_residual_uncertainty must not be stricter than maximum_residual_uncertainty');
  }
  if (!Array.isArray(policy.allowed_substrates) || policy.allowed_substrates.length === 0) {
    throw new TypeError('allowed_substrates must be a non-empty array');
  }
  for (const substrate of policy.allowed_substrates) assertEnum(substrate, substrateSet, 'allowed_substrates[]');
  if (new Set(policy.allowed_substrates).size !== policy.allowed_substrates.length) {
    throw new Error('allowed_substrates must not contain duplicates');
  }
  if (policy.allowed_substrates[0] !== 'inference') {
    throw new Error('allowed_substrates must begin with inference');
  }
  for (let index = 0; index < policy.allowed_substrates.length; index += 1) {
    if (policy.allowed_substrates[index] !== SUBSTRATES[index]) {
      throw new Error('allowed_substrates must be a contiguous prefix of the canonical substrate order');
    }
  }
  return policy;
}

export function validateCapabilityOccupancy(occupancy) {
  assertPlainObject(occupancy, 'capability occupancy');
  assertOnlyFields(occupancy, occupancyFields, 'capability occupancy');
  assertInstitutionalRef(occupancy.ref, 'CapabilityOccupancyRef');
  assertInstitutionalRef(occupancy.implementation_ref, 'ImplementationRef');
  assertGeneration(occupancy.implementation_revision, 'implementation_revision');
  assertEnum(occupancy.substrate, substrateSet, 'occupancy substrate');
  assertEnum(occupancy.status, new Set(['active', 'degraded']), 'occupancy status');
  assertOptionalInstitutionalRef(occupancy.fallback_implementation_ref, 'FallbackImplementationRef');
  if (occupancy.fallback_implementation_revision != null) {
    assertGeneration(occupancy.fallback_implementation_revision, 'fallback_implementation_revision');
  }
  if (occupancy.fallback_substrate != null) {
    assertEnum(occupancy.fallback_substrate, substrateSet, 'fallback_substrate');
  }
  assertRatio(occupancy.cognition_fraction, 'cognition_fraction');
  assertIsoTimestamp(occupancy.activated_at, 'activated_at');
  const fallbackFields = [
    occupancy.fallback_implementation_ref,
    occupancy.fallback_implementation_revision,
    occupancy.fallback_substrate,
  ];
  const fallbackCount = fallbackFields.filter((value) => value != null).length;
  if (occupancy.substrate === 'inference') {
    if (occupancy.cognition_fraction !== 1) {
      throw new Error('inference occupancy cognition_fraction must be 1');
    }
    if (fallbackCount !== 0) throw new Error('inference occupancy must not declare a fallback');
  } else {
    if (fallbackCount !== fallbackFields.length) {
      throw new Error('non-inference occupancy requires a complete inference fallback');
    }
    if (occupancy.fallback_substrate !== 'inference') {
      throw new Error('v1 fallback_substrate must be inference');
    }
    if (occupancy.cognition_fraction >= 1) {
      throw new Error('non-inference occupancy must reduce cognition fraction');
    }
    if (occupancy.substrate === 'fixed' && occupancy.cognition_fraction !== 0) {
      throw new Error('fixed occupancy cognition_fraction must be 0');
    }
  }
  if (occupancy.fallback_implementation_ref === occupancy.implementation_ref) {
    throw new Error('fallback implementation must differ from active implementation');
  }
  return occupancy;
}

export function validateLearningScope(scope, expectedRef = null) {
  assertPlainObject(scope, 'capability learning scope');
  assertOnlyFields(scope, scopeFields, 'capability learning scope');
  assertInstitutionalRef(scope.ref, 'CapabilityLearningScopeRef');
  if (expectedRef != null && scope.ref !== expectedRef) {
    throw new Error(`learning scope mismatch: ${scope.ref} != ${expectedRef}`);
  }
  assertInstitutionalRef(scope.capability_ref, 'CapabilityRef');
  assertGeneration(scope.capability_revision, 'capability_revision');
  assertInstitutionalRef(scope.work_class_ref, 'WorkClassRef');
  assertInstitutionalRef(scope.semantic_contract_ref, 'SemanticContractRef');
  assertInstitutionalRef(scope.authority_contract_ref, 'AuthorityContractRef');
  assertInstitutionalRef(scope.evidence_contract_ref, 'EvidenceContractRef');
  assertInstitutionalRef(scope.learning_policy_ref, 'LearningPolicyRef');
  assertGeneration(scope.learning_policy_revision, 'learning_policy_revision');
  validateCapabilityOccupancy(scope.active_occupancy);
  validateLearningPolicy(scope.learning_policy);
  if (!scope.learning_policy.allowed_substrates.includes(scope.active_occupancy.substrate)) {
    throw new Error('active substrate is not admitted by the learning policy');
  }
  return scope;
}

export function validateWorkProfile(profile, scope) {
  assertPlainObject(profile, 'work-class profile');
  assertOnlyFields(profile, profileFields, 'work-class profile');
  assertInstitutionalRef(profile.ref, 'WorkProfileRef');
  assertInstitutionalRef(profile.scope_ref, 'CapabilityLearningScopeRef');
  assertInstitutionalRef(profile.capability_ref, 'CapabilityRef');
  assertGeneration(profile.capability_revision, 'profile capability_revision');
  assertInstitutionalRef(profile.work_class_ref, 'WorkClassRef');
  assertInstitutionalRef(profile.occupancy_ref, 'CapabilityOccupancyRef');
  assertInstitutionalRef(profile.implementation_ref, 'ImplementationRef');
  if (profile.scope_ref !== scope.ref) throw new Error('work profile belongs to a different learning scope');
  if (profile.capability_ref !== scope.capability_ref || profile.capability_revision !== scope.capability_revision) {
    throw new Error('work profile belongs to a different capability revision');
  }
  if (profile.work_class_ref !== scope.work_class_ref) throw new Error('work profile belongs to a different work class');
  if (profile.occupancy_ref !== scope.active_occupancy.ref) throw new Error('work profile belongs to a stale occupancy');
  if (profile.implementation_ref !== scope.active_occupancy.implementation_ref) {
    throw new Error('work profile belongs to a stale implementation');
  }
  const start = Date.parse(assertIsoTimestamp(profile.window_started_at, 'window_started_at'));
  const end = Date.parse(assertIsoTimestamp(profile.window_ended_at, 'window_ended_at'));
  if (end < start) throw new Error('work profile window ends before it starts');
  assertNonNegativeInteger(profile.observed_runs, 'observed_runs');
  assertNonNegativeInteger(profile.stable_runs, 'stable_runs');
  assertNonNegativeInteger(profile.exception_count, 'exception_count');
  assertNonNegativeInteger(profile.contradiction_count, 'contradiction_count');
  assertNonNegativeInteger(profile.workaround_count, 'workaround_count');
  if (profile.stable_runs > profile.observed_runs) throw new Error('stable_runs cannot exceed observed_runs');
  if (profile.exception_count > profile.observed_runs) throw new Error('exception_count cannot exceed observed_runs');
  if (profile.stable_runs + profile.exception_count > profile.observed_runs) {
    throw new Error('stable_runs and exception_count cannot exceed observed_runs together');
  }
  assertRatio(profile.exception_rate, 'exception_rate');
  const expectedExceptionRate = profile.observed_runs === 0 ? 0 : profile.exception_count / profile.observed_runs;
  if (Math.abs(profile.exception_rate - expectedExceptionRate) > 1e-12) {
    throw new Error('exception_rate must be derived from exception_count / observed_runs');
  }
  assertRatio(profile.residual_uncertainty, 'residual_uncertainty');
  assertRatio(profile.quality_score, 'quality_score');
  assertRatio(profile.baseline_quality_score, 'baseline_quality_score');
  assertFiniteNumber(profile.cost_per_run, 'cost_per_run');
  assertFiniteNumber(profile.latency_ms, 'latency_ms');
  if (profile.cost_per_run < 0 || profile.latency_ms < 0) throw new RangeError('cost_per_run and latency_ms must be non-negative');
  assertEnum(profile.epistemic_state, epistemicStateSet, 'epistemic_state');
  assertOptionalInstitutionalRef(profile.distribution_ref, 'DistributionRef');
  assertRefArray(profile.evidence_refs, 'evidence_refs', { minimum: 1 });
  return profile;
}


export function isWorkProfileFresh(profile, scope, now = new Date()) {
  validateWorkProfile(profile, scope);
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) throw new TypeError('now must be a valid Date');
  const endedAt = Date.parse(profile.window_ended_at);
  if (endedAt > current.getTime()) return false;
  return current.getTime() - endedAt
    <= scope.learning_policy.profile_stale_after_seconds * 1000;
}

export function validateCandidate(candidate, scope, targetSubstrate) {
  assertPlainObject(candidate, 'capability implementation candidate');
  assertOnlyFields(candidate, candidateFields, 'capability implementation candidate');
  assertInstitutionalRef(candidate.ref, 'CandidateImplementationRef');
  assertInstitutionalRef(candidate.scope_ref, 'CapabilityLearningScopeRef');
  assertInstitutionalRef(candidate.capability_ref, 'CapabilityRef');
  assertGeneration(candidate.capability_revision, 'capability_revision');
  assertInstitutionalRef(candidate.work_class_ref, 'WorkClassRef');
  assertGeneration(candidate.implementation_revision, 'implementation_revision');
  assertEnum(candidate.target_substrate, substrateSet, 'target_substrate');
  assertEnum(candidate.status, candidateStateSet, 'candidate status');
  assertInstitutionalRef(candidate.semantic_contract_ref, 'SemanticContractRef');
  assertInstitutionalRef(candidate.authority_contract_ref, 'AuthorityContractRef');
  assertInstitutionalRef(candidate.evidence_contract_ref, 'EvidenceContractRef');
  assertInstitutionalRef(candidate.equivalence_contract_ref, 'EquivalenceContractRef');
  assertInstitutionalRef(candidate.fallback_implementation_ref, 'FallbackImplementationRef');
  assertGeneration(candidate.fallback_implementation_revision, 'fallback_implementation_revision');
  assertEnum(candidate.fallback_substrate, substrateSet, 'candidate fallback_substrate');
  if (candidate.fallback_substrate !== 'inference') {
    throw new Error('v1 candidate fallback_substrate must be inference');
  }
  assertRatio(candidate.residual_uncertainty, 'candidate residual_uncertainty');
  assertRatio(candidate.expected_cognition_fraction, 'expected_cognition_fraction');
  assertFiniteNumber(candidate.expected_cost_per_run, 'expected_cost_per_run');
  assertFiniteNumber(candidate.expected_latency_ms, 'expected_latency_ms');
  if (candidate.expected_cost_per_run < 0 || candidate.expected_latency_ms < 0) {
    throw new RangeError('expected cost and latency must be non-negative');
  }
  assertRatio(candidate.expected_quality_score, 'expected_quality_score');
  assertInstitutionalRef(candidate.artifact_ref, 'ArtifactRef');
  assertInstitutionalRef(candidate.authored_by, 'CandidateAuthorRef');
  assertIsoTimestamp(candidate.created_at, 'candidate created_at');

  if (candidate.scope_ref !== scope.ref) throw new Error('candidate belongs to a different learning scope');
  if (candidate.capability_ref !== scope.capability_ref || candidate.capability_revision !== scope.capability_revision) {
    throw new Error('candidate changes capability identity or revision');
  }
  if (candidate.work_class_ref !== scope.work_class_ref) throw new Error('candidate changes work-class scope');
  if (candidate.semantic_contract_ref !== scope.semantic_contract_ref) throw new Error('candidate changes capability semantics');
  if (candidate.authority_contract_ref !== scope.authority_contract_ref) throw new Error('candidate changes authority requirements');
  if (candidate.evidence_contract_ref !== scope.evidence_contract_ref) throw new Error('candidate changes evidence obligations');
  if (candidate.target_substrate !== targetSubstrate) throw new Error('candidate targets a different substrate');
  if (candidate.expected_cognition_fraction >= scope.active_occupancy.cognition_fraction) {
    throw new Error('candidate does not reduce cognition fraction');
  }
  if (candidate.target_substrate === 'fixed' && candidate.expected_cognition_fraction !== 0) {
    throw new Error('fixed candidate expected_cognition_fraction must be 0');
  }
  const activeFallback = scope.active_occupancy.substrate === 'inference'
    ? {
        ref: scope.active_occupancy.implementation_ref,
        revision: scope.active_occupancy.implementation_revision,
        substrate: scope.active_occupancy.substrate,
      }
    : {
        ref: scope.active_occupancy.fallback_implementation_ref,
        revision: scope.active_occupancy.fallback_implementation_revision,
        substrate: scope.active_occupancy.fallback_substrate,
      };
  if (candidate.fallback_implementation_ref !== activeFallback.ref
      || candidate.fallback_implementation_revision !== activeFallback.revision
      || candidate.fallback_substrate !== activeFallback.substrate) {
    throw new Error('candidate fallback is not the admitted inference lineage');
  }
  return candidate;
}

export function validateEquivalenceAssessment(assessment, candidate, profile) {
  assertPlainObject(assessment, 'equivalence assessment');
  assertOnlyFields(assessment, assessmentFields, 'equivalence assessment');
  assertInstitutionalRef(assessment.ref, 'EquivalenceAssessmentRef');
  assertInstitutionalRef(assessment.scope_ref, 'CapabilityLearningScopeRef');
  assertInstitutionalRef(assessment.capability_ref, 'CapabilityRef');
  assertGeneration(assessment.capability_revision, 'assessment capability_revision');
  assertInstitutionalRef(assessment.work_class_ref, 'WorkClassRef');
  assertInstitutionalRef(assessment.candidate_ref, 'CandidateImplementationRef');
  assertGeneration(assessment.candidate_revision, 'candidate_revision');
  assertInstitutionalRef(assessment.profile_ref, 'WorkProfileRef');
  assertInstitutionalRef(assessment.equivalence_contract_ref, 'EquivalenceContractRef');
  if (assessment.scope_ref !== candidate.scope_ref) throw new Error('assessment belongs to a different learning scope');
  if (assessment.capability_ref !== candidate.capability_ref || assessment.capability_revision !== candidate.capability_revision) {
    throw new Error('assessment belongs to a different capability revision');
  }
  if (assessment.work_class_ref !== candidate.work_class_ref) throw new Error('assessment belongs to a different work class');
  if (assessment.candidate_ref !== candidate.ref || assessment.candidate_revision !== candidate.implementation_revision) {
    throw new Error('assessment belongs to a different candidate revision');
  }
  if (assessment.profile_ref !== profile.ref) throw new Error('assessment belongs to a different work profile');
  if (assessment.equivalence_contract_ref !== candidate.equivalence_contract_ref) {
    throw new Error('assessment used a different equivalence contract');
  }
  assertEnum(assessment.state, epistemicStateSet, 'assessment state');
  if (typeof assessment.independent !== 'boolean') throw new TypeError('assessment independent must be boolean');
  assertInstitutionalRef(assessment.evaluated_by, 'EvaluatorRef');
  if (assessment.evaluated_by === candidate.authored_by) {
    throw new Error('candidate author cannot be the independent evaluator');
  }
  assertPositiveInteger(assessment.observed_runs, 'assessment observed_runs');
  assertNonNegativeInteger(assessment.exception_count, 'assessment exception_count');
  assertNonNegativeInteger(assessment.contradiction_count, 'assessment contradiction_count');
  if (assessment.exception_count > assessment.observed_runs) {
    throw new Error('assessment exception_count cannot exceed observed_runs');
  }
  assertRatio(assessment.quality_regression, 'quality_regression');
  assertRatio(assessment.residual_uncertainty, 'assessment residual_uncertainty');
  assertRatio(assessment.observed_cognition_fraction, 'observed_cognition_fraction');
  if (candidate.target_substrate === 'fixed' && assessment.observed_cognition_fraction !== 0) {
    throw new Error('fixed assessment observed_cognition_fraction must be 0');
  }
  assertFiniteNumber(assessment.observed_cost_per_run, 'observed_cost_per_run');
  assertFiniteNumber(assessment.observed_latency_ms, 'observed_latency_ms');
  if (assessment.observed_cost_per_run < 0 || assessment.observed_latency_ms < 0) {
    throw new RangeError('observed cost and latency must be non-negative');
  }
  assertRatio(assessment.observed_quality_score, 'observed_quality_score');
  const expectedRegression = Math.max(0, profile.baseline_quality_score - assessment.observed_quality_score);
  if (Math.abs(assessment.quality_regression - expectedRegression) > 1e-12) {
    throw new Error('quality_regression must be derived from baseline and observed quality');
  }
  assertRefArray(assessment.evidence_refs, 'assessment evidence_refs', { minimum: 1 });
  const evaluatedAt = Date.parse(assertIsoTimestamp(assessment.evaluated_at, 'assessment evaluated_at'));
  if (evaluatedAt < Date.parse(candidate.created_at)) {
    throw new Error('assessment predates the candidate');
  }
  if (evaluatedAt < Date.parse(profile.window_ended_at)) {
    throw new Error('assessment predates the work profile it claims to evaluate against');
  }
  return assessment;
}

export function validateConstructionResponsibility(value) {
  assertPlainObject(value, 'construction responsibility');
  assertOnlyFields(value, responsibilityFields, 'construction responsibility');
  assertInstitutionalRef(value.ref, 'ConstructionResponsibilityRef');
  if (typeof value.created !== 'boolean') throw new TypeError('construction responsibility created must be boolean');
  if (typeof value.state !== 'string' || value.state.length === 0) throw new TypeError('construction responsibility state required');
  assertEnum(value.target_substrate, substrateSet, 'construction target_substrate');
  return value;
}

export function validateTransitionProposal(value) {
  assertPlainObject(value, 'capability transition proposal');
  assertOnlyFields(value, proposalFields, 'capability transition proposal');
  assertInstitutionalRef(value.ref, 'CapabilityTransitionProposalRef');
  if (typeof value.created !== 'boolean') throw new TypeError('transition proposal created must be boolean');
  if (typeof value.state !== 'string' || value.state.length === 0) throw new TypeError('transition proposal state required');
  assertEnum(value.direction, new Set(TRANSITION_DIRECTIONS), 'transition direction');
  assertInstitutionalRef(value.capability_ref, 'CapabilityRef');
  assertGeneration(value.capability_revision, 'proposal capability_revision');
  assertInstitutionalRef(value.work_class_ref, 'WorkClassRef');
  assertInstitutionalRef(value.learning_policy_ref, 'LearningPolicyRef');
  assertGeneration(value.learning_policy_revision, 'proposal learning_policy_revision');
  assertInstitutionalRef(value.from_occupancy_ref, 'FromOccupancyRef');
  assertInstitutionalRef(value.from_implementation_ref, 'FromImplementationRef');
  assertGeneration(value.from_implementation_revision, 'from_implementation_revision');
  assertEnum(value.from_substrate, substrateSet, 'from_substrate');
  assertInstitutionalRef(value.to_implementation_ref, 'ToImplementationRef');
  assertGeneration(value.to_implementation_revision, 'to_implementation_revision');
  assertEnum(value.to_substrate, substrateSet, 'to_substrate');
  assertRatio(value.to_cognition_fraction, 'to_cognition_fraction');
  assertInstitutionalRef(value.semantic_contract_ref, 'SemanticContractRef');
  assertInstitutionalRef(value.authority_contract_ref, 'AuthorityContractRef');
  assertInstitutionalRef(value.evidence_contract_ref, 'EvidenceContractRef');
  assertOptionalInstitutionalRef(value.equivalence_contract_ref, 'EquivalenceContractRef');
  assertInstitutionalRef(value.profile_ref, 'WorkProfileRef');
  assertOptionalInstitutionalRef(value.assessment_ref, 'EquivalenceAssessmentRef');
  assertInstitutionalRef(value.fallback_implementation_ref, 'FallbackImplementationRef');
  assertGeneration(value.fallback_implementation_revision, 'proposal fallback_implementation_revision');
  assertEnum(value.fallback_substrate, substrateSet, 'proposal fallback_substrate');
  if (value.fallback_substrate !== 'inference') throw new Error('proposal fallback_substrate must be inference');
  if (value.from_implementation_ref === value.to_implementation_ref
      && value.from_implementation_revision === value.to_implementation_revision) {
    throw new Error('transition proposal must change implementation occupancy');
  }
  const fromIndex = SUBSTRATES.indexOf(value.from_substrate);
  const toIndex = SUBSTRATES.indexOf(value.to_substrate);
  if (value.direction === 'harden' && toIndex !== fromIndex + 1) {
    throw new Error('hardening proposal must move exactly one substrate rung');
  }
  if (value.direction === 'soften' && value.to_substrate !== 'inference') {
    throw new Error('v1 softening proposal must return to the admitted inference fallback');
  }
  if (value.to_substrate === 'inference' && value.to_cognition_fraction !== 1) {
    throw new Error('inference proposal cognition fraction must be 1');
  }
  if (value.to_substrate === 'fixed' && value.to_cognition_fraction !== 0) {
    throw new Error('fixed proposal cognition fraction must be 0');
  }
  return value;
}

export function validateSedimentationSummary(summary) {
  assertPlainObject(summary, 'sedimentation reconciliation summary');
  assertCompactJson(summary, {
    label: 'sedimentation reconciliation summary',
    maxBytes: MAX_RECONCILIATION_SUMMARY_BYTES,
    forbiddenKeys: LEARNING_FORBIDDEN_KEYS,
  });
  assertOnlyFields(summary, summaryFields, 'sedimentation reconciliation summary');
  assertEnum(summary.state, summaryStateSet, 'summary state');
  assertInstitutionalRef(summary.scope, 'CapabilityLearningScopeRef');
  assertInstitutionalRef(summary.beat_ref, 'BeatRef');
  assertIsoTimestamp(summary.observed_at, 'observed_at');
  assertOptionalInstitutionalRef(summary.capability_ref, 'CapabilityRef');
  if (summary.capability_revision != null) assertGeneration(summary.capability_revision, 'capability_revision');
  assertOptionalInstitutionalRef(summary.work_class_ref, 'WorkClassRef');
  assertOptionalInstitutionalRef(summary.occupancy_ref, 'CapabilityOccupancyRef');
  assertOptionalInstitutionalRef(summary.active_implementation_ref, 'ImplementationRef');
  if (summary.active_substrate != null) assertEnum(summary.active_substrate, substrateSet, 'active_substrate');
  assertOptionalInstitutionalRef(summary.learning_policy_ref, 'LearningPolicyRef');
  if (summary.learning_policy_revision != null) assertGeneration(summary.learning_policy_revision, 'learning_policy_revision');
  assertOptionalInstitutionalRef(summary.evidence_profile_ref, 'WorkProfileRef');
  assertEnum(summary.decision, decisionSet, 'summary decision');
  if (summary.target_substrate != null) assertEnum(summary.target_substrate, substrateSet, 'target_substrate');
  assertOptionalInstitutionalRef(summary.candidate_implementation_ref, 'CandidateImplementationRef');
  assertOptionalInstitutionalRef(summary.assessment_ref, 'EquivalenceAssessmentRef');
  assertOptionalInstitutionalRef(summary.construction_ref, 'ConstructionResponsibilityRef');
  assertOptionalInstitutionalRef(summary.proposal_ref, 'CapabilityTransitionProposalRef');
  assertOptionalInstitutionalRef(summary.decision_evidence_ref, 'EvidenceRef');
  if (summary.reason != null && typeof summary.reason !== 'string') throw new TypeError('summary reason must be a string');
  return summary;
}

export {
  assertGeneration,
  assertInstitutionalRef,
  validateCallerContext,
};
