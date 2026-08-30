import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyCardPatch,
  createCardV1,
  createResourceObservation,
  deriveExecutionSlice,
  emitCard,
  makeCardPatch,
  makeCostAuthorization,
  makeEnergyAuthorization,
  recordResourceObservation,
  transitionCard,
  verifyCardSeal,
} from '../../circulation/cards/lib/index.mjs';
import {
  PINNED_AI_SDK_REVISION_REF,
  wrapToolsWithContinuum,
} from '../../process/continuum-ai-sdk/src/index.mjs';

import { PythonContinuumPort } from '../../process/continuum-ai-sdk/tests/support/python-port.mjs';

const T0 = '2026-08-30T01:00:00.000Z';
const T1 = '2026-08-30T01:01:00.000Z';
const T2 = '2026-08-30T01:02:00.000Z';
const T3 = '2026-08-30T01:03:00.000Z';
const T4 = '2026-08-30T01:04:00.000Z';
const T5 = '2026-08-30T01:05:00.000Z';
const T6 = '2026-08-30T01:06:00.000Z';

const mappings = { search: { kind: 'tool.invoke.search', subject: 'tool:search' } };
const goldenPath = fileURLToPath(new URL('./golden/card-heartime-ai-sdk.golden.json', import.meta.url));

test('golden circulation: Card -> Heartime -> Process -> AI SDK setting -> Evidence -> settled Card', async () => {
  const invocationId = 'card-heartime-golden-1';
  const toolCallId = 'call-1';
  const attemptRef = 'pf.attempt.card-heartime-1';
  const beatRef = 'pf.beat.card-heartime-1';
  let card = await createCardV1({
    ref: 'pf.card.card-heartime-golden',
    scope: 'pf.office.operations',
    created_at: T0,
    institutional: {
      identity_ref: 'pf.identity.agent-1',
      office_ref: 'pf.office.operations',
      occupancy_ref: 'pf.occupancy.agent-1',
      direction_ref: 'pf.direction.card-heartime-hardening',
      authority_ref: 'continuum:projected-at-admission',
      ecs_sha256: 'a'.repeat(64),
    },
    attention: {
      why: 'prove one institutional circulation across the engine boundary',
      response_contract: 'act',
    },
    circulation: {
      state: 'prepared',
      priority: 10,
      deadline: '2026-08-30T02:00:00.000Z',
      next_expected: T0,
    },
    energy: { authorization: makeEnergyAuthorization({ authorizationRef: 'pf.energy-authorization.golden', limits: { beats: 4, model_tokens: 100000, tool_calls: 20, network_calls: 20, compute_ms: 600000, sandbox_ms: 600000, wall_ms: 900000, human_attention_ms: 600000 }, effectiveAt: T0 }) },
    cost: { authorization: makeCostAuthorization({ authorizationRef: 'pf.cost-authorization.golden', currency: 'USD', mode: 'capped', ceilingMicros: 10_000_000, effectiveAt: T0 }) },
  });

  const emitted = await emitCard(card, { at: T0, beatRef, nextExpected: T1 });
  assert.equal(emitted.decision, 'CIRCULATE');
  card = emitted.card;
  card = (await transitionCard(card, { to: 'acknowledged', at: T1, nextExpected: T2 })).card;
  card = (await transitionCard(card, { to: 'executing', at: T2, attemptRef, nextExpected: T3 })).card;
  const executionSlice = await deriveExecutionSlice(card, {
    actor: 'agent-1',
    office: 'operations',
    toolName: 'search',
    kind: 'tool.invoke.search',
    subject: 'tool:search',
  });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-card-heartime-golden-'));
  const registry = {
    offices: ['director', 'operations'],
    occupancies: { director: 'human-1', operations: 'agent-1' },
  };
  const port = new PythonContinuumPort({ dbPath: path.join(root, 'institution.db'), registry });
  await port.bootstrap({
    root_actor: 'human-1',
    grants: [
      { office: 'operations', action: 'tool.invoke.search', subject: 'tool:search' },
      { office: 'operations', action: 'run.start', subject: 'run:*' },
    ],
  });

  let effects = 0;
  const tools = wrapToolsWithContinuum({
    search: {
      execute: async () => {
        effects += 1;
        return { observed: true, value: 'RAW-WORLD-VALUE' };
      },
    },
  }, {
    port,
    mappings,
    revisionRef: PINNED_AI_SDK_REVISION_REF,
  });

  const output = await tools.search.execute({ query: 'RAW-WORLD-QUERY' }, {
    toolCallId,
    messages: [],
    context: {
      powerfarm: {
        executionSlice,
        invocationId,
      },
    },
  });
  assert.equal(output.observed, true);
  assert.equal(effects, 1);

  card = (await transitionCard(card, { to: 'evidence_pending', at: T3, nextExpected: T4 })).card;

  const events = (await port.events()).events;
  const intent = events.find((event) => event.kind === 'tool.invoke.search');
  const run = events.find((event) => event.kind === 'run.start');
  const finish = events.find((event) => event.kind === 'run.finish');
  assert.ok(intent && run && finish, 'real Continuum must contain intent, run.start, and run.finish');
  assert.equal(intent.payload.provenance.card_ref, card.ref);
  assert.equal(intent.payload.provenance.beat_ref, beatRef);
  assert.equal(intent.payload.provenance.attempt_ref, attemptRef);
  assert.equal(run.payload.card_ref, card.ref);
  assert.equal(run.payload.beat_ref, beatRef);
  assert.equal(run.payload.attempt_ref, attemptRef);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes('RAW-WORLD-QUERY'), false);
  assert.equal(serialized.includes('RAW-WORLD-VALUE'), false);

  const evidenceRef = `continuum-act:${finish.id}`;
  card = await applyCardPatch(card, makeCardPatch({
    card,
    organ: 'memory',
    at: T4,
    reason: 'record durable evidence returned by Process',
    append: {
      'evidence.refs': [evidenceRef],
      'epistemic.evidence_refs': [evidenceRef],
    },
  }));

  const resourceObservation = await createResourceObservation({
    cardRef: card.ref,
    attemptRef,
    beatRef,
    observedAt: T5,
    sourceOrgan: 'platform',
    runtime: 'vercel-ai-sdk',
    revisionRef: PINNED_AI_SDK_REVISION_REF,
    energyDelta: { tool_calls: 1, model_tokens: 900, compute_ms: 25, wall_ms: 40 },
    currency: 'USD',
    costMicros: 3000,
    evidenceRefs: ['pf.evidence.metering.card-heartime-1'],
  });
  card = (await recordResourceObservation(card, resourceObservation)).card;
  card = (await transitionCard(card, { to: 'settled', at: T6 })).card;

  assert.equal(card.circulation.state, 'settled');
  assert.equal(card.circulation.next_expected, null);
  assert.equal(card.generation, 1, 'circulation must preserve semantic generation');
  assert.equal(card.revision, 9, 'transition, metering, evidence, and settlement all advance snapshot revision');
  assert.equal(card.lineage.transition_refs.length, 5);
  assert.deepEqual(card.evidence.refs, [evidenceRef]);
  assert.equal(card.energy.consumption.totals.beats, 1);
  assert.equal(card.energy.consumption.totals.tool_calls, 1);
  assert.equal(card.cost.consumption.spent_micros, 3000);
  assert.equal(await verifyCardSeal(card), true);

  const audit = await port.audit();
  assert.equal(audit.audit.ok, true);

  const actualGolden = {
    card: {
      contract_version: card.contract_version,
      ref: card.ref,
      generation: card.generation,
      revision: card.revision,
      state: card.circulation.state,
      next_expected: card.circulation.next_expected,
      transition_count: card.lineage.transition_refs.length,
      evidence_count: card.evidence.refs.length,
      energy_beats: card.energy.consumption.totals.beats,
      energy_tool_calls: card.energy.consumption.totals.tool_calls,
      cost_spent_micros: card.cost.consumption.spent_micros,
      content_addressed: Boolean(card.content_sha256.match(/^sha256:[a-f0-9]{64}$/)),
    },
    process: {
      kinds: events.map((event) => event.kind),
      card_ref: intent.payload.provenance.card_ref,
      beat_ref: intent.payload.provenance.beat_ref,
      attempt_ref: intent.payload.provenance.attempt_ref,
      raw_values_absent: !serialized.includes('RAW-WORLD-QUERY') && !serialized.includes('RAW-WORLD-VALUE'),
      audit_ok: audit.audit.ok,
    },
    engine: {
      runtime: 'vercel-ai-sdk',
      revision_ref: PINNED_AI_SDK_REVISION_REF,
      effects,
    },
  };
  if (process.env.UPDATE_POWERFARM_GOLDEN === '1') fs.writeFileSync(goldenPath, `${JSON.stringify(actualGolden, null, 2)}\n`);
  const expectedGolden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  assert.deepEqual(actualGolden, expectedGolden);
});
