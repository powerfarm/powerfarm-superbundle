import { digestSummary, errorEvidence } from './canonical.mjs';
import { defaultIdentityResolver } from './identity.mjs';
import { DottedToolPolicy } from './mapping.mjs';
import { InstitutionalRefusalError } from './refusal.mjs';
import {
  assertExecutionSliceTemporallyExecutable,
  executionRefsFromSlice,
  verifyExecutionSliceSeal,
} from '../../../circulation/cards/lib/execution-slice.mjs';

export const AI_SDK_RUNTIME = 'vercel-ai-sdk';

function isAsyncIterable(value) {
  return value != null && typeof value[Symbol.asyncIterator] === 'function';
}

function refusalFrom(response, toolName) {
  return new InstitutionalRefusalError({
    reason: response?.reason || 'institutional authority denied',
    code: response?.code || 'POWERFARM_REFUSED',
    decision: response?.decision || 'DENY',
    toolName,
    runRef: response?.run_ref || null,
  });
}

export function wrapToolsWithContinuum(tools, {
  port,
  revisionRef,
  mappings = {},
  strict = true,
  identityResolver = defaultIdentityResolver,
  runtimeName = AI_SDK_RUNTIME,
  clock = () => new Date().toISOString(),
} = {}) {
  if (!port || typeof port.admitToolCall !== 'function' || typeof port.completeToolCall !== 'function' || typeof port.failToolCall !== 'function') {
    throw new TypeError('a ProcessPort with admitToolCall/completeToolCall/failToolCall is required');
  }
  if (strict && (!revisionRef || revisionRef === 'unspecified')) {
    throw new Error('strict continuum-ai-sdk requires a concrete pinned revisionRef');
  }
  if (typeof clock !== 'function') throw new TypeError('clock must be a function returning an ISO timestamp');
  const policy = new DottedToolPolicy({ mappings, strict });
  const wrapped = Object.create(null);

  for (const [toolName, tool] of Object.entries(tools || {})) {
    if (!tool || typeof tool !== 'object') throw new TypeError(`tool ${toolName} is not an object`);
    if (typeof tool.execute !== 'function') {
      if (strict) {
        throw new Error(`tool ${toolName} has no local execute() boundary; provider-executed tools fail closed`);
      }
      wrapped[toolName] = tool;
      continue;
    }

    const originalExecute = tool.execute.bind(tool);
    const projection = policy.project(toolName);
    wrapped[toolName] = {
      ...tool,
      execute(input, options) {
        return executeInstitutionally({
          input,
          options,
          toolName,
          originalExecute,
          projection,
          port,
          revisionRef,
          identityResolver,
          runtimeName,
          clock,
        });
      },
    };
  }
  return wrapped;
}

async function executeInstitutionally({ input, options, toolName, originalExecute, projection, port, revisionRef, identityResolver, runtimeName, clock }) {
  let identity;
  let refs;
  try {
    identity = identityResolver(input, options);
    if (!(await verifyExecutionSliceSeal(identity.executionSlice))) throw new Error('ExecutionSlice content seal mismatch');
    if (identity.executionSlice.capability.tool_name !== toolName) throw new Error('ExecutionSlice tool_name does not match executing tool');
    if (identity.executionSlice.capability.kind !== projection.kind || identity.executionSlice.capability.subject !== projection.subject) {
      throw new Error('ExecutionSlice capability projection does not match Process mapping');
    }
    refs = await executionRefsFromSlice(identity.executionSlice);
  } catch (error) {
    throw new InstitutionalRefusalError({ reason: String(error.message || error), code: 'POWERFARM_CONTEXT_INVALID', toolName });
  }

  let admission;
  try {
    admission = await port.admitToolCall({
      actor: identity.actor,
      office: identity.office,
      tool_name: toolName,
      kind: projection.kind,
      subject: projection.subject,
      runtime: runtimeName,
      revision_ref: revisionRef,
      direction_ref: identity.directionRef,
      effective_capability_set_sha256: identity.effectiveCapabilitySetSha256,
      card_ref: identity.cardRef,
      beat_ref: identity.beatRef,
      attempt_ref: identity.attemptRef,
      execution_slice_sha256: identity.executionSlice?.slice_sha256 || null,
      reconciliation_ref: identity.reconciliationRef || null,
      input_evidence: digestSummary(input),
      refs,
    });
  } catch {
    throw new InstitutionalRefusalError({ reason: 'admission infrastructure failed', code: 'POWERFARM_ADMISSION_UNAVAILABLE', toolName });
  }
  if (!admission?.ok || admission.decision !== 'ALLOW') throw refusalFrom(admission, toolName);

  try {
    assertExecutionSliceTemporallyExecutable(identity.executionSlice, { now: clock() });
  } catch (error) {
    await safeFail(port, admission, refs, error);
    throw new InstitutionalRefusalError({
      reason: String(error.message || error),
      code: 'POWERFARM_RESOURCE_WINDOW_INVALID',
      toolName,
      runRef: admission.run_ref || refs.runRef,
    });
  }

  const executionOptions = {
    ...options,
    context: {
      ...(options?.context || {}),
      powerfarm: {
        ...(options?.context?.powerfarm || {}),
        runRef: admission.run_ref || refs.runRef,
        authorityRef: admission.authority_ref || null,
        engineRevisionRef: revisionRef,
        executionSliceSha256: identity.executionSlice?.slice_sha256 || null,
        resourceBudget: identity.executionSlice?.resources || null,
        idempotencyKey: admission.run_ref || refs.runRef,
      },
    },
  };

  let result;
  try {
    result = originalExecute(input, executionOptions);
  } catch (error) {
    await safeFail(port, admission, refs, error);
    throw error;
  }

  if (isAsyncIterable(result)) {
    return wrapStream({ stream: result, port, admission, refs, toolName });
  }

  try {
    const output = await result;
    await port.completeToolCall({
      refs,
      admission,
      output_evidence: digestSummary(output),
    });
    return output;
  } catch (error) {
    await safeFail(port, admission, refs, error);
    throw error;
  }
}

async function safeFail(port, admission, refs, error) {
  try {
    await port.failToolCall({ refs, admission, error_evidence: errorEvidence(error) });
  } catch {
    // Execution errors must remain execution errors. Outcome recording failure
    // is observable through the still-open Continuum run and reconciliation.
  }
}

function wrapStream({ stream, port, admission, refs, toolName }) {
  return (async function* () {
    let finalValue;
    let completed = false;
    try {
      for await (const value of stream) {
        finalValue = value;
        yield value;
      }
      completed = true;
      await port.completeToolCall({ refs, admission, output_evidence: digestSummary(finalValue) });
    } catch (error) {
      await safeFail(port, admission, refs, error);
      throw error;
    } finally {
      if (!completed) {
        await safeFail(port, admission, refs, new Error(`AI SDK stream for ${toolName} did not complete`));
      }
    }
  })();
}
