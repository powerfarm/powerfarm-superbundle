import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyCardPatch,
  applyRegistryOccupancyObservation,
  beginReconciliation,
  createCardV1,
  deriveExecutionSlice,
  emitCard,
  executionRefsFromSlice,
  makeCardPatch,
  orphanForOccupancy,
  reissueReconciledCard,
  takeoverRequestId,
  makeCostAuthorization,
  makeEnergyAuthorization,
  transitionCard,
} from '../../circulation/cards/lib/index.mjs';
import {
  InstitutionalRefusalError,
  PINNED_AI_SDK_REVISION_REF,
  wrapToolsWithContinuum,
} from '../../process/continuum-ai-sdk/src/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLDEN = path.join(ROOT, 'conformance/circulation/golden/recovery.golden.json');
const MAPPINGS = { search: { kind: 'tool.invoke.search', subject: 'tool:search' } };
import { PythonContinuumPort } from '../../process/continuum-ai-sdk/tests/support/python-port.mjs';

const T0 = '2026-08-30T04:00:00.000Z';
const T1 = '2026-08-30T04:01:00.000Z';
const T2 = '2026-08-30T04:02:00.000Z';
const T3 = '2026-08-30T04:03:00.000Z';
const T4 = '2026-08-30T04:04:00.000Z';
const T5 = '2026-08-30T04:05:00.000Z';
const T6 = '2026-08-30T04:06:00.000Z';
const T7 = '2026-08-30T04:07:00.000Z';
const T8 = '2026-08-30T04:08:00.000Z';
const T9 = '2026-08-30T04:09:00.000Z';

function options(slice, reconciliationRef = null) {
  return {
    toolCallId: 'engine-local-call-does-not-own-run',
    messages: [],
    context: { powerfarm: { invocationId: 'engine-local-invocation', executionSlice: slice, reconciliationRef } },
  };
}

function incrementIsoMillis(value, millis = 2) {
  return new Date(Date.parse(value) + millis).toISOString();
}

async function executingCard() {
  let card = await createCardV1({
    ref: 'pf.card.recovery-golden',
    scope: 'pf.office.operations',
    created_at: T0,
    institutional: {
      identity_ref: 'pf.identity.agent-old',
      office_ref: 'pf.office.operations',
      occupancy_ref: 'pf.occupancy.agent-old',
      direction_ref: 'pf.direction.recovery-golden',
      authority_ref: 'continuum:projected-at-admission',
      ecs_sha256: 'f'.repeat(64),
    },
    attention: { why: 'prove the Office outlives its transient executor', response_contract: 'act' },
    energy: { authorization: makeEnergyAuthorization({ authorizationRef: 'pf.energy-authorization.golden', limits: { beats: 4, model_tokens: 100000, tool_calls: 20, network_calls: 20, compute_ms: 600000, sandbox_ms: 600000, wall_ms: 900000, human_attention_ms: 600000 }, effectiveAt: T0 }) },
    cost: { authorization: makeCostAuthorization({ authorizationRef: 'pf.cost-authorization.golden', currency: 'USD', mode: 'capped', ceilingMicros: 10_000_000, effectiveAt: T0 }) },
    circulation: { state: 'prepared', priority: 13, deadline: '2026-08-30T06:00:00.000Z', next_expected: T0 },
  });
  card = (await emitCard(card, { at: T0, beatRef: 'pf.beat.recovery-golden-1', nextExpected: T1 })).card;
  card = (await transitionCard(card, { to: 'acknowledged', at: T1, nextExpected: T2 })).card;
  card = (await transitionCard(card, { to: 'executing', at: T2, attemptRef: 'pf.attempt.recovery-golden', nextExpected: T3 })).card;
  return card;
}

function recoveryTool(effectStore) {
  return {
    search: {
      execute: async (_input, executionOptions) => {
        const key = executionOptions?.context?.powerfarm?.idempotencyKey;
        assert.match(key, /^pfx-[0-9a-f]{32}$/);
        if (!effectStore.has(key)) effectStore.set(key, { answer: 'durable-result' });
        return effectStore.get(key);
      },
    },
  };
}

test('golden recovery: stale occupancy, lost receipt, takeover, reissue, and duplicate delivery preserve one institutional effect', async () => {
  let card = await executingCard();
  const firstSlice = await deriveExecutionSlice(card, {
    actor: 'agent-old', office: 'operations', toolName: 'search', kind: 'tool.invoke.search', subject: 'tool:search',
    evaluatedAt: T2,
  });
  const firstRefs = await executionRefsFromSlice(firstSlice);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-recovery-golden-'));
  const registry = {
    offices: ['director', 'operations'],
    occupancies: { director: 'human-1', operations: 'agent-old' },
    occupancy_refs: { operations: 'pf.occupancy.agent-old' },
    identity_refs: { 'agent-old': 'pf.identity.agent-old', 'agent-new': 'pf.identity.agent-new' },
  };
  const port = new PythonContinuumPort({ dbPath: path.join(root, 'institution.db'), registry });
  await port.bootstrap({
    root_actor: 'human-1',
    grants: [
      { office: 'operations', action: 'tool.invoke.search', subject: 'tool:search' },
      { office: 'operations', action: 'run.start', subject: 'run:*' },
    ],
  });

  const physicalEffects = new Map();
  const receiptLossPort = {
    admitToolCall: body => port.admitToolCall(body),
    completeToolCall: async () => { throw new Error('receipt transport lost after external effect'); },
    failToolCall: async () => { throw new Error('outcome transport unavailable'); },
  };
  const firstTools = wrapToolsWithContinuum(recoveryTool(physicalEffects), {
    port: receiptLossPort, mappings: MAPPINGS, revisionRef: PINNED_AI_SDK_REVISION_REF,
  });
  await assert.rejects(
    () => firstTools.search.execute({ query: 'world' }, options(firstSlice)),
    /receipt transport lost after external effect/,
  );
  assert.equal(physicalEffects.size, 1, 'the external world changed exactly once before the receipt was lost');

  const duplicateTools = wrapToolsWithContinuum(recoveryTool(physicalEffects), {
    port, mappings: MAPPINGS, revisionRef: PINNED_AI_SDK_REVISION_REF,
  });
  let duplicateCode = null;
  await assert.rejects(
    () => duplicateTools.search.execute({ query: 'world' }, options(firstSlice)),
    error => {
      duplicateCode = error?.code ?? null;
      return error instanceof InstitutionalRefusalError && error.code === 'POWERFARM_ALREADY_IN_FLIGHT';
    },
  );
  assert.equal(physicalEffects.size, 1, 'duplicate delivery of the same beat cannot repeat the external effect');

  const startEvents = (await port.events()).events;
  const runStart = startEvents.find(event => event.request_id === firstRefs.runRequestId);
  assert.ok(runStart);
  const switchAt = incrementIsoMillis(runStart.recorded_at, 2);
  registry.occupancies.operations = 'agent-new';
  registry.occupancy_refs.operations = 'pf.occupancy.agent-new';
  registry.occupancy_history = {
    operations: [
      { principal: 'agent-old', occupancy_ref: 'pf.occupancy.agent-old', identity_ref: 'pf.identity.agent-old', effective_at: '1970-01-01T00:00:00Z' },
      { principal: 'agent-new', occupancy_ref: 'pf.occupancy.agent-new', identity_ref: 'pf.identity.agent-new', effective_at: switchAt },
    ],
  };
  await new Promise(resolve => setTimeout(resolve, 5));

  const observation = {
    office_ref: 'pf.office.operations', identity_ref: 'pf.identity.agent-new', occupancy_ref: 'pf.occupancy.agent-new',
  };
  const orphaned = await orphanForOccupancy(card, { at: T3, nextExpected: T4, observation });
  card = orphaned.card;
  card = (await beginReconciliation(card, { at: T4, nextExpected: T5 })).card;
  const reconciliationRef = card.circulation.reconciliation_ref;
  const requestId = await takeoverRequestId({
    runRef: firstRefs.runRef, reconciliationRef, successorOccupancyRef: observation.occupancy_ref,
  });
  const takeover = await port.takeoverRun({
    refs: firstRefs,
    actor: 'agent-new', office: 'operations',
    previous_occupancy_ref: 'pf.occupancy.agent-old',
    successor_occupancy_ref: observation.occupancy_ref,
    card_ref: card.ref,
    reconciliation_ref: reconciliationRef,
    request_id: requestId,
  });
  assert.equal(takeover.ok, true);

  card = await applyRegistryOccupancyObservation(card, { at: T4, observation });
  card = (await reissueReconciledCard(card, { at: T5, beatRef: 'pf.beat.recovery-golden-2', nextExpected: T6 })).card;
  card = (await transitionCard(card, { to: 'acknowledged', at: T6, nextExpected: T7 })).card;
  card = (await transitionCard(card, { to: 'executing', at: T7, nextExpected: T8 })).card;
  const successorSlice = await deriveExecutionSlice(card, {
    actor: 'agent-new', office: 'operations', toolName: 'search', kind: 'tool.invoke.search', subject: 'tool:search',
    evaluatedAt: T7,
  });
  const successorRefs = await executionRefsFromSlice(successorSlice);
  assert.equal(successorRefs.runRef, firstRefs.runRef);
  assert.notEqual(successorRefs.resumeRequestId, firstRefs.resumeRequestId);

  const successorTools = wrapToolsWithContinuum(recoveryTool(physicalEffects), {
    port, mappings: MAPPINGS, revisionRef: PINNED_AI_SDK_REVISION_REF,
  });
  const recovered = await successorTools.search.execute({ query: 'world' }, options(successorSlice, reconciliationRef));
  assert.equal(recovered.answer, 'durable-result');
  assert.equal(physicalEffects.size, 1, 'recovery reused the institutional idempotency key instead of repeating the world effect');

  card = (await transitionCard(card, { to: 'evidence_pending', at: T8, nextExpected: T9 })).card;
  card = await applyCardPatch(card, makeCardPatch({
    card, organ: 'memory', at: T8, reason: 'recovery evidence returned',
    append: { 'evidence.refs': ['pf.evidence.recovery-golden'] },
  }));
  card = (await transitionCard(card, { to: 'settled', at: T9 })).card;

  const events = (await port.events()).events;
  const runEvents = events
    .filter(event => ['run.start', 'run.takeover', 'run.resume', 'run.finish', 'run.fail'].includes(event.kind))
    .map(event => ({ kind: event.kind, actor: event.actor, office: event.office, subject: event.subject }));
  assert.deepEqual(runEvents.map(row => row.kind), ['run.start', 'run.takeover', 'run.resume', 'run.finish']);
  assert.equal(new Set(runEvents.map(row => row.subject)).size, 1);

  const audit = await port.audit();
  assert.equal(audit.audit.ok, true);
  const actual = {
    execution_contract: successorSlice.contract_version,
    card_ref: card.ref,
    run_ref: firstRefs.runRef,
    attempt_ref: card.circulation.attempt_ref,
    beats: ['pf.beat.recovery-golden-1', 'pf.beat.recovery-golden-2'],
    retry_count: card.circulation.retry_count,
    reconciliation_ref: reconciliationRef,
    duplicate_delivery: duplicateCode,
    physical_effects: physicalEffects.size,
    run_events: runEvents,
    final_card_state: card.circulation.state,
    final_identity_ref: card.institutional.identity_ref,
    final_occupancy_ref: card.institutional.occupancy_ref,
    audit_ok: audit.audit.ok,
  };
  if (process.env.UPDATE_POWERFARM_GOLDEN === '1') fs.writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
  const expected = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(actual, expected);
});
