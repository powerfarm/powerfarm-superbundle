import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import {
  HEARTIME_PORT_VERSIONS,
  HEARTIME_RUNTIME_REF,
  assertInstitutionalRef,
  validateCallerContext,
} from '../../../circulation/lib/contract.mjs';
import { armFromCanonicalState, runHeartimeAlarm } from './alarm-core.mjs';
import { createHeartimeStateFromEnv } from './postgrest-state.mjs';
import { createReconcilerRouter } from './rpc-ports.mjs';

export class HeartimeClock extends DurableObject {
  stateApi() {
    return createHeartimeStateFromEnv(this.env);
  }

  caller() {
    return {
      identity_ref: assertInstitutionalRef(this.env.HEARTIME_IDENTITY_REF, 'HEARTIME_IDENTITY_REF'),
      component_ref: HEARTIME_RUNTIME_REF,
    };
  }

  reconcilerFor() {
    return createReconcilerRouter({
      attentionBinding: this.env.ATTENTION_RECONCILER,
      sedimentationBinding: this.env.SEDIMENTATION_RECONCILER,
      caller: this.caller(),
    });
  }

  async arm() {
    const next = await armFromCanonicalState({
      stateApi: this.stateApi(),
      storage: this.ctx.storage,
    });
    return { armed_for: next == null ? null : new Date(next).toISOString() };
  }

  async alarm(alarmInfo) {
    const result = await runHeartimeAlarm({
      stateApi: this.stateApi(),
      reconcilerFor: this.reconcilerFor(),
      storage: this.ctx.storage,
      alarmInfo,
    });
    console.log(JSON.stringify({ event: 'heartime.alarm.completed', ...result }));
  }
}

/**
 * Private, versioned Service Binding control surface.
 *
 * The binding is not enough to create institutional identity. The caller must
 * name itself explicitly and match the deployment's admitted control identity.
 */
export class HeartimeControl extends WorkerEntrypoint {
  async arm(request) {
    if (request?.contract_version !== HEARTIME_PORT_VERSIONS.heartime_control) {
      throw new Error(`HeartimeControl contract mismatch: expected ${HEARTIME_PORT_VERSIONS.heartime_control}`);
    }
    const caller = validateCallerContext(request.caller, 'Heartime control caller');
    const expected = assertInstitutionalRef(
      this.env.EXPECTED_CONTROL_IDENTITY_REF,
      'EXPECTED_CONTROL_IDENTITY_REF',
    );
    if (caller.identity_ref !== expected) {
      throw new Error(`HeartimeControl caller mismatch: expected ${expected}`);
    }
    const key = this.env.HEARTIME_CLOCK_KEY || 'primary';
    const data = await this.env.HEARTIME_CLOCK.getByName(key).arm();
    return { contract_version: HEARTIME_PORT_VERSIONS.heartime_control, data };
  }
}

export default {
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
