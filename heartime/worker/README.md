# Physical Heartime setting

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Organism / Heartime / worker` · **README**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](../README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

This directory lowers permanent Heartime semantics onto two existing engines:

- Cloudflare Durable Object Alarms for physical wake and finite provider retry;
- Supabase/PostgREST for the canonical custom `heartime` PostgreSQL schema.

The provider setting is **built and locally tested, not deployed**. `wrangler.toml.example` contains provider placeholders rather than invented service names.

This first physical setting services only reconciliation contracts whose
`reconciler_ref` is `pf.reconciler.attention`. It deliberately calls
`next_reconciliation_wake_v1` rather than claiming to service every Heartime
obligation. Later seams may add another honest setting or a dispatcher; they
must not narrow the global Heartime clock silently.

## Identity and database access

Production configuration does not use a static user JWT. Heartime calls the versioned Registry port `powerfarm.registry.runtime-token.v1` through the `REGISTRY_IDENTITY` Service Binding and receives a short-lived token for `pf.runtime.heartime`. The token is cached only while safely fresh and is refreshed once on HTTP 401.

A static `HEARTIME_BEARER` exists only as an explicitly enabled local recovery path:

```text
HEARTIME_ALLOW_STATIC_BEARER=true
```

It is disabled by default and rejects an expired or nearly expired JWT.

The Supabase project must expose the `heartime` schema through API settings before deployment. The migrations grant only the required PostgreSQL privileges to `authenticated`; RLS and `public.eh_membro()` remain active.

## Engine evaporation

Durable Object storage contains only the currently armed provider timer. Canonical deadlines, Beats, contracts and observations remain in PostgreSQL. `arm()` reconstructs the alarm from canonical state.

If canonical storage is temporarily unavailable, the Durable Object installs a provider-local fallback alarm carrying no Card or institutional payload. It exists only to prevent Cloudflare's finite alarm retries from silencing Heartime during a database outage.

After a cycle is prepared, the provider alarm is rearmed before any organ
boundary is crossed. A crash after Beat emission therefore leaves both a
durable open Beat and physical energy to look again. A deadline that is already
due is lowered to a provider alarm at least one second in the future, while the
canonical deadline remains unchanged.

Each emitted Beat is completed or deferred independently. If several Beats are
due and a later boundary fails, observations already persisted for earlier
Beats remain admitted. The setting does not hold a whole batch hostage to one
provider invocation.

The private `HeartimeControl.arm()` surface admits an explicit canonical caller
identity. Heartime also binds its exact `BeatRef` into the caller context sent to
the attention reconciler, so a valid runtime identity cannot reuse one wake to
act under another Beat.

---

Copyright © 2026 PowerFarm. All rights reserved.
