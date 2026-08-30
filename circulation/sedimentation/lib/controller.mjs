import {
  CAPABILITY_LEARNING_CONTRACT_ID,
  SUBSTRATES,
  assertGeneration,
  assertInstitutionalRef,
  isWorkProfileFresh,
  validateCandidate,
  validateConstructionResponsibility,
  validateEquivalenceAssessment,
  validateLearningScope,
  validateSedimentationSummary,
  validateTransitionProposal,
  validateWorkProfile,
} from './contract.mjs';
import {
  assertPlainObject,
  normalizeDate,
  requireMethod,
} from '../../lib/contract.mjs';

const hex = (buffer) => [...new Uint8Array(buffer)]
  .map((value) => value.toString(16).padStart(2, '0'))
  .join('');

async function semanticDigest(parts) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(parts)),
  );
  return `sha256:${hex(digest)}`;
}

export async function sedimentationObligationKey({
  scopeRef,
  capabilityRevision,
  learningPolicyRef,
  learningPolicyRevision,
  occupancyRef,
  decision,
  targetSubstrate = null,
  candidateRef = null,
  candidateRevision = null,
}) {
  assertInstitutionalRef(scopeRef, 'CapabilityLearningScopeRef');
  assertGeneration(capabilityRevision, 'capability_revision');
  assertInstitutionalRef(learningPolicyRef, 'LearningPolicyRef');
  assertGeneration(learningPolicyRevision, 'learning_policy_revision');
  assertInstitutionalRef(occupancyRef, 'CapabilityOccupancyRef');
  if (candidateRef != null) assertInstitutionalRef(candidateRef, 'CandidateImplementationRef');
  if (candidateRevision != null) assertGeneration(candidateRevision, 'candidate_revision');
  return semanticDigest([
    CAPABILITY_LEARNING_CONTRACT_ID,
    'sedimentation-obligation',
    scopeRef,
    capabilityRevision,
    learningPolicyRef,
    learningPolicyRevision,
    occupancyRef,
    decision,
    targetSubstrate,
    candidateRef,
    candidateRevision,
  ]);
}

export async function sedimentationDecisionKey({
  profileRef,
  assessmentRef = null,
  ...obligation
}) {
  assertInstitutionalRef(profileRef, 'WorkProfileRef');
  if (assessmentRef != null) assertInstitutionalRef(assessmentRef, 'EquivalenceAssessmentRef');
  const obligationKey = await sedimentationObligationKey(obligation);
  return semanticDigest([
    CAPABILITY_LEARNING_CONTRACT_ID,
    'sedimentation-decision-evidence',
    obligationKey,
    profileRef,
    assessmentRef,
  ]);
}

async function decisionKeys({
  scope,
  profile,
  decision,
  targetSubstrate = null,
  candidate = null,
  candidateRef = candidate?.ref ?? null,
  candidateRevision = candidate?.implementation_revision ?? null,
  assessment = null,
}) {
  const base = {
    scopeRef: scope.ref,
    capabilityRevision: scope.capability_revision,
    learningPolicyRef: scope.learning_policy_ref,
    learningPolicyRevision: scope.learning_policy_revision,
    occupancyRef: scope.active_occupancy.ref,
    decision,
    targetSubstrate,
    candidateRef,
    candidateRevision,
  };
  const obligationKey = await sedimentationObligationKey(base);
  const evidenceKey = await sedimentationDecisionKey({
    ...base,
    profileRef: profile.ref,
    assessmentRef: assessment?.ref ?? null,
  });
  return { obligationKey, evidenceKey };
}

export function nextSubstrate(activeSubstrate, allowedSubstrates) {
  const current = allowedSubstrates.indexOf(activeSubstrate);
  if (current < 0) throw new Error(`active substrate is not admitted: ${activeSubstrate}`);
  return allowedSubstrates[current + 1] ?? null;
}

export function shouldSoften(scope, profile) {
  const occupancy = scope.active_occupancy;
  const policy = scope.learning_policy;
  if (occupancy.substrate === 'inference') return false;
  return occupancy.status === 'degraded'
    || profile.epistemic_state === 'contradicted'
    || profile.exception_rate >= policy.soften_exception_rate
    || profile.contradiction_count >= policy.soften_contradictions
    || profile.workaround_count >= policy.soften_workarounds
    || profile.residual_uncertainty >= policy.soften_residual_uncertainty;
}

export function stableEnoughToHarden(scope, profile) {
  const policy = scope.learning_policy;
  const windowSeconds = (Date.parse(profile.window_ended_at) - Date.parse(profile.window_started_at)) / 1000;
  const currentQualityRegression = Math.max(0, profile.baseline_quality_score - profile.quality_score);
  return scope.active_occupancy.status === 'active'
    && ['evidenced', 'verified'].includes(profile.epistemic_state)
    && profile.observed_runs >= policy.minimum_observed_runs
    && profile.stable_runs >= policy.minimum_stable_runs
    && windowSeconds >= policy.minimum_window_seconds
    && profile.exception_rate <= policy.maximum_exception_rate
    && profile.contradiction_count <= policy.maximum_contradictions
    && profile.workaround_count <= policy.maximum_workarounds
    && profile.residual_uncertainty <= policy.maximum_residual_uncertainty
    && currentQualityRegression <= policy.maximum_quality_regression
    && profile.distribution_ref != null;
}

export function expectedSavingsRatio(currentCost, candidateCost) {
  if (currentCost <= 0) return 0;
  return Math.max(0, (currentCost - candidateCost) / currentCost);
}

export function latencyRegressionRatio(currentLatency, candidateLatency) {
  if (candidateLatency <= currentLatency) return 0;
  if (currentLatency <= 0) return Number.POSITIVE_INFINITY;
  return (candidateLatency - currentLatency) / currentLatency;
}

export function cognitionReduction(currentFraction, candidateFraction) {
  return Math.max(0, currentFraction - candidateFraction);
}

function validatePorts({ registry, evidence, imagineering, process }) {
  requireMethod(registry, 'resolveLearningScope', 'registry');
  requireMethod(registry, 'findCandidate', 'registry');
  requireMethod(evidence, 'profileWorkClass', 'evidence');
  requireMethod(evidence, 'assessCandidate', 'evidence');
  requireMethod(evidence, 'recordDecision', 'evidence');
  requireMethod(imagineering, 'ensureConstruction', 'imagineering');
  requireMethod(imagineering, 'ensureEvaluation', 'imagineering');
  requireMethod(process, 'ensureTransitionProposal', 'process');
}

function baseSummary({ scopeRef, beatRef, observedAt, scope = null, profile = null }) {
  return {
    state: 'reconciled',
    scope: scopeRef,
    beat_ref: beatRef,
    observed_at: observedAt,
    capability_ref: scope?.capability_ref ?? null,
    capability_revision: scope?.capability_revision ?? null,
    work_class_ref: scope?.work_class_ref ?? null,
    occupancy_ref: scope?.active_occupancy?.ref ?? null,
    active_implementation_ref: scope?.active_occupancy?.implementation_ref ?? null,
    active_substrate: scope?.active_occupancy?.substrate ?? null,
    learning_policy_ref: scope?.learning_policy_ref ?? null,
    learning_policy_revision: scope?.learning_policy_revision ?? null,
    evidence_profile_ref: profile?.ref ?? null,
  };
}

function compactSummary(summary) {
  return Object.fromEntries(Object.entries(summary).filter(([, value]) => value != null));
}

async function recordDecision({ evidence, key, obligationKey, kind, scope, profile, observedAt, extra = {} }) {
  const record = assertPlainObject(await evidence.recordDecision({
    idempotency_key: key,
    obligation_key: obligationKey,
    kind,
    scope_ref: scope.ref,
    capability_ref: scope.capability_ref,
    capability_revision: scope.capability_revision,
    work_class_ref: scope.work_class_ref,
    learning_policy_ref: scope.learning_policy_ref,
    learning_policy_revision: scope.learning_policy_revision,
    occupancy_ref: scope.active_occupancy.ref,
    implementation_ref: scope.active_occupancy.implementation_ref,
    substrate: scope.active_occupancy.substrate,
    profile_ref: profile.ref,
    observed_at: observedAt,
    ...extra,
  }), 'Evidence decision record');
  assertInstitutionalRef(record.ref, 'EvidenceRef');
  return record.ref;
}

async function requestConstruction({
  scope,
  profile,
  targetSubstrate,
  beatRef,
  observedAt,
  candidate = null,
  reason,
  imagineering,
  evidence,
}) {
  const { obligationKey, evidenceKey } = await decisionKeys({
    scope,
    profile,
    decision: 'construction',
    targetSubstrate,
    candidate,
  });
  const responsibility = validateConstructionResponsibility(await imagineering.ensureConstruction({
    idempotencyKey: obligationKey,
    scopeRef: scope.ref,
    capabilityRef: scope.capability_ref,
    capabilityRevision: scope.capability_revision,
    workClassRef: scope.work_class_ref,
    learningPolicyRef: scope.learning_policy_ref,
    learningPolicyRevision: scope.learning_policy_revision,
    fromOccupancyRef: scope.active_occupancy.ref,
    fromImplementationRef: scope.active_occupancy.implementation_ref,
    fromImplementationRevision: scope.active_occupancy.implementation_revision,
    targetSubstrate,
    semanticContractRef: scope.semantic_contract_ref,
    authorityContractRef: scope.authority_contract_ref,
    evidenceContractRef: scope.evidence_contract_ref,
    fallbackImplementationRef: scope.active_occupancy.substrate === 'inference'
      ? scope.active_occupancy.implementation_ref
      : scope.active_occupancy.fallback_implementation_ref,
    fallbackImplementationRevision: scope.active_occupancy.substrate === 'inference'
      ? scope.active_occupancy.implementation_revision
      : scope.active_occupancy.fallback_implementation_revision,
    fallbackSubstrate: 'inference',
    profileRef: profile.ref,
    replacesCandidateRef: candidate?.ref ?? null,
    replacesCandidateRevision: candidate?.implementation_revision ?? null,
    reason,
    beatRef,
    observedAt,
  }));
  const decisionEvidenceRef = await recordDecision({
    evidence,
    key: evidenceKey,
    obligationKey,
    kind: 'capability.learning.construction-requested',
    scope,
    profile,
    observedAt,
    extra: {
      construction_ref: responsibility.ref,
      target_substrate: targetSubstrate,
      candidate_ref: candidate?.ref ?? null,
      candidate_revision: candidate?.implementation_revision ?? null,
      reason,
    },
  });
  return { responsibility, decisionEvidenceRef };
}

async function requestEvaluation({
  scope,
  profile,
  candidate,
  targetSubstrate,
  beatRef,
  observedAt,
  assessment = null,
  imagineering,
  evidence,
}) {
  const { obligationKey, evidenceKey } = await decisionKeys({
    scope,
    profile,
    decision: 'evaluation',
    targetSubstrate,
    candidate,
    assessment,
  });
  const responsibility = validateConstructionResponsibility(await imagineering.ensureEvaluation({
    idempotencyKey: obligationKey,
    scopeRef: scope.ref,
    capabilityRef: scope.capability_ref,
    capabilityRevision: scope.capability_revision,
    workClassRef: scope.work_class_ref,
    learningPolicyRef: scope.learning_policy_ref,
    learningPolicyRevision: scope.learning_policy_revision,
    candidateImplementationRef: candidate.ref,
    candidateImplementationRevision: candidate.implementation_revision,
    equivalenceContractRef: candidate.equivalence_contract_ref,
    targetSubstrate,
    profileRef: profile.ref,
    priorAssessmentRef: assessment?.ref ?? null,
    beatRef,
    observedAt,
  }));
  const decisionEvidenceRef = await recordDecision({
    evidence,
    key: evidenceKey,
    obligationKey,
    kind: 'capability.learning.evaluation-requested',
    scope,
    profile,
    observedAt,
    extra: {
      construction_ref: responsibility.ref,
      candidate_ref: candidate.ref,
      candidate_revision: candidate.implementation_revision,
      assessment_ref: assessment?.ref ?? null,
      target_substrate: targetSubstrate,
    },
  });
  return { responsibility, decisionEvidenceRef };
}

async function proposeTransition({
  direction,
  scope,
  profile,
  toImplementationRef,
  toImplementationRevision,
  targetSubstrate,
  toCognitionFraction,
  candidate = null,
  assessment = null,
  beatRef,
  observedAt,
  process,
  evidence,
}) {
  const candidateRef = candidate?.ref ?? toImplementationRef;
  const candidateRevision = candidate?.implementation_revision ?? toImplementationRevision;
  const { obligationKey, evidenceKey } = await decisionKeys({
    scope,
    profile,
    decision: direction,
    targetSubstrate,
    candidateRef,
    candidateRevision,
    assessment,
  });
  const fallbackImplementationRef = candidate?.fallback_implementation_ref
    ?? scope.active_occupancy.fallback_implementation_ref
    ?? toImplementationRef;
  const fallbackImplementationRevision = candidate?.fallback_implementation_revision
    ?? scope.active_occupancy.fallback_implementation_revision
    ?? toImplementationRevision;
  const fallbackSubstrate = candidate?.fallback_substrate
    ?? scope.active_occupancy.fallback_substrate
    ?? targetSubstrate;
  const evidenceRefs = [...new Set([
    ...profile.evidence_refs,
    ...(assessment?.evidence_refs ?? []),
  ])];

  const proposal = validateTransitionProposal(await process.ensureTransitionProposal({
    idempotencyKey: obligationKey,
    direction,
    scopeRef: scope.ref,
    capabilityRef: scope.capability_ref,
    capabilityRevision: scope.capability_revision,
    workClassRef: scope.work_class_ref,
    learningPolicyRef: scope.learning_policy_ref,
    learningPolicyRevision: scope.learning_policy_revision,
    fromOccupancyRef: scope.active_occupancy.ref,
    fromImplementationRef: scope.active_occupancy.implementation_ref,
    fromImplementationRevision: scope.active_occupancy.implementation_revision,
    fromSubstrate: scope.active_occupancy.substrate,
    toImplementationRef,
    toImplementationRevision,
    toSubstrate: targetSubstrate,
    toCognitionFraction,
    semanticContractRef: scope.semantic_contract_ref,
    authorityContractRef: scope.authority_contract_ref,
    evidenceContractRef: scope.evidence_contract_ref,
    equivalenceContractRef: candidate?.equivalence_contract_ref ?? null,
    profileRef: profile.ref,
    assessmentRef: assessment?.ref ?? null,
    fallbackImplementationRef,
    fallbackImplementationRevision,
    fallbackSubstrate,
    evidenceRefs,
    beatRef,
    observedAt,
  }));

  const expected = {
    capability_ref: scope.capability_ref,
    capability_revision: scope.capability_revision,
    work_class_ref: scope.work_class_ref,
    learning_policy_ref: scope.learning_policy_ref,
    learning_policy_revision: scope.learning_policy_revision,
    from_occupancy_ref: scope.active_occupancy.ref,
    from_implementation_ref: scope.active_occupancy.implementation_ref,
    from_implementation_revision: scope.active_occupancy.implementation_revision,
    from_substrate: scope.active_occupancy.substrate,
    to_implementation_ref: toImplementationRef,
    to_implementation_revision: toImplementationRevision,
    to_substrate: targetSubstrate,
    to_cognition_fraction: toCognitionFraction,
    semantic_contract_ref: scope.semantic_contract_ref,
    authority_contract_ref: scope.authority_contract_ref,
    evidence_contract_ref: scope.evidence_contract_ref,
    equivalence_contract_ref: candidate?.equivalence_contract_ref ?? null,
    profile_ref: profile.ref,
    assessment_ref: assessment?.ref ?? null,
    fallback_implementation_ref: fallbackImplementationRef,
    fallback_implementation_revision: fallbackImplementationRevision,
    fallback_substrate: fallbackSubstrate,
  };
  if (proposal.direction !== direction) throw new Error('Process returned proposal with different direction');
  for (const [field, value] of Object.entries(expected)) {
    if (proposal[field] !== value) throw new Error(`Process returned proposal with mismatched ${field}`);
  }

  const decisionEvidenceRef = await recordDecision({
    evidence,
    key: evidenceKey,
    obligationKey,
    kind: `capability.learning.${direction}-proposed`,
    scope,
    profile,
    observedAt,
    extra: {
      proposal_ref: proposal.ref,
      candidate_ref: candidate?.ref ?? null,
      candidate_revision: candidate?.implementation_revision ?? null,
      assessment_ref: assessment?.ref ?? null,
      to_implementation_ref: toImplementationRef,
      to_implementation_revision: toImplementationRevision,
      target_substrate: targetSubstrate,
    },
  });
  return { proposal, decisionEvidenceRef };
}

function candidatePasses(scope, profile, candidate, assessment) {
  const policy = scope.learning_policy;
  if (candidate.status !== 'verified') return false;
  if (!assessment.independent || assessment.state !== 'verified') return false;
  if (assessment.observed_runs < policy.minimum_assessment_runs) return false;
  if (assessment.contradiction_count > policy.maximum_contradictions) return false;
  const assessmentExceptionRate = assessment.exception_count / assessment.observed_runs;
  if (assessmentExceptionRate > policy.maximum_exception_rate) return false;
  if (assessment.quality_regression > policy.maximum_quality_regression) return false;
  if (assessment.residual_uncertainty > policy.maximum_residual_uncertainty) return false;
  if (candidate.residual_uncertainty > policy.maximum_residual_uncertainty) return false;
  if (latencyRegressionRatio(profile.latency_ms, assessment.observed_latency_ms)
      > policy.maximum_latency_regression) return false;
  if (cognitionReduction(
    scope.active_occupancy.cognition_fraction,
    assessment.observed_cognition_fraction,
  ) < policy.minimum_cognition_reduction) return false;
  return expectedSavingsRatio(profile.cost_per_run, assessment.observed_cost_per_run)
    >= policy.minimum_savings_ratio;
}

/**
 * One level-triggered capability-learning pass.
 *
 * The controller owns no capability, implementation, proposal, construction or
 * evidence state. It derives a decision from current organ-owned state and
 * ensures at most one durable institutional obligation through idempotent ports.
 * It never promotes or activates an implementation.
 */
export async function reconcileSedimentation({
  scopeRef,
  beatRef,
  now = new Date(),
  registry,
  evidence,
  imagineering,
  process,
}) {
  assertInstitutionalRef(scopeRef, 'CapabilityLearningScopeRef');
  assertInstitutionalRef(beatRef, 'BeatRef');
  validatePorts({ registry, evidence, imagineering, process });
  const observedAt = normalizeDate(now, 'now').toISOString();

  const rawScope = await registry.resolveLearningScope({ scopeRef, observedAt });
  if (rawScope == null) {
    return validateSedimentationSummary(compactSummary({
      ...baseSummary({ scopeRef, beatRef, observedAt }),
      state: 'blocked',
      reason: 'learning_scope_not_found',
      decision: 'blocked',
    }));
  }
  const scope = validateLearningScope(rawScope, scopeRef);
  const rawProfile = await evidence.profileWorkClass({
    scopeRef,
    capabilityRef: scope.capability_ref,
    capabilityRevision: scope.capability_revision,
    workClassRef: scope.work_class_ref,
    occupancyRef: scope.active_occupancy.ref,
    implementationRef: scope.active_occupancy.implementation_ref,
    observedAt,
  });
  if (rawProfile == null) {
    return validateSedimentationSummary(compactSummary({
      ...baseSummary({ scopeRef, beatRef, observedAt, scope }),
      state: 'blocked',
      reason: 'work_profile_missing',
      decision: 'insufficient_evidence',
    }));
  }
  const profile = validateWorkProfile(rawProfile, scope);
  const summary = baseSummary({ scopeRef, beatRef, observedAt, scope, profile });

  if (!isWorkProfileFresh(profile, scope, now)) {
    return validateSedimentationSummary(compactSummary({
      ...summary,
      state: 'blocked',
      reason: 'work_profile_stale',
      decision: 'insufficient_evidence',
    }));
  }

  if (shouldSoften(scope, profile)) {
    const fallback = scope.active_occupancy.fallback_implementation_ref;
    if (!fallback) throw new Error('hardened occupancy has no fallback implementation');
    const { proposal, decisionEvidenceRef } = await proposeTransition({
      direction: 'soften',
      scope,
      profile,
      toImplementationRef: fallback,
      toImplementationRevision: scope.active_occupancy.fallback_implementation_revision,
      targetSubstrate: scope.active_occupancy.fallback_substrate,
      toCognitionFraction: 1,
      beatRef,
      observedAt,
      process,
      evidence,
    });
    return validateSedimentationSummary(compactSummary({
      ...summary,
      decision: proposal.created ? 'softening_proposed' : 'proposal_open',
      target_substrate: scope.active_occupancy.fallback_substrate,
      proposal_ref: proposal.ref,
      decision_evidence_ref: decisionEvidenceRef,
    }));
  }

  const targetSubstrate = nextSubstrate(
    scope.active_occupancy.substrate,
    scope.learning_policy.allowed_substrates,
  );
  if (targetSubstrate == null) {
    return validateSedimentationSummary(compactSummary({
      ...summary,
      decision: 'already_fixed',
    }));
  }

  if (!stableEnoughToHarden(scope, profile)) {
    return validateSedimentationSummary(compactSummary({
      ...summary,
      state: 'blocked',
      reason: 'stability_contract_not_satisfied',
      decision: 'insufficient_evidence',
      target_substrate: targetSubstrate,
    }));
  }

  const rawCandidate = await registry.findCandidate({
    scopeRef,
    capabilityRef: scope.capability_ref,
    capabilityRevision: scope.capability_revision,
    workClassRef: scope.work_class_ref,
    targetSubstrate,
    fromImplementationRef: scope.active_occupancy.implementation_ref,
    fromImplementationRevision: scope.active_occupancy.implementation_revision,
    learningPolicyRef: scope.learning_policy_ref,
    learningPolicyRevision: scope.learning_policy_revision,
    observedAt,
  });

  if (rawCandidate == null) {
    const { responsibility, decisionEvidenceRef } = await requestConstruction({
      scope,
      profile,
      targetSubstrate,
      beatRef,
      observedAt,
      reason: 'stable_competence_has_no_candidate',
      imagineering,
      evidence,
    });
    return validateSedimentationSummary(compactSummary({
      ...summary,
      decision: 'construction_requested',
      target_substrate: targetSubstrate,
      construction_ref: responsibility.ref,
      decision_evidence_ref: decisionEvidenceRef,
    }));
  }

  const candidate = validateCandidate(rawCandidate, scope, targetSubstrate);
  if (['rejected', 'invalidated'].includes(candidate.status)) {
    const { responsibility, decisionEvidenceRef } = await requestConstruction({
      scope,
      profile,
      targetSubstrate,
      beatRef,
      observedAt,
      candidate,
      reason: 'candidate_not_admissible',
      imagineering,
      evidence,
    });
    return validateSedimentationSummary(compactSummary({
      ...summary,
      decision: 'construction_requested',
      target_substrate: targetSubstrate,
      candidate_implementation_ref: candidate.ref,
      construction_ref: responsibility.ref,
      decision_evidence_ref: decisionEvidenceRef,
    }));
  }

  if (['draft', 'candidate'].includes(candidate.status)) {
    const { responsibility, decisionEvidenceRef } = await requestConstruction({
      scope,
      profile,
      targetSubstrate,
      beatRef,
      observedAt,
      candidate,
      reason: 'candidate_not_ready_for_evaluation',
      imagineering,
      evidence,
    });
    return validateSedimentationSummary(compactSummary({
      ...summary,
      decision: 'construction_requested',
      target_substrate: targetSubstrate,
      candidate_implementation_ref: candidate.ref,
      construction_ref: responsibility.ref,
      decision_evidence_ref: decisionEvidenceRef,
    }));
  }

  const rawAssessment = await evidence.assessCandidate({
    scopeRef,
    capabilityRef: scope.capability_ref,
    capabilityRevision: scope.capability_revision,
    workClassRef: scope.work_class_ref,
    candidateImplementationRef: candidate.ref,
    candidateImplementationRevision: candidate.implementation_revision,
    learningPolicyRef: scope.learning_policy_ref,
    learningPolicyRevision: scope.learning_policy_revision,
    equivalenceContractRef: candidate.equivalence_contract_ref,
    profileRef: profile.ref,
    observedAt,
  });

  if (rawAssessment == null) {
    const { responsibility, decisionEvidenceRef } = await requestEvaluation({
      scope,
      profile,
      candidate,
      targetSubstrate,
      beatRef,
      observedAt,
      imagineering,
      evidence,
    });
    return validateSedimentationSummary(compactSummary({
      ...summary,
      decision: 'evaluation_requested',
      target_substrate: targetSubstrate,
      candidate_implementation_ref: candidate.ref,
      construction_ref: responsibility.ref,
      decision_evidence_ref: decisionEvidenceRef,
    }));
  }

  const assessment = validateEquivalenceAssessment(rawAssessment, candidate, profile);
  if (assessment.state === 'contradicted') {
    const { responsibility, decisionEvidenceRef } = await requestConstruction({
      scope,
      profile,
      targetSubstrate,
      beatRef,
      observedAt,
      candidate,
      reason: 'candidate_assessment_contradicted',
      imagineering,
      evidence,
    });
    return validateSedimentationSummary(compactSummary({
      ...summary,
      decision: 'construction_requested',
      target_substrate: targetSubstrate,
      candidate_implementation_ref: candidate.ref,
      assessment_ref: assessment.ref,
      construction_ref: responsibility.ref,
      decision_evidence_ref: decisionEvidenceRef,
    }));
  }

  if (candidate.status !== 'verified' || assessment.state !== 'verified' || !assessment.independent) {
    const { responsibility, decisionEvidenceRef } = await requestEvaluation({
      scope,
      profile,
      candidate,
      targetSubstrate,
      beatRef,
      observedAt,
      assessment,
      imagineering,
      evidence,
    });
    return validateSedimentationSummary(compactSummary({
      ...summary,
      decision: 'evaluation_requested',
      target_substrate: targetSubstrate,
      candidate_implementation_ref: candidate.ref,
      assessment_ref: assessment.ref,
      construction_ref: responsibility.ref,
      decision_evidence_ref: decisionEvidenceRef,
    }));
  }

  if (!candidatePasses(scope, profile, candidate, assessment)) {
    const { responsibility, decisionEvidenceRef } = await requestConstruction({
      scope,
      profile,
      targetSubstrate,
      beatRef,
      observedAt,
      candidate,
      reason: 'candidate_failed_equivalence_or_economics',
      imagineering,
      evidence,
    });
    return validateSedimentationSummary(compactSummary({
      ...summary,
      decision: 'construction_requested',
      target_substrate: targetSubstrate,
      candidate_implementation_ref: candidate.ref,
      assessment_ref: assessment.ref,
      construction_ref: responsibility.ref,
      decision_evidence_ref: decisionEvidenceRef,
    }));
  }

  const { proposal, decisionEvidenceRef } = await proposeTransition({
    direction: 'harden',
    scope,
    profile,
    toImplementationRef: candidate.ref,
    toImplementationRevision: candidate.implementation_revision,
    targetSubstrate,
    toCognitionFraction: assessment.observed_cognition_fraction,
    candidate,
    assessment,
    beatRef,
    observedAt,
    process,
    evidence,
  });
  return validateSedimentationSummary(compactSummary({
    ...summary,
    decision: proposal.created ? 'proposal_created' : 'proposal_open',
    target_substrate: targetSubstrate,
    candidate_implementation_ref: candidate.ref,
    assessment_ref: assessment.ref,
    proposal_ref: proposal.ref,
    decision_evidence_ref: decisionEvidenceRef,
  }));
}
