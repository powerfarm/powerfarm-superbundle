import { executionRefsFromSlice, sealExecutionSlice } from '../../../../circulation/cards/lib/execution-slice.mjs';

export async function makeExecutionSlice({
  actor = 'agent-1',
  office = 'operations',
  toolName = 'search',
  kind = 'tool.invoke.search',
  subject = 'tool:search',
  cardRef = 'pf.card.ai-sdk-test',
  beatRef = 'pf.beat.ai-sdk-test',
  attemptRef = 'pf.attempt.ai-sdk-test',
  directionRef = 'pf.direction.ai-sdk-test',
  ecsSha256 = 'a'.repeat(64),
  evaluatedAt = '2026-08-30T00:00:00.000Z',
  effectiveAt = '2026-08-30T00:00:00.000Z',
  energyExpiresAt = null,
  costExpiresAt = null,
} = {}) {
  const base = {
    contract_version: 'powerfarm.execution-slice.v4',
    card: {
      ref: cardRef,
      generation: 1,
      revision: 1,
      content_sha256: `sha256:${'b'.repeat(64)}`,
    },
    principal: { actor, office },
    institutional: {
      identity_ref: `pf.identity.${actor.replace(/[^a-z0-9-]/g, '-')}`,
      office_ref: `pf.office.${office.replace(/[^a-z0-9-]/g, '-')}`,
      occupancy_ref: `pf.occupancy.${actor.replace(/[^a-z0-9-]/g, '-')}`,
      direction_ref: directionRef,
      responsibility_ref: null,
      authority_ref: 'continuum:projected-at-admission',
      run_ref: null,
      run_grant_ref: null,
      ecs_sha256: ecsSha256,
    },
    circulation: { beat_ref: beatRef, attempt_ref: attemptRef },
    capability: { tool_name: toolName, kind, subject },
    resources: {
      evaluated_at: evaluatedAt,
      authorization_window: {
        energy: {
          authorization_ref: 'pf.energy-authorization.ai-sdk-test',
          effective_at: effectiveAt,
          expires_at: energyExpiresAt,
        },
        cost: {
          authorization_ref: 'pf.cost-authorization.ai-sdk-test',
          effective_at: effectiveAt,
          expires_at: costExpiresAt,
        },
      },
      energy_remaining: {
        beats: 2,
        model_tokens: 100000,
        tool_calls: 20,
        network_calls: 20,
        compute_ms: 600000,
        sandbox_ms: 600000,
        wall_ms: 900000,
        human_attention_ms: 600000,
      },
      cost: { currency: 'USD', remaining_micros: 10000000 },
    },
  };
  const first = await sealExecutionSlice(base);
  const refs = await executionRefsFromSlice(first);
  base.institutional.run_ref = refs.runRef;
  return sealExecutionSlice(base);
}
