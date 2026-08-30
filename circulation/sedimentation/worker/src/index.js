import { WorkerEntrypoint } from 'cloudflare:workers';
import { PORT_VERSIONS } from '../../lib/contract.mjs';
import { reconcileFromServiceBindings, validateHeartimeCaller } from './core.mjs';

/**
 * Private, permanent capability-learning reconciliation surface.
 *
 * The Worker never activates an implementation. It reads current organ-owned
 * state and ensures construction, evaluation or succession proposals through
 * their owning ports. Public HTTP remains closed.
 */
export class SedimentationReconciler extends WorkerEntrypoint {
  async reconcile(request) {
    if (request?.contract_version !== PORT_VERSIONS.reconciler) {
      throw new Error(`SedimentationReconciler contract mismatch: expected ${PORT_VERSIONS.reconciler}`);
    }
    const { hint } = validateHeartimeCaller({
      caller: request.caller,
      hint: request.hint,
      expectedIdentityRef: this.env.EXPECTED_HEARTIME_IDENTITY_REF,
      expectedComponentRef: this.env.EXPECTED_HEARTIME_COMPONENT_REF ?? 'pf.runtime.heartime',
    });
    const data = await reconcileFromServiceBindings({ hint, env: this.env });
    return { contract_version: PORT_VERSIONS.reconciler, data };
  }
}

export default {
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
