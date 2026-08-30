# ENGINE_DECISION: Supabase PostgREST for Heartime state

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Engine decisions` · **ENGINE DECISION**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** adapter implemented and locally tested; custom-schema migration and production configuration not run

## Role

Expose Heartime's PostgreSQL functions to the physical Cloudflare setting without embedding database semantics in the Durable Object.

## Mechanism supplied

- authenticated HTTPS RPC into the custom `heartime` schema;
- custom-schema selection through `Accept-Profile` and `Content-Profile`;
- JWT-authenticated PostgreSQL role and RLS context;
- JSON transport for cycle summaries and reference-only Beat hints.

## PowerFarm meaning retained above it

- Heartime deadlines, contracts and Beat identity;
- open-Beat recovery and reconciliation semantics;
- runtime Identity and authority;
- the distinction between pulse, Card, response, Evidence and consequence;
- contract versions and engine succession.

PostgREST transports calls. PostgreSQL is canonical Heartime state. Neither defines Card, Office, authority or consequence.

## Public surface used

```text
/rest/v1/rpc/next_reconciliation_wake_v1
/rest/v1/rpc/prepare_cycle_v1
/rest/v1/rpc/finish_cycle_v1
/rest/v1/rpc/defer_failure_v1
```

The request carries a Supabase publishable key plus a short-lived authenticated access token issued through Registry.

The Registry token request carries the canonical Heartime runtime identity and
component identity explicitly. The HTTP adapter has a bounded timeout, requires
HTTPS outside explicit localhost development, and refreshes an unauthorized
short-lived token at most once before failing closed.

## Credential rule

The Supabase service-role key MUST NOT be used for normal Heartime execution.

Production Heartime obtains a subject-bound, expiring token through:

```text
powerfarm.registry.runtime-token.v1
subject: pf.runtime.heartime
```

A static bearer is an explicitly enabled local fallback only.

## Why the setting is sufficient

The functions are PostgreSQL-native and transactional. PostgREST exposes them without a second state store or bespoke public API. The `heartime` schema remains canonical and the HTTP adapter remains replaceable.

## What survives removal

- all PostgreSQL state and migrations;
- all versioned First Seam contracts;
- Heartime's pure logic and conformance;
- Registry runtime Identity;
- every canonical `pf.*` reference.

A replacement may be direct PostgreSQL through Hyperdrive, another PostgREST deployment, or a small authenticated database membrane.

## Deployment requirements

- add `heartime` to Supabase exposed schemas;
- apply both Heartime migrations under explicit authorization;
- deploy `RegistryRuntimeTokenPort`;
- configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`;
- use HTTPS except for explicit localhost development;
- keep RLS and `public.identidade_atual()` effective.

## Conformance

- custom-schema headers are always sent;
- contract envelopes fail closed;
- HTTP 401 invalidates and refreshes the runtime token once;
- missing or noncanonical identity credentials fail before useful work;
- requests have a bounded timeout;
- PostgreSQL grants and RLS are structurally checked;
- production migration execution remains `NOT RUN` until database Evidence exists.

---

Copyright © 2026 PowerFarm. All rights reserved.
