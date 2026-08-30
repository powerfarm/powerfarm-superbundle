const ID = /^pf(?:\.[a-z0-9][a-z0-9-]*)+$/;
const KINDS = new Set(['office', 'service', 'surface', 'engine', 'channel']);

export function validateDesiredRoster(document) {
  if (!document || typeof document !== 'object') throw new TypeError('roster document required');
  if (document.schemaVersion !== 2) throw new Error('roster schemaVersion must be 2');
  if (!Array.isArray(document.organs)) throw new Error('roster.organs must be an array');

  const seen = new Set();
  for (const organ of document.organs) {
    if (!ID.test(organ.id ?? '')) throw new Error(`invalid organ id: ${organ.id}`);
    if (seen.has(organ.id)) throw new Error(`duplicate organ id: ${organ.id}`);
    seen.add(organ.id);
    if (!KINDS.has(organ.kind)) throw new Error(`invalid organ kind for ${organ.id}: ${organ.kind}`);
    if (typeof organ.title !== 'string' || !organ.title.trim()) throw new Error(`title required for ${organ.id}`);
    if (!Number.isInteger(organ.freshness_minutes) || organ.freshness_minutes < 1 || organ.freshness_minutes > 43200) {
      throw new Error(`freshness_minutes out of range for ${organ.id}`);
    }
  }
  return document;
}

const comparable = (organ) => ({
  kind: organ.kind,
  title: organ.title,
  freshness_minutes: organ.freshness_minutes,
  status: organ.status ?? 'active',
});

export function planRosterReconciliation(desiredDocument, observedOrgans = []) {
  const desired = validateDesiredRoster(desiredDocument).organs;
  if (!Array.isArray(observedOrgans)) throw new TypeError('observedOrgans must be an array');

  const desiredById = new Map(desired.map((organ) => [organ.id, { ...organ, status: 'active' }]));
  const observedById = new Map(observedOrgans.map((organ) => [organ.id, organ]));
  const actions = [];

  for (const [id, target] of desiredById) {
    const current = observedById.get(id);
    if (!current) {
      actions.push({ type: 'create', id, desired: target });
      continue;
    }
    const before = comparable(current);
    const after = comparable(target);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      actions.push({ type: 'update', id, before, desired: target });
    }
  }

  for (const [id, current] of observedById) {
    if (!desiredById.has(id) && current.status !== 'retired') {
      actions.push({
        type: 'retire',
        id,
        before: comparable(current),
        desired: { ...current, status: 'retired' },
      });
    }
  }

  const actionPriority = { retire: 0, update: 1, create: 2 };
  actions.sort((a, b) => actionPriority[a.type] - actionPriority[b.type] || a.id.localeCompare(b.id));
  return {
    desired_count: desired.length,
    observed_count: observedOrgans.length,
    converged: actions.length === 0,
    actions,
  };
}

export async function reconcileRoster({ desiredDocument, observedOrgans, writer, actorIdentityRef, observedAt = new Date() }) {
  if (!actorIdentityRef) throw new Error('actorIdentityRef is required');
  if (!writer || typeof writer.create !== 'function' || typeof writer.update !== 'function' || typeof writer.retire !== 'function') {
    throw new TypeError('writer must implement create, update, retire');
  }

  const plan = planRosterReconciliation(desiredDocument, observedOrgans);
  const results = [];
  for (const action of plan.actions) {
    const metadata = { actorIdentityRef, observedAt: new Date(observedAt).toISOString() };
    if (action.type === 'create') results.push(await writer.create(action.desired, metadata));
    if (action.type === 'update') results.push(await writer.update(action.id, action.desired, metadata));
    if (action.type === 'retire') results.push(await writer.retire(action.id, metadata));
  }

  return {
    ...plan,
    evidence: {
      kind: 'roster.reconciliation',
      actor: actorIdentityRef,
      observed_at: new Date(observedAt).toISOString(),
      action_count: plan.actions.length,
      results,
    },
  };
}
