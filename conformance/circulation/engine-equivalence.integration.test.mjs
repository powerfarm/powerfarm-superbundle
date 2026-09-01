import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createCardV1,
  deriveExecutionSlice,
  emitCard,
  executionRefsFromSlice,
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
const ADK_DRIVER = path.join(ROOT, 'conformance/circulation/support/adk-execution-driver.py');
const MAF_DRIVER = path.join(ROOT, 'conformance/circulation/support/maf-execution-driver.py');
const GOLDEN = path.join(ROOT, 'conformance/circulation/golden/engine-equivalence.golden.json');
const ADK_REVISION_REF = 'google-adk==2.8.0';
const MAF_REVISION_REF = 'microsoft-agent-framework==1.16.0';
import { PythonContinuumPort } from '../../process/continuum-ai-sdk/tests/support/python-port.mjs';

const T0 = '2026-08-30T03:00:00.000Z';
const T1 = '2026-08-30T03:01:00.000Z';
const T2 = '2026-08-30T03:02:00.000Z';
const T3 = '2026-08-30T03:03:00.000Z';
const MAPPINGS = { search: { kind: 'tool.invoke.search', subject: 'tool:search' } };

function normalize(events) {
  return events
    .filter(event => ['tool.invoke.search', 'run.start', 'run.finish', 'run.fail'].includes(event.kind))
    .map(event => {
      const payload = event.payload || {};
      const provenance = payload.provenance || {};
      return {
        kind: event.kind,
        subject: event.subject,
        actor: event.actor,
        office: event.office,
        request_id: event.request_id ?? null,
        run_ref: payload.run_ref ?? (String(event.subject).startsWith('run:') ? String(event.subject).slice(4) : null),
        card_ref: payload.card_ref ?? provenance.card_ref ?? null,
        beat_ref: payload.beat_ref ?? provenance.beat_ref ?? null,
        attempt_ref: payload.attempt_ref ?? provenance.attempt_ref ?? null,
        direction_ref: payload.direction_ref ?? provenance.direction_ref ?? null,
        ecs: payload.effective_capability_set_sha256 ?? provenance.effective_capability_set_sha256 ?? null,
        execution_slice_sha256: payload.execution_slice_sha256 ?? provenance.execution_slice_sha256 ?? null,
        status: payload.status ?? null,
        capability_ref: payload.capability_ref ?? null,
      };
    });
}

function runPythonJson(script, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONPATH: [
          path.join(ROOT, 'process/continuum'),
          path.join(ROOT, 'process/continuum-adk/src'),
          path.join(ROOT, 'process/continuum-maf/src'),
          process.env.PYTHONPATH,
        ].filter(Boolean).join(delimiter),
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`ADK equivalence driver exited ${code}: ${stderr.trim()}\n${stdout.trim()}`));
      try { resolve(JSON.parse(stdout)); }
      catch (error) { reject(new Error(`ADK equivalence driver returned invalid JSON: ${stdout.slice(0, 1000)}`, { cause: error })); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

async function executableCard() {
  let card = await createCardV1({
    ref: 'pf.card.engine-equivalence-golden',
    scope: 'pf.office.operations',
    created_at: T0,
    institutional: {
      identity_ref: 'pf.identity.agent-1',
      office_ref: 'pf.office.operations',
      occupancy_ref: 'pf.occupancy.agent-1',
      direction_ref: 'pf.direction.engine-equivalence',
      authority_ref: 'continuum:projected-at-admission',
      ecs_sha256: 'c'.repeat(64),
    },
    attention: { why: 'prove engine interchangeability under one institutional Card attempt', response_contract: 'act' },
    energy: { authorization: makeEnergyAuthorization({ authorizationRef: 'pf.energy-authorization.golden', limits: { beats: 4, model_tokens: 100000, tool_calls: 20, network_calls: 20, compute_ms: 600000, sandbox_ms: 600000, wall_ms: 900000, human_attention_ms: 600000 }, effectiveAt: T0 }) },
    cost: { authorization: makeCostAuthorization({ authorizationRef: 'pf.cost-authorization.golden', currency: 'USD', mode: 'capped', ceilingMicros: 10_000_000, effectiveAt: T0 }) },
    circulation: { state: 'prepared', priority: 11, deadline: '2026-08-30T04:00:00.000Z', next_expected: T0 },
  });
  card = (await emitCard(card, { at: T0, beatRef: 'pf.beat.engine-equivalence-golden', nextExpected: T1 })).card;
  card = (await transitionCard(card, { to: 'acknowledged', at: T1, nextExpected: T2 })).card;
  card = (await transitionCard(card, {
    to: 'executing', at: T2, attemptRef: 'pf.attempt.engine-equivalence-golden', nextExpected: T3,
  })).card;
  return card;
}

async function runAiSdk(executionSlice, rawInput, rawOutput) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-engine-equivalence-ai-'));
  const registry = { offices: ['director', 'operations'], occupancies: { director: 'human-1', operations: 'agent-1' } };
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
        return { answer: rawOutput };
      },
    },
  }, { port, mappings: MAPPINGS, revisionRef: PINNED_AI_SDK_REVISION_REF });

  const options = {
    toolCallId: 'ai-sdk-local-call-id',
    messages: [],
    context: { powerfarm: { invocationId: 'ai-sdk-local-invocation-id', executionSlice } },
  };
  await tools.search.execute({ query: rawInput }, options);
  let replayCode = null;
  await assert.rejects(
    () => tools.search.execute({ query: rawInput }, options),
    error => {
      replayCode = error?.code ?? null;
      return error instanceof InstitutionalRefusalError && error.code === 'POWERFARM_ALREADY_COMPLETED';
    },
  );

  const events = (await port.events()).events;
  const serialized = JSON.stringify(events);
  const audit = await port.audit();
  return {
    effects,
    replay_code: replayCode,
    raw_values_absent: !serialized.includes(rawInput) && !serialized.includes(rawOutput),
    refs: await executionRefsFromSlice(executionSlice),
    events: normalize(events),
    audit_ok: audit.audit.ok,
  };
}

test('golden engine equivalence: one ExecutionSlice has one institutional meaning across AI SDK, ADK, and Microsoft Agent Framework', async () => {
  const card = await executableCard();
  const executionSlice = await deriveExecutionSlice(card, {
    actor: 'agent-1',
    office: 'operations',
    toolName: 'search',
    kind: 'tool.invoke.search',
    subject: 'tool:search',
    evaluatedAt: T2,
  });
  const rawInput = 'RAW-ENGINE-EQUIVALENCE-INPUT';
  const rawOutput = 'RAW-ENGINE-EQUIVALENCE-OUTPUT';

  const ai = await runAiSdk(executionSlice, rawInput, rawOutput);
  const adk = await runPythonJson(ADK_DRIVER, {
    execution_slice: executionSlice,
    revision_ref: ADK_REVISION_REF,
    raw_input: rawInput,
    raw_output: rawOutput,
  });
  const maf = await runPythonJson(MAF_DRIVER, {
    execution_slice: executionSlice,
    revision_ref: MAF_REVISION_REF,
    raw_input: rawInput,
    raw_output: rawOutput,
  });

  assert.equal(adk.ok, true);
  assert.equal(maf.ok, true);
  assert.equal(ai.effects, 1);
  assert.equal(adk.effects, 1);
  assert.equal(maf.effects, 1);
  assert.equal(ai.replay_code, 'POWERFARM_ALREADY_COMPLETED');
  assert.equal(adk.replay_code, 'POWERFARM_ALREADY_COMPLETED');
  assert.equal(maf.replay_code, 'POWERFARM_ALREADY_COMPLETED');
  assert.equal(ai.raw_values_absent, true);
  assert.equal(adk.raw_values_absent, true);
  assert.equal(maf.raw_values_absent, true);
  assert.equal(ai.audit_ok, true);
  assert.equal(adk.audit_ok, true);
  assert.equal(maf.audit_ok, true);

  assert.deepEqual(adk.refs, ai.refs, 'engine-local invocation ids must not change institutional run identity');
  assert.deepEqual(maf.refs, ai.refs, 'Microsoft Agent Framework must share the same institutional run identity');
  assert.deepEqual(adk.events, ai.events, 'normalized institutional consequence must be engine-equivalent');
  assert.deepEqual(maf.events, ai.events, 'Microsoft Agent Framework consequence must be institutionally equivalent');

  const actual = {
    contract_version: executionSlice.contract_version,
    card_ref: executionSlice.card.ref,
    execution_slice_sha256: executionSlice.slice_sha256,
    run_ref: ai.refs.runRef,
    request_ids: {
      intent: ai.refs.intentRequestId,
      run: ai.refs.runRequestId,
      outcome: ai.refs.outcomeRequestId,
    },
    institutional_events: ai.events,
    engines: {
      'vercel-ai-sdk': { revision_ref: PINNED_AI_SDK_REVISION_REF, effects: ai.effects, replay_code: ai.replay_code },
      'google-adk': { revision_ref: ADK_REVISION_REF, effects: adk.effects, replay_code: adk.replay_code },
      'microsoft-agent-framework': { revision_ref: MAF_REVISION_REF, effects: maf.effects, replay_code: maf.replay_code },
    },
    raw_values_absent: ai.raw_values_absent && adk.raw_values_absent && maf.raw_values_absent,
    audits_ok: ai.audit_ok && adk.audit_ok && maf.audit_ok,
  };

  if (process.env.UPDATE_POWERFARM_GOLDEN === '1') {
    fs.writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
  }
  const expected = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(actual, expected);
});
