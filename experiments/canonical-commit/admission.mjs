// The smallest faithful admission algorithm needed to falsify a commit shape.
//
// It is not the Continuum kernel. It reproduces exactly the properties the
// canonical-commit decision turns on and nothing else:
//
//   - a batch is all-or-nothing;
//   - one request id yields one act, by body digest;
//   - a different body under the same request id is refused, not overwritten;
//   - each act causes the previous head, and the head advances by CAS;
//   - ADMITTED is returned only after the canonical durable commit returns.
//
// Everything else about a real act — Authority, Occupancy, signatures,
// bitemporality — is deliberately absent. Adding it would not change which
// commit shape survives the failure schedule, and would make the harness a
// second production architecture, which is exactly what the decision experiment
// must not become.

import { createHash } from 'node:crypto';

export const KILL_POINTS = new Set([
  'none',
  'before-commit',
  'after-commit',
  'after-commit-before-projection',
]);

export function actId(branch, requestId, bodySha256) {
  const hex = createHash('sha256').update(`${branch}\0${requestId}\0${bodySha256}`).digest('hex');
  return `evt_${hex.slice(0, 32)}`;
}

/**
 * Mint an institutional anchor. This mirrors `powerfarm.institution_identity`
 * in the kernel: identity is derived from the genesis act, and carries nothing
 * physical — no path, no host, no engine.
 */
export function mintAnchor() {
  const institutionRef = `inst_${createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 32)}`;
  const genesisRef = `evt_${createHash('sha256').update(`${institutionRef}:genesis`).digest('hex').slice(0, 32)}`;
  return {
    institution_ref: institutionRef,
    genesis_ref: genesisRef,
    genesis_digest: createHash('sha256').update(`${institutionRef}\0${genesisRef}`).digest('hex'),
  };
}

/**
 * OPEN: attach to one already-existing institution, named in advance.
 *
 * Genesis creates an institution. Recovery must never create one. A caller that
 * names the institution it expects gets a refusal from an empty or foreign
 * store, instead of a second institution wearing the first one's name.
 */
export async function openInstitution(store, expect) {
  const actual = await store.institution();
  if (actual === null) {
    return { ok: false, reason: 'empty store is not authorization to bootstrap' };
  }
  const reasons = [];
  for (const field of ['institution_ref', 'genesis_ref', 'genesis_digest']) {
    if (actual[field] !== expect[field]) reasons.push(`${field} differs`);
  }
  return reasons.length === 0 ? { ok: true, anchor: actual } : { ok: false, reason: reasons.join('; ') };
}

export function bodyDigest(body) {
  return `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
}

function hardCrash() {
  // SIGKILL cannot be caught, so nothing flushes, nothing unwinds and no exit
  // handler runs. This is the only faithful way to model losing the process.
  process.kill(process.pid, 'SIGKILL');
}

/**
 * Admit one batch against the canonical store.
 *
 * `shape` decides whether an outbox row is written inside the canonical
 * transaction ('A') or not ('B'). In Shape B the projection is derived by
 * reading the canonical store, so no outbox is needed.
 */
export async function admitBatch(store, {
  branch = 'main',
  requestId,
  body,
  kind = 'test.act',
  expectedHead = undefined,
  shape,
  killAt = 'none',
  poison = false,
  ackBeforeCommit = null,
  expectAnchor = null,
}) {
  const digest = bodyDigest(body);

  // The real Continuum kernel refuses to append to a store that was never
  // initialized ("Institution is not initialized"). The harness models that,
  // because without it every create-on-open store looks like a split-brain
  // admission path that the product does not actually have.
  const held = await store.institution();
  if (held === null) {
    return { outcome: 'REJECTED', reason: 'Institution is not initialized' };
  }
  if (expectAnchor) {
    const opened = await openInstitution(store, expectAnchor);
    if (!opened.ok) return { outcome: 'REFUSED_WRONG_INSTITUTION', reason: opened.reason };
  }

  const existing = await store.actByRequest(branch, requestId);
  if (existing) {
    return existing.body_sha256 === digest
      ? { outcome: 'DUPLICATE', act_id: existing.id, head: await store.head(branch) }
      : { outcome: 'CONFLICT_DIFFERENT_BODY', act_id: existing.id, head: await store.head(branch) };
  }

  await store.begin();
  try {
    // Re-read inside the transaction: the check above is a fast path, this is
    // the one that counts.
    const inTx = await store.actByRequest(branch, requestId);
    if (inTx) {
      await store.rollback();
      return inTx.body_sha256 === digest
        ? { outcome: 'DUPLICATE', act_id: inTx.id, head: await store.head(branch) }
        : { outcome: 'CONFLICT_DIFFERENT_BODY', act_id: inTx.id, head: await store.head(branch) };
    }

    const head = await store.head(branch);
    if (expectedHead !== undefined && (head.head_id ?? null) !== (expectedHead ?? null)) {
      await store.rollback();
      return { outcome: 'HEAD_CONFLICT', expected: expectedHead, actual: head.head_id ?? null };
    }

    const entries = Array.isArray(body) ? body : [body];
    let seq = Number(head.seq);
    let causes = head.head_id ?? null;
    let lastId = causes;
    for (const [index, entry] of entries.entries()) {
      seq += 1;
      const entryDigest = bodyDigest(entry);
      const id = actId(branch, `${requestId}#${index}`, entryDigest);
      // `poison` makes the last act of a multi-act batch violate a constraint,
      // so that atomicity is tested by the store rather than by the harness.
      const duplicateId = poison && index === entries.length - 1 ? lastId : null;
      await store.insertAct({
        id: duplicateId ?? id,
        seq,
        branch,
        request_id: index === 0 ? requestId : `${requestId}#${index}`,
        kind,
        body_sha256: index === 0 ? digest : entryDigest,
        causes,
      });
      causes = duplicateId ?? id;
      lastId = causes;
    }
    await store.setHead(branch, lastId, seq);

    if (shape === 'A') await store.appendOutbox(lastId, branch);

    // The forbidden shape: tell the caller ADMITTED before the canonical commit
    // returns. Used only by the harness's own negative control, to prove the
    // harness can detect a violated invariant rather than only confirming ones
    // that already hold.
    if (ackBeforeCommit) await ackBeforeCommit();
    if (killAt === 'before-commit') hardCrash();
    await store.commit();
    if (killAt === 'after-commit') hardCrash();
  } catch (error) {
    await store.rollback();
    return { outcome: 'REJECTED', reason: String(error?.message ?? error) };
  }

  return { outcome: 'ADMITTED', head: await store.head(branch) };
}

/** Drain the canonical outbox into the projection (Shape A). */
export async function projectFromOutbox(canonical, projection, branch = 'main') {
  const cursor = await canonical.outboxCursor();
  const pending = await canonical.outboxAfter(cursor);
  if (pending.length === 0) return { delivered: 0, cursor };
  const acts = await canonical.allActs(branch);
  await projection.replaceAll(branch, acts);
  const last = pending.at(-1).position;
  await canonical.setOutboxCursor(Number(last));
  return { delivered: pending.length, cursor: Number(last) };
}

/** Rebuild the projection by reading the canonical store (Shape B, and repair). */
export async function projectFromCanonical(canonical, projection, branch = 'main') {
  const acts = await canonical.allActs(branch);
  await projection.replaceAll(branch, acts);
  return { delivered: acts.length };
}
