import { reconcileSedimentation } from '../../lib/controller.mjs';
import { createCapabilityLearningRpcPorts } from '../../lib/rpc-ports.mjs';
import {
  SEDIMENTATION_RECONCILER_REF,
  SEDIMENTATION_RECONCILER_RUNTIME_REF,
  assertInstitutionalRef,
  validateCallerContext,
  validateWakeHint,
} from '../../lib/contract.mjs';

export function validateHeartimeCaller({
  caller,
  hint,
  expectedIdentityRef,
  expectedComponentRef = 'pf.runtime.heartime',
}) {
  const validatedCaller = validateCallerContext(caller, 'Heartime caller');
  const wake = validateWakeHint(hint);
  const expectedIdentity = assertInstitutionalRef(expectedIdentityRef, 'EXPECTED_HEARTIME_IDENTITY_REF');
  const expectedComponent = assertInstitutionalRef(expectedComponentRef, 'EXPECTED_HEARTIME_COMPONENT_REF');
  if (validatedCaller.identity_ref !== expectedIdentity) {
    throw new Error(`SedimentationReconciler caller mismatch: expected ${expectedIdentity}`);
  }
  if (validatedCaller.component_ref !== expectedComponent) {
    throw new Error(`SedimentationReconciler component mismatch: expected ${expectedComponent}`);
  }
  if (validatedCaller.beat_ref !== wake.beat_ref) {
    throw new Error('Heartime caller BeatRef does not match wake hint');
  }
  return { caller: validatedCaller, hint: wake };
}

export async function reconcileFromServiceBindings({ hint, env, now = new Date() }) {
  const wake = validateWakeHint(hint);
  const scopeRef = wake.resource_hint;
  if (!scopeRef) throw new Error('sedimentation reconciliation requires a capability learning scope resource hint');
  const identityRef = assertInstitutionalRef(env?.RECONCILER_IDENTITY_REF, 'RECONCILER_IDENTITY_REF');
  const caller = {
    identity_ref: identityRef,
    component_ref: SEDIMENTATION_RECONCILER_RUNTIME_REF,
    beat_ref: wake.beat_ref,
    trace_ref: wake.trace_ref ?? null,
  };
  const ports = createCapabilityLearningRpcPorts(env, caller);
  return reconcileSedimentation({
    scopeRef,
    beatRef: wake.beat_ref,
    now,
    ...ports,
  });
}

export { SEDIMENTATION_RECONCILER_REF };
