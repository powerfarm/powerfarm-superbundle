# ADR 0009: Handoff preserves execution identity

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / Continuum / docs / adr` · **ADR**  
> **Navigate:** [Super Bundle](../../../../README.md) · [Documentation map](../../../../DOCUMENTATION.md) · [Local home](../../README.md) · [Canon](../../../../canon/README.md) · [Contracts](../../../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

**Status:** proposed

## Decision

Handoff preserves semantic generation and attempt identity. Handoff alone never grants permission to repeat a completed effect. Re-execution of the same institutional act requires an explicit new attempt. A new semantic generation is reserved for changes to what the Card means, not changes to who currently owns the work.

## Context

Institutional execution identity is derived, not assigned. `executionIdentityMaterial()` keys `run_ref` on exactly six values:

```
card_ref · card_generation · attempt_ref · tool_name · kind · subject
```

`revision`, `content_sha256` and `office_ref` are deliberately absent from that material. A handoff writes `institutional.office_ref` and `institutional.occupancy_ref` through the `registry` organ, which increments `revision` and re-seals the Card without touching any identity input. The derived `run_ref` therefore survives a handoff unchanged.

This is the property the decision protects. Were `office_ref` an identity input, changing who is responsible would silently mint a new execution identity, and replay refusal would stop applying to work the institution already considers complete. A handoff would quietly become permission to re-execute every effect already produced under that Card.

## The three identity fields

| Field | Meaning | Owner |
| --- | --- | --- |
| `revision` | the Card changed as a document or as state | every organ, for the fields it owns |
| `generation` | the semantic meaning of the work changed | no organ |
| `circulation.attempt_ref` | a new institutional attempt at the same work | `heartime` |

`generation` appears in no entry of the `OWNERSHIP` table in `circulation/cards/lib/patch.mjs`. Path validation admits a write only when the path equals an owned prefix or begins with one, so there is no indirect route either. No CardPatch can change what a Card means.

This is read as design rather than omission. Changing the meaning of a Card is a constitutional transition, not a mutation, and nothing that routes through the ordinary patch mechanism should be able to perform one.

## Consequences

A completed act stays completed across a change of responsibility. When an Office that received a Card by handoff attempts the identical `tool_name`, `kind` and `subject` on the same attempt, admission returns `POWERFARM_ALREADY_COMPLETED`.

In practice the receiving Office usually performs different work, so the refusal is uncommon. Its value is not how often it fires — it is that a handoff cannot switch it off.

Deliberate re-execution needs its own command. Minting a fresh `circulation.attempt_ref` through the `heartime` organ yields a new `run_ref` for the same Card, generation, tool, kind and subject. The patch machinery already permits this write; the command does not yet exist.

Handoff and re-attempt therefore write through different organs over the same Card — `registry` and `heartime` respectively. The Institutional Command Surface needs no permission model of its own: each command is an organ acting on the fields that organ already owns.

## Promotion criteria

This ADR moves to `accepted` when a vertical slice of the Command Surface demonstrates all six:

1. `handoff` preserves `generation` and `attempt_ref`.
2. An institutional act already completed still yields `POWERFARM_ALREADY_COMPLETED` after a handoff.
3. `reattempt` changes `attempt_ref` explicitly and produces a new `run_ref`.
4. Neither command acquires any permission outside the `OWNERSHIP` table.
5. `generation` remains unreachable from any CardPatch.
6. At least one end-to-end conformance test exercises the whole sequence.

Until then the decision is supported by the contracts and by reading the implementation, but has not been exercised by a real write surface.

---

Copyright © 2026 PowerFarm. All rights reserved.
