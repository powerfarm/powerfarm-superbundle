# Security model

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum` · **SECURITY**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Local home](./README.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

Continuum v0.3 is a local institutional admission kernel with multiple independent trust layers. Its security goal is not "make SQLite unhackable". The goal is to make unauthorized admission, silent history rewriting, ambiguous authority, stale writes, rollback and forged support paths detectable under explicit assumptions.

## Trust layers

### Local HMAC seal

Every event and branch metadata row is sealed with HMAC-SHA256 using a 256-bit key stored outside SQLite. This detects a database-only rewrite by an attacker who does not also possess the seal key.

This seal is not a public signature.

### Institutional actor signature

An ES256 signing key must first be registered by an admitted `identity.key.register` act. Registration binds the public key fingerprint and JWK to the principal currently occupying an office. A detached event signature is accepted only if:

- it signs the exact event statement;
- signer and office match the event;
- its public-key fingerprint matches the JWK;
- that key was registered to the same actor/office at event admission time;
- the key had not been revoked by then.

The registration act is secured by the existing institutional authority + HMAC chain. This is a bootstrap choice, not hardware-backed PKI.

### External witness

Witnesses sign checkpoint statements with independent P-256 keys. A quorum verifier requires multiple unique valid keys signing one statement. Witness keys should live in a separate trust domain from the machine storing the institution database and local seal key.

## Admission

A non-genesis act is admitted only after historical occupancy, exact authority, semantic state, causes, effective-time ordering, optional CAS head and optional idempotency key are verified inside one SQLite write transaction.

In v0.3, ordinary authority grants and key registration/revocation remain root-only. Delegation-containment logic exists as a separate tested module, but it is not enabled as admission policy yet. This is intentional: having code that can reason about safe delegation is not the same as changing the constitutional authority model.

## Rollback and fork

Internal audit cannot distinguish a valid old database from a malicious rollback. External checkpoints provide memory outside that rollback domain. Witness quorum can make that external memory independent of one storage location.

If two trusted quorum statements attest incompatible canonical heads, treat the event as an institutional fork incident. Do not auto-merge.

## Bundles

Portable bundles do not include the local HMAC key. Offline bundle verification therefore proves deterministic content, hash chains, branch ancestry, Merkle commitments, checkpoint presence and actor signatures/key bindings. It does not prove local HMAC possession. Add trusted witness receipts when external freshness/fork evidence is required.

## Runtime boundary

A runtime receipt is untrusted evidence until admitted. Success in ADK, Cloudflare, Kubernetes, a model provider or Supabase does not confer institutional legitimacy.

## Host compromise limit

Continuum cannot protect against an attacker who simultaneously controls the database, local HMAC key, all actor private keys and enough witness private keys to meet quorum. Hardware-backed actor/witness keys, remote transparency logging and independent timestamping are natural future hardening steps.

## Network boundary

The Observatory is read-only and intentionally has no authentication layer. It binds to loopback by default. `--unsafe-bind` only changes the bind check; it does not add TLS, authentication or authorization. Put a real authenticated reverse proxy in front before exposing it beyond a trusted host.

---

Copyright © 2026 PowerFarm. All rights reserved.
