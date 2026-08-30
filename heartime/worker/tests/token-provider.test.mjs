import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ExplicitStaticBearerProvider,
  RegistryRuntimeTokenProvider,
  createHeartimeTokenProviderFromEnv,
} from '../src/token-provider.mjs';
import { PORT_VERSIONS } from '../../../circulation/attention/lib/contract.mjs';

function jwt(expSeconds, extra = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: expSeconds, ...extra })}.signature`;
}

test('Registry token port is versioned, subject-bound and cached only while fresh', async () => {
  let calls = 0;
  const nowMs = Date.parse('2026-08-23T12:00:00Z');
  const binding = {
    async issueRuntimeToken(request) {
      calls += 1;
      assert.equal(request.contract_version, PORT_VERSIONS.runtime_token);
      assert.equal(request.subject_ref, 'pf.runtime.heartime');
      assert.equal(request.caller.identity_ref, 'pf.runtime.heartime');
      assert.equal(request.caller.component_ref, 'pf.runtime.heartime');
      return {
        contract_version: PORT_VERSIONS.runtime_token,
        data: {
          access_token: `token-${calls}`,
          expires_at: new Date(nowMs + 10 * 60_000).toISOString(),
          subject_ref: 'pf.runtime.heartime',
        },
      };
    },
  };
  const provider = new RegistryRuntimeTokenProvider({ binding, now: () => nowMs });
  assert.equal(await provider.getToken(), 'token-1');
  assert.equal(await provider.getToken(), 'token-1');
  assert.equal(calls, 1);
  provider.invalidate();
  assert.equal(await provider.getToken(), 'token-2');
  assert.equal(calls, 2);
});

test('Registry token port fails closed on contract, subject and lifetime mismatch', async () => {
  const nowMs = Date.parse('2026-08-23T12:00:00Z');
  const make = (envelope) => new RegistryRuntimeTokenProvider({
    binding: { issueRuntimeToken: async () => envelope },
    now: () => nowMs,
  });
  await assert.rejects(() => make({ contract_version: 'wrong', data: {} }).getToken(), /contract mismatch/);
  await assert.rejects(() => make({
    contract_version: PORT_VERSIONS.runtime_token,
    data: { access_token: 'opaque', expires_at: new Date(nowMs + 600_000).toISOString(), subject_ref: 'pf.runtime.other' },
  }).getToken(), /subject mismatch/);
  await assert.rejects(() => make({
    contract_version: PORT_VERSIONS.runtime_token,
    data: { access_token: 'opaque', expires_at: new Date(nowMs + 20_000).toISOString(), subject_ref: 'pf.runtime.heartime' },
  }).getToken(), /lifetime/);
});

test('static bearer is an explicit local fallback and checks JWT expiry', async () => {
  const nowMs = Date.parse('2026-08-23T12:00:00Z');
  assert.throws(() => new ExplicitStaticBearerProvider({ token: 'x' }), /disabled/);
  const fresh = new ExplicitStaticBearerProvider({
    token: jwt(Math.floor((nowMs + 600_000) / 1000)),
    allowStatic: true,
    now: () => nowMs,
  });
  assert.match(await fresh.getToken(), /\./);
  const stale = new ExplicitStaticBearerProvider({
    token: jwt(Math.floor((nowMs + 10_000) / 1000)),
    allowStatic: true,
    now: () => nowMs,
  });
  await assert.rejects(() => stale.getToken(), /expired|too close/);
});

test('environment prefers Registry identity and refuses implicit static credentials', () => {
  const binding = { issueRuntimeToken: async () => ({}) };
  const provider = createHeartimeTokenProviderFromEnv({ REGISTRY_IDENTITY: binding });
  assert.equal(provider instanceof RegistryRuntimeTokenProvider, true);
  assert.throws(() => createHeartimeTokenProviderFromEnv({ HEARTIME_BEARER: 'x' }), /disabled/);
  const fallback = createHeartimeTokenProviderFromEnv({
    HEARTIME_BEARER: 'opaque-local-token',
    HEARTIME_ALLOW_STATIC_BEARER: 'true',
  });
  assert.equal(fallback instanceof ExplicitStaticBearerProvider, true);
});



test('runtime token subject must remain a canonical institutional reference', async () => {
  const nowMs = Date.parse('2026-08-23T12:00:00Z');
  const provider = new RegistryRuntimeTokenProvider({
    binding: {
      async issueRuntimeToken() {
        return {
          contract_version: PORT_VERSIONS.runtime_token,
          data: {
            access_token: jwt(Math.floor((nowMs + 300_000) / 1000)),
            expires_at: nowMs + 300_000,
            subject_ref: 'heartime-not-canonical',
          },
        };
      },
    },
    now: () => nowMs,
  });
  await assert.rejects(() => provider.getToken(), /canonical pf\.\* institutional reference syntax/);
});
