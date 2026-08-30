import {
  HEARTIME_PORT_VERSIONS,
  validateCallerContext,
} from '../../../circulation/lib/contract.mjs';
import {
  ATTENTION_RECONCILER_REF,
  PORT_VERSIONS as ATTENTION_PORT_VERSIONS,
  validateReconciliationSummary,
} from '../../../circulation/attention/lib/contract.mjs';
import {
  PORT_VERSIONS as SEDIMENTATION_PORT_VERSIONS,
  SEDIMENTATION_RECONCILER_REF,
  validateSedimentationSummary,
} from '../../../circulation/sedimentation/lib/contract.mjs';

function requireMethod(binding, method, label) {
  if (!binding || typeof binding[method] !== 'function') throw new TypeError(`${label}.${method} RPC method is required`);
}

async function invoke(binding, method, label, contractVersion, caller, payload) {
  requireMethod(binding, method, label);
  validateCallerContext(caller, `${label} caller`);
  const envelope = await binding[method]({ contract_version: contractVersion, caller, ...payload });
  if (!envelope || envelope.contract_version !== contractVersion || !Object.hasOwn(envelope, 'data')) {
    throw new Error(`${label}.${method} contract mismatch`);
  }
  return envelope.data;
}

export function createHeartimeStateRpcPort(binding, caller) {
  return {
    nextWake: (payload) => invoke(binding, 'nextWake', 'HEARTIME_STATE', HEARTIME_PORT_VERSIONS.heartime_state, caller, payload),
    prepareCycle: (payload) => invoke(binding, 'prepareCycle', 'HEARTIME_STATE', HEARTIME_PORT_VERSIONS.heartime_state, caller, payload),
    finishCycle: (payload) => invoke(binding, 'finishCycle', 'HEARTIME_STATE', HEARTIME_PORT_VERSIONS.heartime_state, caller, payload),
    deferFailure: (payload) => invoke(binding, 'deferFailure', 'HEARTIME_STATE', HEARTIME_PORT_VERSIONS.heartime_state, caller, payload),
  };
}

function createReconcilerRpcPort({ binding, caller, label, contractVersion, validateSummary }) {
  return {
    validateSummary,
    reconcile: (hint) => {
      const beatCaller = { ...caller, beat_ref: hint?.beat_ref, trace_ref: hint?.trace_ref ?? caller.trace_ref };
      return invoke(binding, 'reconcile', label, contractVersion, beatCaller, { hint });
    },
  };
}

export function createAttentionReconcilerRpcPort(binding, caller) {
  return createReconcilerRpcPort({
    binding,
    caller,
    label: 'ATTENTION_RECONCILER',
    contractVersion: ATTENTION_PORT_VERSIONS.reconciler,
    validateSummary: validateReconciliationSummary,
  });
}

export function createSedimentationReconcilerRpcPort(binding, caller) {
  return createReconcilerRpcPort({
    binding,
    caller,
    label: 'SEDIMENTATION_RECONCILER',
    contractVersion: SEDIMENTATION_PORT_VERSIONS.reconciler,
    validateSummary: validateSedimentationSummary,
  });
}

export function createReconcilerRouter({ attentionBinding, sedimentationBinding, caller }) {
  const ports = new Map();
  if (attentionBinding) ports.set(ATTENTION_RECONCILER_REF, createAttentionReconcilerRpcPort(attentionBinding, caller));
  if (sedimentationBinding) {
    ports.set(SEDIMENTATION_RECONCILER_REF, createSedimentationReconcilerRpcPort(sedimentationBinding, caller));
  }
  return (reconcilerRef) => {
    const port = ports.get(reconcilerRef);
    if (!port) throw new Error(`no physical reconciler binding for ${reconcilerRef}`);
    return port;
  };
}
