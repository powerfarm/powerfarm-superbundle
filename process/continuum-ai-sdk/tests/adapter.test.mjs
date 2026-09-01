import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InstitutionalRefusalError,
  PINNED_AI_SDK_REVISION_REF,
  wrapToolsWithContinuum,
} from '../src/index.mjs';
import { makeExecutionSlice } from './support/execution-slice.mjs';

async function context({ actor = 'agent-1', executionSlice = null, powerfarm = {} } = {}) {
  const slice = executionSlice || await makeExecutionSlice({ actor });
  return {
    toolCallId: 'call-1',
    messages: [],
    context: {
      powerfarm: {
        invocationId: 'engine-local-invocation',
        executionSlice: slice,
        ...powerfarm,
      },
    },
  };
}

function fakePort({ allow = true } = {}) {
  const calls = [];
  return {
    calls,
    async admitToolCall(value) {
      calls.push(['admit', value]);
      return allow
        ? { ok: true, decision: 'ALLOW', run_ref: value.refs.runRef, authority_ref: 'evt_grant' }
        : { ok: false, decision: 'DENY', reason: 'institutional authority denied' };
    },
    async completeToolCall(value) { calls.push(['complete', value]); return { ok: true }; },
    async failToolCall(value) { calls.push(['fail', value]); return { ok: true }; },
  };
}

const mappings = { search: { kind: 'tool.invoke.search', subject: 'tool:search' } };

test('admission happens before tool execution and only digests cross the boundary', async () => {
  const port = fakePort();
  let executed = false;
  const rawSecret = 'TOP-SECRET-RAW-INPUT';
  const tools = wrapToolsWithContinuum({
    search: {
      description: 'search',
      execute: async (input, executionOptions) => {
        executed = true;
        assert.match(executionOptions.context.powerfarm.runRef, /^pfx-/);
        assert.equal(executionOptions.context.powerfarm.authorityRef, 'evt_grant');
        assert.equal(executionOptions.context.powerfarm.engineRevisionRef, PINNED_AI_SDK_REVISION_REF);
        return { answer: 'RAW-OUTPUT-SECRET', echoed: input.query };
      },
    },
  }, { port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF });

  const output = await tools.search.execute({ query: rawSecret }, await context());
  assert.equal(executed, true);
  assert.equal(output.echoed, rawSecret);
  assert.deepEqual(port.calls.map(([name]) => name), ['admit', 'complete']);
  const serialized = JSON.stringify(port.calls);
  assert.equal(serialized.includes(rawSecret), false);
  assert.equal(serialized.includes('RAW-OUTPUT-SECRET'), false);
  assert.match(port.calls[0][1].input_evidence.sha256, /^[0-9a-f]{64}$/);
  assert.match(port.calls[1][1].output_evidence.sha256, /^[0-9a-f]{64}$/);
});

test('institutional denial prevents original execute from running', async () => {
  const port = fakePort({ allow: false });
  let executions = 0;
  const tools = wrapToolsWithContinuum({ search: { execute: () => { executions += 1; return 'bad'; } } }, {
    port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF,
  });
  const ctx = await context();
  await assert.rejects(() => tools.search.execute({}, ctx), InstitutionalRefusalError);
  assert.equal(executions, 0);
  assert.deepEqual(port.calls.map(([name]) => name), ['admit']);
});

test('execution failure is reported after an admitted run', async () => {
  const port = fakePort();
  const tools = wrapToolsWithContinuum({ search: { execute: () => { throw new Error('raw failure detail'); } } }, {
    port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF,
  });
  const ctx = await context();
  await assert.rejects(() => tools.search.execute({}, ctx), /raw failure detail/);
  assert.deepEqual(port.calls.map(([name]) => name), ['admit', 'fail']);
  assert.equal(JSON.stringify(port.calls[1]).includes('raw failure detail'), false);
});

test('streaming output closes only after the stream completes', async () => {
  const port = fakePort();
  const tools = wrapToolsWithContinuum({
    search: {
      async *execute() {
        yield { n: 1 };
        yield { n: 2 };
      },
    },
  }, { port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF });

  const stream = await tools.search.execute({}, await context());
  const received = [];
  for await (const value of stream) received.push(value);
  assert.deepEqual(received, [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(port.calls.map(([name]) => name), ['admit', 'complete']);
});

test('institutional execution refuses engine-local context without a sealed ExecutionSlice', async () => {
  const port = fakePort();
  let executions = 0;
  const tools = wrapToolsWithContinuum({ search: { execute: () => { executions += 1; return 'bad'; } } }, {
    port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF,
  });
  await assert.rejects(
    () => tools.search.execute({}, { toolCallId: 'legacy-call', context: { powerfarm: { actor: 'agent-1', office: 'operations' } } }),
    error => error instanceof InstitutionalRefusalError && error.code === 'POWERFARM_CONTEXT_INVALID',
  );
  assert.equal(executions, 0);
  assert.equal(port.calls.length, 0);
});

test('strict mode refuses provider-executed tools that bypass local execute', () => {
  const port = fakePort();
  assert.throws(
    () => wrapToolsWithContinuum({ webSearch: { type: 'provider-defined', id: 'provider.search' } }, {
      port,
      mappings: { webSearch: { kind: 'tool.invoke.web-search', subject: 'tool:web-search' } },
      revisionRef: PINNED_AI_SDK_REVISION_REF,
    }),
    /no local execute\(\) boundary/,
  );
});

test('strict mode requires an explicit institutional mapping', () => {
  const port = fakePort();
  assert.throws(
    () => wrapToolsWithContinuum({ search: { execute: () => 'x' } }, { port, revisionRef: PINNED_AI_SDK_REVISION_REF }),
    /no explicit institutional mapping/,
  );
});

// --- ExecutionSlice v4 resource-window negative controls -------------------
//
// A slice may be derived while its authorization is valid and then reach the
// engine after that authorization has expired. The Setting must revalidate the
// sealed window against its own clock, immediately before the external effect.

const WINDOW_EFFECTIVE = '2026-08-30T00:00:00.000Z';
const WINDOW_EXPIRY = '2026-08-30T01:00:00.000Z';
const AFTER_WINDOW_EXPIRY = '2026-08-30T01:00:00.001Z';

async function expiringSlice(overrides = {}) {
  return makeExecutionSlice({
    evaluatedAt: WINDOW_EFFECTIVE,
    effectiveAt: WINDOW_EFFECTIVE,
    energyExpiresAt: WINDOW_EXPIRY,
    costExpiresAt: WINDOW_EXPIRY,
    ...overrides,
  });
}

test('a slice admitted while valid does not execute after its resource window expired', async () => {
  const port = fakePort();
  let executions = 0;
  const tools = wrapToolsWithContinuum({ search: { execute: () => { executions += 1; return 'effect'; } } }, {
    port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF, clock: () => AFTER_WINDOW_EXPIRY,
  });
  const ctx = await context({ executionSlice: await expiringSlice() });
  await assert.rejects(
    () => tools.search.execute({}, ctx),
    error => error instanceof InstitutionalRefusalError
      && error.code === 'POWERFARM_RESOURCE_WINDOW_INVALID'
      && /energy authorization expired before execution/.test(error.message),
  );
  assert.equal(executions, 0, 'no external effect may run outside the authorization window');
  // Admission was already recorded, so the run must be closed as a failure
  // rather than silently abandoned.
  assert.deepEqual(port.calls.map(([name]) => name), ['admit', 'fail']);
});

test('expires_at is an exclusive upper boundary at the engine execution boundary', async () => {
  const port = fakePort();
  let executions = 0;
  const tools = wrapToolsWithContinuum({ search: { execute: () => { executions += 1; return 'effect'; } } }, {
    port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF, clock: () => WINDOW_EXPIRY,
  });
  const expiredCtx = await context({ executionSlice: await expiringSlice() });
  await assert.rejects(
    () => tools.search.execute({}, expiredCtx),
    error => error instanceof InstitutionalRefusalError && error.code === 'POWERFARM_RESOURCE_WINDOW_INVALID',
  );
  assert.equal(executions, 0);

  const stillValid = fakePort();
  const okTools = wrapToolsWithContinuum({ search: { execute: () => 'effect' } }, {
    port: stillValid,
    mappings,
    revisionRef: PINNED_AI_SDK_REVISION_REF,
    clock: () => new Date(Date.parse(WINDOW_EXPIRY) - 1).toISOString(),
  });
  assert.equal(await okTools.search.execute({}, await context({ executionSlice: await expiringSlice() })), 'effect');
});

test('an expired cost window alone stops execution', async () => {
  const port = fakePort();
  let executions = 0;
  const tools = wrapToolsWithContinuum({ search: { execute: () => { executions += 1; return 'effect'; } } }, {
    port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF, clock: () => AFTER_WINDOW_EXPIRY,
  });
  const costExpiredCtx = await context({ executionSlice: await expiringSlice({ energyExpiresAt: null }) });
  await assert.rejects(
    () => tools.search.execute({}, costExpiredCtx),
    error => /cost authorization expired before execution/.test(error.message),
  );
  assert.equal(executions, 0);
});

test('engine identity and a successor occupant cannot widen an expired resource window', async () => {
  const expired = await expiringSlice();

  // A successor occupant re-sealing the slice does not re-authorize it.
  const successor = structuredClone(expired);
  successor.principal.actor = 'agent-2';
  delete successor.slice_sha256;
  const { sealExecutionSlice } = await import('../../../circulation/cards/lib/execution-slice.mjs');
  const resealed = await sealExecutionSlice(successor);

  const port = fakePort();
  let executions = 0;
  const tools = wrapToolsWithContinuum({ search: { execute: () => { executions += 1; return 'effect'; } } }, {
    port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF, clock: () => AFTER_WINDOW_EXPIRY,
  });
  const successorCtx = await context({ executionSlice: resealed, powerfarm: { invocationId: 'fresh-engine-invocation' } });
  await assert.rejects(
    () => tools.search.execute({}, successorCtx),
    error => error instanceof InstitutionalRefusalError && error.code === 'POWERFARM_RESOURCE_WINDOW_INVALID',
  );
  assert.equal(executions, 0);

  // Hand-widening the window breaks the seal, so the Setting refuses it before
  // admission is even attempted.
  const tampered = structuredClone(expired);
  tampered.resources.authorization_window.energy.expires_at = '2099-01-01T00:00:00.000Z';
  tampered.resources.authorization_window.cost.expires_at = '2099-01-01T00:00:00.000Z';
  const tamperPort = fakePort();
  const tamperTools = wrapToolsWithContinuum({ search: { execute: () => { executions += 1; return 'effect'; } } }, {
    port: tamperPort, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF, clock: () => AFTER_WINDOW_EXPIRY,
  });
  const tamperCtx = await context({ executionSlice: tampered });
  await assert.rejects(
    () => tamperTools.search.execute({}, tamperCtx),
    error => error instanceof InstitutionalRefusalError
      && error.code === 'POWERFARM_CONTEXT_INVALID'
      && /seal mismatch/.test(error.message),
  );
  assert.equal(executions, 0);
  assert.equal(tamperPort.calls.length, 0, 'a tampered slice never reaches Process admission');
});
