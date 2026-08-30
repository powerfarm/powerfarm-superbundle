const clone = (value) => value == null ? value : structuredClone(value);

export class InMemoryLearningRegistry {
  constructor({ scope, candidates = {} }) {
    this.scope = clone(scope);
    this.candidates = new Map(Object.entries(candidates).map(([key, value]) => [key, clone(value)]));
  }

  async resolveLearningScope({ scopeRef }) {
    return this.scope?.ref === scopeRef ? clone(this.scope) : null;
  }

  async findCandidate({ targetSubstrate }) {
    return clone(this.candidates.get(targetSubstrate) ?? null);
  }
}

export class InMemoryLearningEvidence {
  constructor({ profile = null, assessments = {} } = {}) {
    this.profile = clone(profile);
    this.assessments = new Map(Object.entries(assessments).map(([key, value]) => [key, clone(value)]));
    this.records = [];
  }

  async profileWorkClass() {
    return clone(this.profile);
  }

  async assessCandidate({ candidateImplementationRef }) {
    return clone(this.assessments.get(candidateImplementationRef) ?? null);
  }

  async recordDecision(record) {
    const existing = this.records.find((item) => item.idempotency_key === record.idempotency_key);
    if (existing) return { ref: existing.ref };
    const stored = {
      ref: `pf.evidence.capability-learning-${this.records.length + 1}`,
      ...clone(record),
    };
    this.records.push(stored);
    return { ref: stored.ref };
  }
}

export class InMemoryImagineering {
  constructor() {
    this.constructions = [];
    this.evaluations = [];
  }

  async ensureConstruction(input) {
    const existing = this.constructions.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (existing) return { ref: existing.ref, created: false, state: 'open', target_substrate: existing.targetSubstrate };
    const item = {
      ref: `pf.construction.capability-${this.constructions.length + 1}`,
      ...clone(input),
    };
    this.constructions.push(item);
    return { ref: item.ref, created: true, state: 'open', target_substrate: input.targetSubstrate };
  }

  async ensureEvaluation(input) {
    const existing = this.evaluations.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (existing) return { ref: existing.ref, created: false, state: 'open', target_substrate: existing.targetSubstrate };
    const item = {
      ref: `pf.construction.evaluation-${this.evaluations.length + 1}`,
      ...clone(input),
    };
    this.evaluations.push(item);
    return { ref: item.ref, created: true, state: 'open', target_substrate: input.targetSubstrate };
  }
}

export class InMemoryCapabilityProcess {
  constructor() {
    this.proposals = [];
  }

  async ensureTransitionProposal(input) {
    const existing = this.proposals.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (existing) {
      return {
        ref: existing.ref,
        created: false,
        state: 'open',
        direction: existing.direction,
        capability_ref: existing.capabilityRef,
        capability_revision: existing.capabilityRevision,
        work_class_ref: existing.workClassRef,
        learning_policy_ref: existing.learningPolicyRef,
        learning_policy_revision: existing.learningPolicyRevision,
        from_occupancy_ref: existing.fromOccupancyRef,
        from_implementation_ref: existing.fromImplementationRef,
        from_implementation_revision: existing.fromImplementationRevision,
        from_substrate: existing.fromSubstrate,
        to_implementation_ref: existing.toImplementationRef,
        to_implementation_revision: existing.toImplementationRevision,
        to_substrate: existing.toSubstrate,
        to_cognition_fraction: existing.toCognitionFraction,
        semantic_contract_ref: existing.semanticContractRef,
        authority_contract_ref: existing.authorityContractRef,
        evidence_contract_ref: existing.evidenceContractRef,
        equivalence_contract_ref: existing.equivalenceContractRef,
        profile_ref: existing.profileRef,
        assessment_ref: existing.assessmentRef,
        fallback_implementation_ref: existing.fallbackImplementationRef,
        fallback_implementation_revision: existing.fallbackImplementationRevision,
        fallback_substrate: existing.fallbackSubstrate,
      };
    }
    const item = {
      ref: `pf.proposal.capability-transition-${this.proposals.length + 1}`,
      ...clone(input),
    };
    this.proposals.push(item);
    return {
      ref: item.ref,
      created: true,
      state: 'open',
      direction: input.direction,
      capability_ref: input.capabilityRef,
      capability_revision: input.capabilityRevision,
      work_class_ref: input.workClassRef,
      learning_policy_ref: input.learningPolicyRef,
      learning_policy_revision: input.learningPolicyRevision,
      from_occupancy_ref: input.fromOccupancyRef,
      from_implementation_ref: input.fromImplementationRef,
      from_implementation_revision: input.fromImplementationRevision,
      from_substrate: input.fromSubstrate,
      to_implementation_ref: input.toImplementationRef,
      to_implementation_revision: input.toImplementationRevision,
      to_substrate: input.toSubstrate,
      to_cognition_fraction: input.toCognitionFraction,
      semantic_contract_ref: input.semanticContractRef,
      authority_contract_ref: input.authorityContractRef,
      evidence_contract_ref: input.evidenceContractRef,
      equivalence_contract_ref: input.equivalenceContractRef,
      profile_ref: input.profileRef,
      assessment_ref: input.assessmentRef,
      fallback_implementation_ref: input.fallbackImplementationRef,
      fallback_implementation_revision: input.fallbackImplementationRevision,
      fallback_substrate: input.fallbackSubstrate,
    };
  }
}
