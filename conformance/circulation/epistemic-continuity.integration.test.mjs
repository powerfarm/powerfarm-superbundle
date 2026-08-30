import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assessCardCirculation,
  buildEpistemicWakeContext,
  createCardV1,
  makeCostAuthorization,
  makeEnergyAuthorization,
  unresolvedUncertainties,
  verifyCardSeal,
} from '../../circulation/cards/lib/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const driver = path.join(root, 'conformance/circulation/support/epistemic-occupant-driver.mjs');
const goldenPath = path.join(root, 'conformance/circulation/golden/epistemic-continuity.golden.json');

function runOccupant(mode, inputPath, outputPath) {
  const result = spawnSync(process.execPath, [driver, mode, inputPath, outputPath], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  });
  assert.equal(result.status, 0, `occupant ${mode} failed: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

test('a future occupant reconstructs the world from durable Card state with no shared process memory', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'powerfarm-epistemic-'));
  try {
    const basePath = path.join(tmp, 'base.json');
    const afterAPath = path.join(tmp, 'after-a.json');
    const afterBPath = path.join(tmp, 'after-b.json');
    const base = await createCardV1({
      ref: 'pf.card.epistemic-golden',
      scope: 'pf.office.operations',
      created_at: '2026-08-30T06:00:00.000Z',
      institutional: {
        office_ref: 'pf.office.operations',
        direction_ref: 'pf.direction.observe-shipment',
      },
      energy: { authorization: makeEnergyAuthorization({
        authorizationRef: 'pf.energy-authorization.epistemic-golden',
        effectiveAt: '2026-08-30T06:00:00.000Z',
        limits: { beats: 8, model_tokens: 100000, tool_calls: 20, network_calls: 20, compute_ms: 600000, sandbox_ms: 600000, wall_ms: 900000, human_attention_ms: 600000 },
      }) },
      cost: { authorization: makeCostAuthorization({
        authorizationRef: 'pf.cost-authorization.epistemic-golden', currency: 'USD', mode: 'capped',
        ceilingMicros: 10_000_000, effectiveAt: '2026-08-30T06:00:00.000Z',
      }) },
      circulation: {
        state: 'prepared',
        next_expected: '2026-08-30T08:00:00.000Z',
        priority: 8,
      },
    });
    fs.writeFileSync(basePath, JSON.stringify(base, null, 2) + '\n');

    const a = runOccupant('A', basePath, afterAPath);
    const afterA = JSON.parse(fs.readFileSync(afterAPath, 'utf8'));
    assert.equal(await verifyCardSeal(afterA), true);
    assert.equal(afterA.circulation.state, 'deferred');
    assert.equal(afterA.epistemic.next_sample, '2026-08-30T06:04:00.000Z');

    const wakeDecision = assessCardCirculation(afterA, { now: '2026-08-30T06:05:00.000Z' });
    assert.equal(wakeDecision.decision, 'CIRCULATE');
    assert.equal(wakeDecision.reason, 'epistemic_sample_due');

    // A has exited. B receives only the durable Card file. No session, closure,
    // chat transcript, module state, or private model memory crosses this boundary.
    const b = runOccupant('B', afterAPath, afterBPath);
    const afterB = JSON.parse(fs.readFileSync(afterBPath, 'utf8'));
    assert.equal(await verifyCardSeal(afterB), true);
    const wakeB = buildEpistemicWakeContext(afterB, { now: '2026-08-30T06:05:00.000Z' });

    const summary = {
      contract_version: 'powerfarm.epistemic-continuity-golden.v1',
      card_ref: afterB.ref,
      generation_preserved: afterB.generation === base.generation,
      process_boundary: {
        occupant_a_pid_shared: false,
        occupant_b_input: 'durable_card_only',
      },
      after_a: {
        revision: a.revision,
        circulation_state: afterA.circulation.state,
        next_sample: afterA.epistemic.next_sample,
        classes: [
          afterA.epistemic.observations[0].classification,
          afterA.epistemic.claims[0].classification,
          afterA.epistemic.uncertainties[0].classification,
        ],
        observation_statement: afterA.epistemic.observations[0].statement,
        claim_statement: afterA.epistemic.claims[0].statement,
        uncertainty_question: afterA.epistemic.uncertainties[0].question,
      },
      wake_b: {
        decision: wakeDecision.decision,
        reason: wakeDecision.reason,
        inherited_observation_freshness: b.inherited.observation_freshness,
        inherited_claim_classification: b.inherited.claim_classification,
        inherited_uncertainty_status: b.inherited.uncertainty_status,
      },
      after_b: {
        revision: afterB.revision,
        observation_count: afterB.epistemic.observations.length,
        claim_count: afterB.epistemic.claims.length,
        uncertainty_count: afterB.epistemic.uncertainties.length,
        conflict_count: afterB.epistemic.conflicts.length,
        unresolved_uncertainty_count: unresolvedUncertainties(afterB).length,
        uncertainty_status: wakeB.uncertainties[0].status,
        next_sample: afterB.epistemic.next_sample,
        original_observation_retained: afterB.epistemic.observations.some((record) => record.ref === a.observation_ref),
        original_claim_retained: afterB.epistemic.claims.some((record) => record.ref === a.claim_ref),
        original_unknown_retained: afterB.epistemic.uncertainties.some((record) => record.ref === a.uncertainty_ref),
        evidence_refs: afterB.epistemic.evidence_refs,
      },
    };

    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    assert.deepEqual(summary, golden);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
