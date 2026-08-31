# ADR 0010: The database has lineage too

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** accepted

## Decision

An applied migration is history. Its bytes are immutable. A correction arrives as a new forward-only migration with a new version, never as an edit to the file that already ran, and a version that has been applied is never reused for different content.

PowerFarm already protects the lineage of Cards, of Authority and of evidence. This extends the same protection to the database that carries them.

## Context

The migration runner records that a version ran. It does not record what that version said.

That gap is not theoretical. On 2026-08-30 the Registry carried version `20260829012439` applied to production as `registry_identity_authority`, while the repository had come to describe the same version as `registry_control_plane`, with different content. Nothing failed. Migration parity reported `8 applied · 8 local · 0 pending` and was telling the truth by its own definition, because it compares versions and names, never bytes.

The consequence would have been silent. The runner would have treated `20260829012439` as already applied and skipped it, so production would never have received the table the application had already begun to call. Green build, green deploy, and a failure that appears only at runtime, in the one path a person exercises rarely.

Editing an applied migration to correct it is worse than the original mistake. It makes the repository disagree with reality while looking correct, and it destroys the only record of what the database was actually told to do.

## Consequences

Every published migration is sealed by content hash in a lock file, and CI fails when a sealed file changes. Verification says what the parity check cannot: not only that a version ran, but that the text is still the text that ran.

The lock covers extracted and retired migrations too. A migration whose text moves out of the active stream is still history, and its bytes stay frozen where they now live.

A clean database and a live one are no longer assumed equivalent. They diverge exactly where a version was already consumed, so any migration that reuses an applied version must declare that it will be skipped in production, explain in the file why that is safe, and be covered by a test that refuses the undeclared case. Two such collisions exist in the Registry and are declared rather than hidden.

Any object the application depends on must be created by a version greater than every applied version. A migration that introduces a table the code already calls, under a version the runner has seen, cannot run — and nothing else in the pipeline notices.

Schema changes and data changes are stated separately. A migration that also seeds, backfills or carries rows forward names those statements and their effect on the live database, rather than folding them into the shape change.

## Reference implementation

`powerfarm-registry`: `supabase/migrations/migration-lock.json`, `scripts/check-migration-lock.mjs`, `tests/migration-dual-path.test.mjs`, and `20260829130000_registry_control_plane.sql` as the forward-only correction that replaced the reused version.

## Status note

This is the first ADR in the repository recorded as `accepted` on the strength of an incident rather than a design intention. The rule was not proposed and then tried; it was extracted from a defect that had already reached a production database and was found before it caused harm. [ADR 0009](./0009-handoff-preserves-execution-identity.md) remains `proposed` for the opposite reason: it is sound, and nothing has exercised it yet.

---

Copyright © 2026 PowerFarm. All rights reserved.
