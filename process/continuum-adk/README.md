# continuum-adk

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · `Super Bundle / Process / ADK Setting` · **README**  
> **Navigate:** [Super Bundle](../../README.md) · [Documentation map](../../DOCUMENTATION.md) · [Canon](../../canon/README.md) · [Contracts](../../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

`continuum-adk` is an institutional admission boundary for Google ADK tools.
A model may propose a tool call. The tool does not execute until Powerfarm
Continuum admits the act under a real office, occupancy and authority grant.

```text
ADK proposes tool call
        |
        v
explicit tool -> institutional-act mapping
        |
        v
ATOMIC Continuum admission
  [ tool intent + run.start ]
        |
    refused? ----------------> returned refusal; tool never runs
        |
        v
     real tool
        |
        v
privacy-reduced runtime receipt
        |
        v
run.finish / run.fail
```

## Production properties in 0.2

- Intent and `run.start` are one `Kernel.append_batch()` transaction. If either
  is refused, neither exists.
- Outcomes use Continuum 0.3.1 continuation authority. Revoking `run.start`
  authority blocks new work but cannot suppress the result of work already
  admitted.
- The plugin keeps no authoritative `_open` dictionary. It reconstructs the
  run from deterministic ledger request IDs after restart/retry.
- Request IDs are derived from a hash of invocation ID, function-call ID,
  attempt, agent, session and tool. Reusing a function-call ID in another
  invocation does not collide.
- Raw args/results/error messages/user IDs/session IDs are not persisted by
  default. The ledger receives digests and low-cardinality metadata.
- Float, Decimal, bytes and unusual Python values are deterministically
  digestible without introducing JSON floats into Continuum payloads.
- Subject-template values use a readable prefix plus a digest, not lossy
  normalization/truncation alone.
- Strict mode is the default: explicit tool mapping, a concrete `revision_ref`,
  and a sealed invocation-scoped ExecutionSlice are required.
- Model-facing refusals do not disclose the acting principal by default.

## Install

```bash
python -m pip install continuum-adk \
  -c constraints/tested-py312.txt
```

The library itself declares ranges. The constraints file is an application
boundary snapshot, not a library pin.

## Use

```python
from continuum_adk import (
    ActorFromAgent,
    ContinuumPlugin,
    DottedToolPolicy,
    ExecutionSliceFromContext,
    StaticOffice,
    ToolMapping,
)
from google.adk.agents.run_config import RunConfig

policy = DottedToolPolicy(
    {
        "search": ToolMapping(
            kind="tool.invoke.search",
            subject="tool:search",
        ),
        "read_doc": ToolMapping(
            kind="tool.invoke.read-doc",
            subject="doc:{doc_id}",
        ),
    },
    strict=True,
)

plugin = ContinuumPlugin(
    kernel=kernel,
    office=StaticOffice("research"),
    actor=ActorFromAgent(),
    execution_slice=ExecutionSliceFromContext(),
    policy=policy,
    revision_ref="git:4c9e6bf",
)

app = App(name="my-app", root_agent=agent, plugins=[plugin])
runner = Runner(app=app, session_service=session_service)

async for event in runner.run_async(
    user_id=user_id,
    session_id=session_id,
    new_message=message,
    run_config=RunConfig(
        custom_metadata={"powerfarm_execution_slice": execution_slice}
    ),
):
    ...
```

The institution must already contain the Registry-backed Office/Occupancy reality and Process grants. **The ADK process spends authority; it does not create institutional identity or authority.** The runtime package intentionally exports no Office/Occupancy/grant bootstrap helpers. Deterministic tests keep their retired embedded-directory fixtures under `tests/` only.

## Evidence policy

The default `DigestOnlyEvidence` stores no tool values in plaintext. For a
field that is intentionally safe to disclose, opt in narrowly:

```python
from continuum_adk import AllowlistedEvidence

evidence = AllowlistedEvidence(
    argument_fields={"search": frozenset({"query"})},
    result_fields={"search": frozenset({"count"})},
)
```

Everything outside the allowlist remains represented by the digest of the full
value.

## Authority model

A tool grant and run authority are different facts. An office needs:

1. authority for the mapped tool act, e.g. `tool.invoke.search`; and
2. authority for `run.start` on `run:*` when outcome recording is enabled.

It does **not** need fresh `run.finish` / `run.fail` authority. Continuum 0.3.1
lets the same actor/office close the exact run it previously opened by citing
that `run.start`. This is intentionally narrow and cannot authorize new work.

## ADK contract

The adapter targets ADK 2.x's `BasePlugin` tool callbacks:
`before_tool_callback`, `after_tool_callback`, and `on_tool_error_callback`.
A non-`None` result from `before_tool_callback` short-circuits tool execution.
The sealed slice travels through `RunConfig.custom_metadata`, which ADK exposes
on each `ToolContext`. This keeps it scoped to the Runner invocation instead of
turning durable session state into an authority cache. The resolver is called
with the projected `tool_name`, `kind`, and `subject`, and the adapter refuses
the call unless those values exactly match the sealed capability.
`ToolContext` engine-local identifiers such as `function_call_id`, `invocation_id`, `agent_name`, and session state are provenance only. Institutional run identity is derived exclusively from the sealed ExecutionSlice supplied by Cards + Heartime.

`Context.branch` is never reused as the Continuum branch. Configure that with
`ledger_branch`.

## Tests

```bash
PYTHONPATH=/path/to/powerfarm-continuum-0.4.0:src python -m pytest -q
```

The unit/adversarial suite runs without network. `tests/test_admission.py` is
an additional end-to-end real-ADK Runner suite and skips when `google-adk` is
not installed.

## Deliberately not faked

- **Human confirmation is not authority.** ADK `ToolConfirmation` can suspend a
  call, but a click cannot silently mint an institutional grant. A future
  confirmation bridge must produce an authorized approval/grant act first.
- **Event signing is not bolted on after admission.** Continuum supports ES256
  event signatures, but requiring every ADK act to be signed needs an atomic
  signed-admission primitive or an external signer protocol. 0.2 does not
  pretend a best-effort post-commit signature is equivalent.

See `SECURITY.md` and `CHANGELOG.md` for the release boundary.

---

Copyright © 2026 PowerFarm. All rights reserved.
