export function defaultIdentityResolver(_input, options) {
  const pf = options?.context?.powerfarm;
  if (!pf || typeof pf !== 'object') {
    throw new Error('options.context.powerfarm is required by the PowerFarm Process boundary');
  }
  const slice = pf.executionSlice || pf.execution_slice || null;
  if (!slice || typeof slice !== 'object') {
    throw new Error('a sealed ExecutionSlice is required; engine-local identity cannot enter institutional execution');
  }
  return {
    actor: String(slice.principal?.actor || ''),
    office: String(slice.principal?.office || ''),
    invocationId: String(pf.invocationId || pf.invocation_id || ''),
    attempt: Number(pf.attempt || 1),
    directionRef: slice.institutional?.direction_ref || null,
    effectiveCapabilitySetSha256: slice.institutional?.ecs_sha256 || null,
    cardRef: slice.card?.ref || null,
    beatRef: slice.circulation?.beat_ref || null,
    attemptRef: slice.circulation?.attempt_ref || null,
    reconciliationRef: pf.reconciliationRef || pf.reconciliation_ref || null,
    executionSlice: slice,
  };
}
