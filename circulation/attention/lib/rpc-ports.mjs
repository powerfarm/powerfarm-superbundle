import { PORT_VERSIONS, validateCallerContext } from './contract.mjs';

function requireMethod(binding, method, label) {
  if (!binding || typeof binding[method] !== 'function') {
    throw new TypeError(`${label}.${method} RPC method is required`);
  }
}

async function invoke(binding, method, label, contractVersion, caller, payload) {
  requireMethod(binding, method, label);
  validateCallerContext(caller, `${label} caller`);
  const envelope = await binding[method]({
    contract_version: contractVersion,
    caller,
    ...payload,
  });
  if (!envelope || typeof envelope !== 'object') throw new Error(`${label}.${method} returned no contract envelope`);
  if (envelope.contract_version !== contractVersion) {
    throw new Error(`${label}.${method} contract mismatch: expected ${contractVersion}, received ${envelope.contract_version ?? 'none'}`);
  }
  if (!Object.hasOwn(envelope, 'data')) throw new Error(`${label}.${method} omitted data`);
  return envelope.data;
}

export function createCardsRpcPort(binding, caller) {
  return {
    listCurrent: (payload) => invoke(binding, 'listCurrentAttention', 'CARDS', PORT_VERSIONS.cards, caller, payload),
    compileWakePack: (payload) => invoke(binding, 'compileWakePack', 'CARDS', PORT_VERSIONS.cards, caller, payload),
    recordResponse: (payload) => invoke(binding, 'recordAttentionResponse', 'CARDS', PORT_VERSIONS.cards, caller, payload),
  };
}

export function createOccupanciesRpcPort(binding, caller) {
  return {
    resolve: (scope, context) => invoke(binding, 'resolveCurrentOccupancy', 'REGISTRY', PORT_VERSIONS.registry, caller, { scope, ...context }),
  };
}

export function createAuthorityRpcPort(binding, caller) {
  return {
    project: (payload) => invoke(binding, 'projectCardAffordances', 'PROCESS', PORT_VERSIONS.authority, caller, payload),
  };
}

export function createRunsRpcPort(binding, caller) {
  return {
    completedUnrecorded: (scope) => invoke(binding, 'listCompletedAttentionAttempts', 'PLATFORM', PORT_VERSIONS.runs, caller, { scope }),
    markRecorded: (attemptRef, metadata) => invoke(binding, 'markAttentionAttemptRecorded', 'PLATFORM', PORT_VERSIONS.runs, caller, { attempt_ref: attemptRef, ...metadata }),
    ensureAttempt: (payload) => invoke(binding, 'ensureAttentionAttempt', 'PLATFORM', PORT_VERSIONS.runs, caller, payload),
    observe: (attemptRef) => invoke(binding, 'observeAttentionAttempt', 'PLATFORM', PORT_VERSIONS.runs, caller, { attempt_ref: attemptRef }),
  };
}

export function createEvidenceRpcPort(binding, caller) {
  return {
    record: (payload) => invoke(binding, 'recordEvidence', 'EVIDENCE_STORE', PORT_VERSIONS.evidence, caller, payload),
  };
}

export function createFirstSeamRpcPorts(env, caller) {
  if (!env || typeof env !== 'object') throw new TypeError('Worker environment required');
  validateCallerContext(caller, 'First Seam caller');
  return {
    cards: createCardsRpcPort(env.CARDS, caller),
    occupancies: createOccupanciesRpcPort(env.REGISTRY, caller),
    authority: createAuthorityRpcPort(env.PROCESS, caller),
    runs: createRunsRpcPort(env.PLATFORM, caller),
    evidence: createEvidenceRpcPort(env.EVIDENCE_STORE, caller),
  };
}
