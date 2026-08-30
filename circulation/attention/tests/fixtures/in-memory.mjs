import { CARD_CONTRACT_VERSION, createCardV1 } from '../../../cards/lib/card-v1.mjs';

export class InMemoryCards {
  constructor(cards = []) {
    this.cards = new Map(cards.map((card) => [card.ref, { condition: 'pending', responses: [], ...structuredClone(card) }]));
    this.wakePacks = [];
  }

  update(ref, patch) {
    const current = this.cards.get(ref);
    if (!current) throw new Error(`unknown Card: ${ref}`);
    this.cards.set(ref, { ...current, ...structuredClone(patch) });
  }

  async listCurrent({ scope, at }) {
    const now = Date.parse(at);
    const rows = [...this.cards.values()]
      .filter((card) => card.scope === scope)
      .filter((card) => !card.expires_at || Date.parse(card.expires_at) > now)
      .filter((card) => card.condition !== 'resolved');
    return Promise.all(rows.map(async (card) => {
      if (card.contract_version === CARD_CONTRACT_VERSION) return structuredClone(card);
      const fixedAt = card.created_at ?? '2026-08-23T00:00:00.000Z';
      return createCardV1({
        ref: card.ref,
        generation: card.generation,
        scope: card.scope,
        created_at: fixedAt,
        updated_at: card.updated_at ?? fixedAt,
        attention: {
          obligation_ref: card.obligation_ref,
          condition: card.condition,
          response_contract: card.response_contract,
          title: card.title,
          why: card.why,
          affordances: structuredClone(card.affordances ?? []),
          expires_at: card.expires_at ?? null,
        },
        circulation: {
          state: 'prepared',
          next_expected: fixedAt,
        },
        evidence: { refs: structuredClone(card.evidence_refs ?? []) },
      });
    }));
  }

  async compileWakePack({ scope, recipient, cards, at }) {
    const pack = {
      ref: `pf.wakepack.${this.wakePacks.length + 1}`,
      scope,
      recipient_ref: recipient.ref,
      species: recipient.species,
      compiled_at: at,
      attention_budget: cards.length,
      cards: cards.map((card) => this.project(card, recipient.species)),
    };
    this.wakePacks.push(structuredClone(pack));
    return pack;
  }

  project(card, species) {
    const base = {
      ref: card.ref,
      scope: card.scope,
      generation: card.generation,
      obligation_ref: card.obligation_ref,
      condition: card.condition,
      response_contract: card.response_contract,
      why: card.why,
      evidence_refs: structuredClone(card.evidence_refs ?? []),
      effective_affordances: structuredClone(card.effective_affordances ?? []),
      source_contract_version: card.source_contract_version,
      source_content_sha256: card.source_content_sha256,
    };
    if (species === 'human') return { ...base, presentation: card.human ?? { title: card.title ?? card.ref } };
    if (species === 'client') return { ...base, presentation: card.client ?? { summary: card.title ?? card.ref } };
    return { ...base, presentation: card.llm ?? { semantic_context: card.title ?? card.ref } };
  }

  async recordResponse({ cardRef, observedGeneration, scope, response, attemptRef, occupancyRef, beatRef, observedAt, idempotencyKey }) {
    const card = this.cards.get(cardRef);
    if (!card || card.scope !== scope) throw new Error(`Card not found in scope: ${cardRef}`);
    const responseKey = idempotencyKey ?? `${cardRef}:${observedGeneration}:${attemptRef}`;
    const existing = card.responses.find((item) => item.key === responseKey);
    if (existing) return structuredClone(existing);

    const stale = card.generation !== observedGeneration;
    const record = {
      key: responseKey,
      ref: `pf.card-response.${card.responses.length + 1}`,
      response_ref: `pf.card-response.${card.responses.length + 1}`,
      card_ref: cardRef,
      observed_generation: observedGeneration,
      current_generation: card.generation,
      attempt_ref: attemptRef,
      occupancy_ref: occupancyRef,
      beat_ref: beatRef,
      response: structuredClone(response),
      disposition: response.disposition ?? 'response',
      stale,
      observed_at: observedAt,
    };
    card.responses.push(record);
    if (!stale) {
      card.condition = ['unknown', 'abstain'].includes(response.disposition)
        ? response.disposition
        : 'resolved';
    }
    return structuredClone(record);
  }
}

export class InMemoryOccupancies {
  constructor(entries = {}) { this.entries = structuredClone(entries); }
  async resolve(scope) { return structuredClone(this.entries[scope] ?? null); }
}

export class InMemoryAuthority {
  constructor(allowed = {}) { this.allowed = structuredClone(allowed); }
  async project({ card, recipient }) {
    const grants = new Set(this.allowed[recipient.ref] ?? []);
    return (card.affordances ?? []).map((affordance) => {
      if (!affordance.requires || grants.has(affordance.requires)) return { ...affordance, state: 'available' };
      return {
        ...affordance,
        state: 'unavailable',
        reason: 'authority_required',
        missing: affordance.requires,
        next: affordance.resolution ?? 'none',
      };
    });
  }
}

export class InMemoryRuns {
  constructor() { this.attempts = []; }

  async completedUnrecorded(scope) {
    return this.attempts
      .filter((attempt) => attempt.scope === scope && attempt.status === 'completed' && !attempt.recorded)
      .map((item) => structuredClone(item));
  }

  async markRecorded(ref, metadata = {}) {
    const attempt = this.attempts.find((item) => item.ref === ref);
    if (attempt) {
      attempt.recorded = true;
      attempt.recorded_at = metadata.observedAt ?? null;
      attempt.response_ref = metadata.responseRef ?? null;
    }
  }

  async ensureAttempt(input) {
    const same = this.attempts.filter((attempt) => attempt.idempotency_key === input.idempotencyKey);
    const live = same.find((attempt) => ['running', 'completed'].includes(attempt.status));
    if (live) return structuredClone(live);

    const predecessor = same.at(-1) ?? null;
    const attempt = {
      ref: `pf.attempt.${this.attempts.length + 1}`,
      idempotency_key: input.idempotencyKey,
      card_ref: input.cardRef,
      card_generation: input.cardGeneration,
      obligation_ref: input.obligationRef,
      response_contract: input.responseContract,
      scope: input.scope,
      occupancy_ref: input.occupancyRef,
      beat_ref: input.beatRef,
      wake_pack_ref: input.wakePackRef,
      card_projection: structuredClone(input.cardProjection),
      status: 'running',
      response: null,
      recorded: false,
      successor_of: predecessor?.ref ?? null,
    };
    this.attempts.push(attempt);
    return structuredClone(attempt);
  }

  async observe(ref) {
    const attempt = this.attempts.find((item) => item.ref === ref);
    if (!attempt) throw new Error(`unknown attempt: ${ref}`);
    return structuredClone(attempt);
  }

  complete(ref, response) {
    const attempt = this.attempts.find((item) => item.ref === ref);
    if (!attempt) throw new Error(`unknown attempt: ${ref}`);
    attempt.status = 'completed';
    attempt.response = structuredClone(response);
  }

  fail(ref) {
    const attempt = this.attempts.find((item) => item.ref === ref);
    if (!attempt) throw new Error(`unknown attempt: ${ref}`);
    attempt.status = 'failed';
  }
}

export class InMemoryEvidence {
  constructor() { this.records = []; }
  async record(record) {
    const key = record.idempotency_key ?? JSON.stringify([record.kind, record.attempt_ref, record.card_generation]);
    if (!this.records.some((item) => item.key === key)) this.records.push({ key, ...structuredClone(record) });
    return { ref: `pf.evidence.${this.records.length}`, key };
  }
}
