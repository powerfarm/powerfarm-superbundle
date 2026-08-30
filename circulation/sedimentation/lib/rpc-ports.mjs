import {
  PORT_VERSIONS,
  validateCallerContext,
} from './contract.mjs';
import { requireMethod } from '../../lib/contract.mjs';

async function invoke(binding, method, label, contractVersion, caller, payload) {
  requireMethod(binding, method, label);
  validateCallerContext(caller, `${label} caller`);
  const envelope = await binding[method]({
    contract_version: contractVersion,
    caller,
    ...payload,
  });
  if (!envelope || envelope.contract_version !== contractVersion || !Object.hasOwn(envelope, 'data')) {
    throw new Error(`${label}.${method} contract mismatch`);
  }
  return envelope.data;
}

export function createCapabilityLearningRpcPorts(env, caller) {
  if (!env || typeof env !== 'object') throw new TypeError('sedimentation Worker environment is required');
  return {
    registry: {
      resolveLearningScope: (payload) => invoke(
        env.REGISTRY,
        'resolveCapabilityLearningScope',
        'REGISTRY',
        PORT_VERSIONS.registry,
        caller,
        payload,
      ),
      findCandidate: (payload) => invoke(
        env.REGISTRY,
        'findCapabilityImplementationCandidate',
        'REGISTRY',
        PORT_VERSIONS.registry,
        caller,
        payload,
      ),
    },
    evidence: {
      profileWorkClass: (payload) => invoke(
        env.EVIDENCE_STORE,
        'profileCapabilityWorkClass',
        'EVIDENCE_STORE',
        PORT_VERSIONS.evidence,
        caller,
        payload,
      ),
      assessCandidate: (payload) => invoke(
        env.EVIDENCE_STORE,
        'assessCapabilityImplementation',
        'EVIDENCE_STORE',
        PORT_VERSIONS.evidence,
        caller,
        payload,
      ),
      recordDecision: (payload) => invoke(
        env.EVIDENCE_STORE,
        'recordCapabilityLearningEvidence',
        'EVIDENCE_STORE',
        PORT_VERSIONS.evidence,
        caller,
        payload,
      ),
    },
    imagineering: {
      ensureConstruction: (payload) => invoke(
        env.IMAGINEERING,
        'ensureCapabilityConstruction',
        'IMAGINEERING',
        PORT_VERSIONS.imagineering,
        caller,
        payload,
      ),
      ensureEvaluation: (payload) => invoke(
        env.IMAGINEERING,
        'ensureCapabilityEvaluation',
        'IMAGINEERING',
        PORT_VERSIONS.imagineering,
        caller,
        payload,
      ),
    },
    process: {
      ensureTransitionProposal: (payload) => invoke(
        env.PROCESS,
        'ensureCapabilityTransitionProposal',
        'PROCESS',
        PORT_VERSIONS.process,
        caller,
        payload,
      ),
    },
  };
}
