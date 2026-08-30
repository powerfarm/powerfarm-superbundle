import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  InstitutionalRefusalError,
  PINNED_AI_SDK_REVISION_REF,
  wrapToolsWithContinuum,
} from '../../src/index.mjs';
import { PythonContinuumPort } from '../support/python-port.mjs';
import { makeExecutionSlice } from '../support/execution-slice.mjs';

const mappings = { search: { kind: 'tool.invoke.search', subject: 'tool:search' } };
const transcriptGoldenPath = fileURLToPath(new URL('./continuum-transcript.golden.json', import.meta.url));

async function options(actor = 'agent-1', toolCallId = 'call-1') {
  const executionSlice = await makeExecutionSlice({
    actor,
    cardRef: 'pf.card.ai-sdk-golden',
    beatRef: 'pf.beat.ai-sdk-golden',
    attemptRef: 'pf.attempt.ai-sdk-golden',
    directionRef: 'pf.direction.golden-v1',
  });
  return {
    toolCallId,
    messages: [],
    context: { powerfarm: { invocationId: 'engine-local-golden-invocation', executionSlice } },
  };
}

function normalize(events) {
  return events.map(event => ({
    kind: event.kind,
    subject: event.subject,
    actor: event.actor,
    office: event.office,
    authority: event.authority_ref === 'constitutional:genesis' ? 'constitutional:genesis' : event.authority_ref === 'constitutional:root' ? 'constitutional:root' : 'delegated',
    request_id: event.request_id ? event.request_id.replace(/[0-9a-f]{64}/g, '<digest>') : null,
    runtime: event.payload?.runtime ?? null,
    revision_ref: event.payload?.revision_ref ?? null,
    direction_ref: event.payload?.direction_ref ?? event.payload?.provenance?.direction_ref ?? null,
    ecs: event.payload?.effective_capability_set_sha256 ?? event.payload?.provenance?.effective_capability_set_sha256 ?? null,
    arguments_sha256: event.payload?.arguments?.sha256 ? '<sha256>' : null,
    receipt_digest: event.payload?.receipt_digest ? '<sha256>' : null,
    status: event.payload?.status ?? null,
  }));
}

test('golden: AI SDK call crosses Node -> Continuum -> consequence without leaking raw values', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-ai-sdk-golden-'));
  const registry = {
    offices: ['director', 'operations'],
    occupancies: { director: 'human-1', operations: 'agent-1' },
  };
  const port = new PythonContinuumPort({ dbPath: path.join(root, 'institution.db'), registry });
  const boot = await port.bootstrap({
    root_actor: 'human-1',
    grants: [
      { office: 'operations', action: 'tool.invoke.search', subject: 'tool:search' },
      { office: 'operations', action: 'run.start', subject: 'run:*' },
    ],
  });
  assert.equal(boot.ok, true);

  let executions = 0;
  const rawInput = 'RAW-QUERY-MUST-NOT-ENTER-LEDGER';
  const rawOutput = 'RAW-RESULT-MUST-NOT-ENTER-LEDGER';
  const tools = wrapToolsWithContinuum({
    search: {
      description: 'golden search',
      execute: async input => {
        executions += 1;
        return { answer: rawOutput, echoed: input.query };
      },
    },
  }, {
    port,
    mappings,
    revisionRef: PINNED_AI_SDK_REVISION_REF,
  });

  const result = await tools.search.execute({ query: rawInput }, await options());
  assert.equal(result.answer, rawOutput);
  assert.equal(executions, 1);

  const replayOptions = await options();
  await assert.rejects(
    () => tools.search.execute({ query: rawInput }, replayOptions),
    error => error instanceof InstitutionalRefusalError && error.code === 'POWERFARM_ALREADY_COMPLETED',
  );
  assert.equal(executions, 1, 'completed institutional run must not repeat the external effect');

  const eventResponse = await port.events();
  const serialized = JSON.stringify(eventResponse.events);
  assert.equal(serialized.includes(rawInput), false);
  assert.equal(serialized.includes(rawOutput), false);

  const transcript = normalize(eventResponse.events);
  const expectedTranscript = JSON.parse(fs.readFileSync(transcriptGoldenPath, 'utf8'));
  assert.deepEqual(transcript, expectedTranscript);
  const kinds = transcript.map(row => row.kind);
  assert.deepEqual(kinds, [
    'system.genesis',
    'authority.grant',
    'authority.grant',
    'tool.invoke.search',
    'run.start',
    'run.finish',
  ]);
  const intent = transcript[3];
  const run = transcript[4];
  const finish = transcript[5];
  assert.equal(intent.actor, 'agent-1');
  assert.equal(intent.office, 'operations');
  assert.equal(intent.authority, 'delegated');
  assert.equal(intent.arguments_sha256, '<sha256>');
  assert.equal(intent.runtime, 'vercel-ai-sdk');
  assert.equal(intent.revision_ref, PINNED_AI_SDK_REVISION_REF);
  assert.equal(intent.direction_ref, 'pf.direction.golden-v1');
  assert.equal(intent.ecs, 'a'.repeat(64));
  assert.equal(run.kind, 'run.start');
  assert.equal(run.authority, 'delegated');
  assert.equal(finish.kind, 'run.finish');
  assert.equal(finish.status, 'completed');
  assert.equal(finish.receipt_digest, '<sha256>');

  const audit = await port.audit();
  assert.equal(audit.ok, true);
  assert.equal(audit.audit.ok, true);
});

test('golden: Registry occupancy change immediately blocks an old AI SDK actor', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-ai-sdk-occupancy-'));
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

  registry.occupancies.operations = 'agent-2';
  let executions = 0;
  const tools = wrapToolsWithContinuum({
    search: { execute: () => { executions += 1; return 'should not execute'; } },
  }, { port, mappings, revisionRef: PINNED_AI_SDK_REVISION_REF });

  const staleOptions = await options('agent-1', 'call-old');
  await assert.rejects(() => tools.search.execute({}, staleOptions), InstitutionalRefusalError);
  assert.equal(executions, 0);

  const events = (await port.events()).events;
  assert.equal(events.some(event => event.request_id?.includes('call-old')), false);
  assert.equal(events.filter(event => event.kind === 'tool.invoke.search').length, 0);
});
