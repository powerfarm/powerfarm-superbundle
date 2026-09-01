import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyCardPatch,
  applyResourceHealthProjection,
  assessCardCirculation,
  createCardV1,
  createResourceObservation,
  deriveExecutionSlice,
  emitCard,
  makeCardPatch,
  makeCostAuthorization,
  makeEnergyAuthorization,
  recordResourceObservation,
  transitionCard,
} from '../../circulation/cards/lib/index.mjs';
import {
  PINNED_AI_SDK_REVISION_REF,
  wrapToolsWithContinuum,
} from '../../process/continuum-ai-sdk/src/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLDEN = path.join(ROOT, 'conformance/circulation/golden/energy-cost.golden.json');
import { PythonContinuumPort } from '../../process/continuum-ai-sdk/tests/support/python-port.mjs';

const T0 = '2026-08-30T07:30:00.000Z';
const T1 = '2026-08-30T07:31:00.000Z';
const T2 = '2026-08-30T07:32:00.000Z';
const T3 = '2026-08-30T07:33:00.000Z';
const T4 = '2026-08-30T07:34:00.000Z';
const T5 = '2026-08-30T07:35:00.000Z';
const T6 = '2026-08-30T07:36:00.000Z';
const T7 = '2026-08-30T07:37:00.000Z';

const MAPPINGS = { search: { kind: 'tool.invoke.search', subject: 'tool:search' } };

test('golden energy/cost: Process authorizes, Heartime meters, Platform reports, Homeostasis pressures, next circulation blocks', async () => {
  let card = await createCardV1({
    ref: 'pf.card.energy-cost-golden',
    scope: 'pf.office.operations',
    created_at: T0,
    institutional: {
      identity_ref: 'pf.identity.agent-1', office_ref: 'pf.office.operations', occupancy_ref: 'pf.occupancy.agent-1',
      direction_ref: 'pf.direction.energy-cost', authority_ref: 'continuum:projected-at-admission', ecs_sha256: '9'.repeat(64),
    },
    energy: { authorization: makeEnergyAuthorization({
      authorizationRef: 'pf.energy-authorization.energy-cost-golden', effectiveAt: T0,
      limits: { beats: 2, model_tokens: 2000, tool_calls: 2, network_calls: 2, compute_ms: 1000, sandbox_ms: 1000, wall_ms: 2000, human_attention_ms: 0 },
    }) },
    cost: { authorization: makeCostAuthorization({
      authorizationRef: 'pf.cost-authorization.energy-cost-golden', currency: 'USD', mode: 'capped', ceilingMicros: 5000, effectiveAt: T0,
    }) },
    circulation: { state: 'prepared', priority: 12, next_expected: T0, deadline: '2026-08-30T08:30:00.000Z' },
  });

  card = (await emitCard(card, { at: T0, beatRef: 'pf.beat.energy-cost-1', nextExpected: T1 })).card;
  card = (await transitionCard(card, { to: 'acknowledged', at: T1, nextExpected: T2 })).card;
  card = (await transitionCard(card, { to: 'executing', at: T2, attemptRef: 'pf.attempt.energy-cost-1', nextExpected: T3 })).card;
  const slice = await deriveExecutionSlice(card, {
    actor: 'agent-1', office: 'operations', toolName: 'search', kind: 'tool.invoke.search', subject: 'tool:search',
    evaluatedAt: T2,
  });
  assert.equal(slice.resources.energy_remaining.beats, 1);
  assert.equal(slice.resources.cost.remaining_micros, 5000);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-energy-cost-golden-'));
  const port = new PythonContinuumPort({
    dbPath: path.join(tmp, 'institution.db'),
    registry: { offices: ['director', 'operations'], occupancies: { director: 'human-1', operations: 'agent-1' } },
  });
  await port.bootstrap({
    root_actor: 'human-1',
    grants: [
      { office: 'operations', action: 'tool.invoke.search', subject: 'tool:search' },
      { office: 'operations', action: 'run.start', subject: 'run:*' },
    ],
  });

  let seenBudget = null;
  let effects = 0;
  const tools = wrapToolsWithContinuum({
    search: {
      execute: async (_input, options) => {
        effects += 1;
        seenBudget = structuredClone(options.context.powerfarm.resourceBudget);
        return { ok: true, observation: 'world-read' };
      },
    },
  }, { port, mappings: MAPPINGS, revisionRef: PINNED_AI_SDK_REVISION_REF });

  await tools.search.execute({ query: 'world' }, {
    toolCallId: 'energy-cost-call-1',
    messages: [],
    context: { powerfarm: { executionSlice: slice, invocationId: 'engine-local-energy-cost' } },
  });
  assert.equal(effects, 1);
  assert.deepEqual(seenBudget, slice.resources);

  const observation = await createResourceObservation({
    cardRef: card.ref,
    attemptRef: card.circulation.attempt_ref,
    beatRef: card.circulation.beat_ref,
    observedAt: T3,
    sourceOrgan: 'platform',
    runtime: 'vercel-ai-sdk',
    revisionRef: PINNED_AI_SDK_REVISION_REF,
    energyDelta: { model_tokens: 1500, tool_calls: 1, network_calls: 1, compute_ms: 150, wall_ms: 250 },
    currency: 'USD',
    costMicros: 5000,
    evidenceRefs: ['pf.evidence.energy-cost-metering-1'],
  });
  const metered = await recordResourceObservation(card, observation);
  card = metered.card;
  assert.equal(metered.resource_state.reason, 'cost_exhausted');

  const events = (await port.events()).events;
  const finish = events.find((event) => event.kind === 'run.finish');
  assert.ok(finish);
  card = (await transitionCard(card, { to: 'evidence_pending', at: T4, nextExpected: T5 })).card;
  card = await applyCardPatch(card, makeCardPatch({
    card, organ: 'memory', at: T5, reason: 'work evidence returned',
    append: { 'evidence.refs': [`continuum-act:${finish.id}`] },
  }));
  const health = await applyResourceHealthProjection(card, { at: T6 });
  card = health.card;
  assert.equal(health.projection.pressure, 'EXHAUSTED');
  assert.equal(health.projection.circulatory_debt, false);

  card = (await transitionCard(card, { to: 'failed', at: T6, nextExpected: T7, reason: 'retry requested after partial result' })).card;
  card = (await transitionCard(card, { to: 'prepared', at: T7, nextExpected: T7, reason: 'retry ready' })).card;
  const next = assessCardCirculation(card, { now: T7 });
  assert.equal(next.decision, 'BLOCK');
  assert.equal(next.reason, 'cost_exhausted');

  const audit = await port.audit();
  assert.equal(audit.audit.ok, true);
  const actual = {
    contract_version: 'powerfarm.energy-cost-golden.v1',
    card_ref: card.ref,
    run_ref: slice.institutional.run_ref,
    execution_slice: slice.contract_version,
    budget_seen_by_engine: seenBudget,
    consumption: {
      beats: card.energy.consumption.totals.beats,
      model_tokens: card.energy.consumption.totals.model_tokens,
      tool_calls: card.energy.consumption.totals.tool_calls,
      cost_micros: card.cost.consumption.spent_micros,
    },
    pressure: health.projection.pressure,
    circulatory_debt: health.projection.circulatory_debt,
    next_decision: next.decision,
    next_reason: next.reason,
    effects,
    audit_ok: audit.audit.ok,
  };
  if (process.env.UPDATE_POWERFARM_GOLDEN === '1') fs.writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
  const expected = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(actual, expected);
});
