# PowerFarm Process / Continuum v0.3

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum` · **README**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Continuum is a **verifiable institutional kernel**. It keeps authority, admitted acts, causality and consequences outside disposable runtimes, then lets you reconstruct, prove, fork and challenge the institution later.

It does **not** implement the discarded POWER/FARM diagram and it does not invent a second workflow engine. ADK, Cloudflare, Kubernetes, Supabase, local labs and future runtimes can execute work; Continuum decides what the institution admits about that work.

## What changed in v0.3

v0.2 proved a hardened local ledger. v0.3 turns it into a larger production-shaped system:

- **ES256 signatures on individual institutional acts**;
- institutional key registration/revocation bound to the historical office occupant;
- **P-256 witness identities** that sign external checkpoints;
- N-of-M witness quorum verification;
- deterministic **Merkle roots and inclusion proofs**;
- portable offline-verifiable evidence bundles;
- consistent SQLite backups with manifests and checkpoint anchors;
- `doctor` and `metrics` operational commands;
- runtime receipt contracts and a read-side adapter for the existing Powerfarm Supabase `runs` shape;
- a candidate `continuum` Postgres/Supabase schema that deliberately exposes reads but no direct authenticated writes;
- a split, CSP-clean read-only Observatory with health and metrics endpoints;
- in-place upgrade from Continuum schema v2 to v3;
- JSON Schemas, OpenAPI, ADRs and recovery/security runbooks.

The local HMAC, actor ES256 signature and witness signature are intentionally separate trust layers. A valid signature is still not enough if semantic replay says the act was institutionally impossible.

## Core loop

```text
runtime / human / agent proposes evidence or consequence
                    │
                    ▼
           institutional admission
       occupancy + authority + semantics
                    │
                    ▼
          immutable admitted act
      hash chain + local HMAC seal
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   actor ES256 signature   causal/support edges
          │                   │
          └─────────┬─────────┘
                    ▼
            projection / proof
                    │
          checkpoint + witnesses
```

## Install and run

Python 3.11+ is required.

```bash
python3 -m pip install -e .
export POWERFARM_REGISTRY_SUPABASE_URL=https://your-registry.supabase.co
export POWERFARM_REGISTRY_PUBLISHABLE_KEY=your-publishable-key
powerfarm --db ./powerfarm.db init --director pf.identity.director
```

For an existing v0.2 database, run the explicit writable upgrade once before read-only commands:

```bash
powerfarm --db ./powerfarm.db upgrade
```

Office, Occupancy and identity-key lifecycle belong to Registry and must exist
there before Continuum starts. Process can then grant a narrow institutional
scope and admit an act:

```bash
powerfarm --db ./powerfarm.db grant operations \
  --action 'claim.*' --subject 'claim:*' \
  --actor pf.identity.director --request-id grant-operations-claims

powerfarm --db ./powerfarm.db act \
  --actor pf.identity.worker-17 --office operations \
  --kind claim.assert --subject claim:edge-reachable \
  --payload '{"statement":"edge is reachable"}' \
  --request-id probe-2026-08-29-001
```

## Actor signing keys

Generate a P-256 keypair:

```bash
powerfarm witness-keygen \
  --private ./director-signing.pem \
  --public ./director-signing.pub.pem
```

Register the public key through Registry. Process deliberately exposes no
parallel key-registration or revocation command; it only resolves the
historical Registry binding when checking a signature.

Then sign an already admitted event:

```bash
powerfarm --db ./powerfarm.db sign-event evt_... \
  --private ./director-signing.pem
```

`powerfarm audit` verifies the cryptographic signature **and** checks that the exact key was institutionally registered to that actor/office at the event's historical admission time.

Revoke the key through Registry. A revoked key cannot sign later acts.

## Bitemporal state and counterfactual worlds

`effective_at` is when a fact is true. `recorded_at` is when the institution learned/admitted it.

```bash
powerfarm --db ./powerfarm.db state --at 2026-10-01T00:00:00Z
powerfarm --db ./powerfarm.db state \
  --at 2026-10-01T00:00:00Z \
  --known-at 2026-09-15T12:00:00Z
```

Fork a counterfactual timeline without touching `main`:

```bash
powerfarm --db ./powerfarm.db fork alternative \
  --at-event evt_... --label counterfactual

powerfarm --db ./powerfarm.db diff main alternative
```

## Causal proof and blast radius

```bash
powerfarm --db ./powerfarm.db proof evt_...
powerfarm --db ./powerfarm.db impact evt_...
```

`proof` walks causes and authority backward. `impact` walks dependency and authority edges forward. Losing a grant can therefore invalidate descendants even if the grant was never a business-level cause.

## External rollback anchors and witness quorum

Create a local authenticated checkpoint:

```bash
powerfarm --db ./powerfarm.db checkpoint \
  --out /separate/trust-domain/checkpoint.json
```

Have independent witnesses sign it:

```bash
powerfarm witness-sign \
  --checkpoint checkpoint.json \
  --private lab-a.pem --witness lab-a \
  --out lab-a.receipt.json

powerfarm witness-sign \
  --checkpoint checkpoint.json \
  --private lab-b.pem --witness lab-b \
  --out lab-b.receipt.json

powerfarm witness-quorum --threshold 2 \
  --receipt lab-a.receipt.json \
  --receipt lab-b.receipt.json
```

This gives you a trust statement outside the SQLite/HMAC rollback domain.

## Portable evidence bundles

```bash
powerfarm --db ./powerfarm.db bundle-export --out continuum.bundle.json
powerfarm bundle-verify --file continuum.bundle.json
```

A bundle includes local branch rows, all local events, detached actor signatures, per-branch Merkle roots and a checkpoint. Bundle verification does not require the local HMAC secret; it validates deterministic hashes, branch ancestry, event chains, historical key binding and event signatures. The HMAC seal remains a local trust primitive and is explicitly reported as unavailable to an offline verifier without the key.

## Backups and diagnostics

```bash
powerfarm --db ./powerfarm.db doctor
powerfarm --db ./powerfarm.db metrics
powerfarm --db ./powerfarm.db backup --out ./powerfarm-backup.db
powerfarm backup-verify \
  --backup-db ./powerfarm-backup.db \
  --manifest ./powerfarm-backup.db.manifest.json
```

Backups never include the seal key.

## Runtime receipts

`powerfarm.runtime-receipt/v1` is the boundary between execution and institution. A runtime receipt can describe a run, result, failure, usage and provenance. It is **evidence**, not a mutation of institutional state.

The package includes a read-side adapter for the existing Powerfarm Supabase `runs` shape. It normalizes a row into a receipt so a later authorized act can cite its digest.

## Supabase/Postgres candidate

`powerfarm/supabase/migrations/` contains a candidate separate `continuum` schema for:

- timelines;
- admitted acts;
- causal/support edges;
- detached act signatures;
- checkpoints and witness receipts;
- external runtime receipts.

Nothing applies these migrations automatically. They intentionally give `authenticated` users **SELECT only**. A production write path needs a dedicated admission principal and one transaction for authority check + append + causal edges + signature material.

## Observatory

```bash
powerfarm --db ./powerfarm.db serve --port 8787
```

Open `http://127.0.0.1:8787`.

The Observatory is read-only, opens SQLite in `mode=ro`, serves static assets from an explicit allowlist, uses a CSP without inline script/style, emits cross-origin/frame hardening headers, returns `405` for mutation methods and refuses non-loopback binds unless `--unsafe-bind` is explicit.

## Audit

```bash
powerfarm --db ./powerfarm.db audit
```

Audit checks SQLite integrity, schema/application identity, branch ancestry, hash chains, HMAC seals, causality, historical occupancy, exact authority references, semantic replay, actor ES256 signatures and historical key binding.

A row may have a valid hash, a valid HMAC and a valid ES256 signature and still fail if its institutional story is impossible.

## Repository map

```text
powerfarm/
  authority/      delegation containment and authority explanation
  bundle/         portable evidence bundle export/verification
  contracts/      JSON Schema + OpenAPI
  core/           canonical bytes, time, filesystem primitives
  crypto/         P-256 keys, event signatures, witness receipts/quorum
  institution/    lineage and support queries
  ledger/         Merkle and branch-graph proofs
  ops/            backup, doctor, metrics
  runtime/        execution envelopes and runtime receipts
  supabase/       reviewed candidate Postgres contract
  ui/             read-only Observatory assets
  kernel.py       admission, semantic replay, causal proof, forks
```

Architecture decisions and operational procedures live under `docs/`.


## PowerFarm Process profile

Inside `powerfarm-core`, **Process = Continuum + continuum-adk**. Continuum owns
institutional Authority, admission, runs/consequence and proof. `continuum-adk`
is the ADK execution boundary that spends that authority.

In production, Office/Occupancy identity comes from the standalone Registry.
`Kernel(..., registry=<RegistryDirectory>)` therefore refuses `office.create`,
`office.retire`, `occupancy.assign` and `occupancy.vacate`; those mutations belong
to Registry. The embedded Office/Occupancy projection remains available only for
portable local tests and legacy Continuum databases.

---

Copyright © 2026 PowerFarm. All rights reserved.
