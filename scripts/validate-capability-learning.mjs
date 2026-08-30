import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAPABILITY_LEARNING_CONTRACT_ID,
  CAPABILITY_LEARNING_SCHEMA_VERSION,
  PORT_VERSIONS,
  SEDIMENTATION_RECONCILER_REF,
  SUBSTRATES,
} from '../circulation/sedimentation/lib/contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (label, condition) => {
  if (!condition) throw new Error(`Capability Learning contract failed: ${label}`);
  checks.push(label);
};

const manifest = JSON.parse(read('contracts/capability-learning.v1.json'));
check('machine contract identity matches source', manifest.$id === CAPABILITY_LEARNING_CONTRACT_ID);
check('schema version is permanent v1', manifest.version === CAPABILITY_LEARNING_SCHEMA_VERSION);
check('reconciler identity matches source', manifest.reconciler_ref === SEDIMENTATION_RECONCILER_REF);
check('all substrates match source order', JSON.stringify(manifest.substrates) === JSON.stringify(SUBSTRATES));
for (const [name, version] of Object.entries(PORT_VERSIONS)) {
  if (manifest.ports[name]) check(`${name} port version matches source`, manifest.ports[name].contract_version === version);
}

const expectedObjects = {
  learning_scope: ['ref','capability_ref','capability_revision','work_class_ref','semantic_contract_ref','authority_contract_ref','evidence_contract_ref','active_occupancy','learning_policy_ref','learning_policy_revision','learning_policy'],
  occupancy: ['ref','implementation_ref','implementation_revision','substrate','status','fallback_implementation_ref','fallback_implementation_revision','fallback_substrate','cognition_fraction','activated_at'],
  work_profile: ['ref','scope_ref','work_class_ref','capability_revision','capability_ref','occupancy_ref','implementation_ref','window_started_at','window_ended_at','observed_runs','stable_runs','exception_count','contradiction_count','workaround_count','exception_rate','residual_uncertainty','quality_score','baseline_quality_score','cost_per_run','latency_ms','epistemic_state','distribution_ref','evidence_refs'],
  candidate: ['ref','scope_ref','capability_ref','capability_revision','work_class_ref','implementation_revision','target_substrate','status','semantic_contract_ref','authority_contract_ref','evidence_contract_ref','equivalence_contract_ref','fallback_implementation_ref','fallback_implementation_revision','fallback_substrate','residual_uncertainty','expected_cognition_fraction','expected_cost_per_run','expected_latency_ms','expected_quality_score','artifact_ref','authored_by','created_at'],
  equivalence_assessment: ['ref','scope_ref','capability_ref','capability_revision','work_class_ref','candidate_ref','candidate_revision','profile_ref','equivalence_contract_ref','state','independent','evaluated_by','observed_runs','exception_count','contradiction_count','quality_regression','residual_uncertainty','observed_cognition_fraction','observed_cost_per_run','observed_latency_ms','observed_quality_score','evidence_refs','evaluated_at'],
  learning_policy: ['minimum_observed_runs','minimum_stable_runs','minimum_assessment_runs','minimum_window_seconds','profile_stale_after_seconds','maximum_exception_rate','maximum_contradictions','maximum_workarounds','maximum_residual_uncertainty','minimum_savings_ratio','minimum_cognition_reduction','maximum_quality_regression','maximum_latency_regression','soften_exception_rate','soften_contradictions','soften_workarounds','soften_residual_uncertainty','allowed_substrates'],
  transition_proposal: ['ref','created','state','direction','capability_ref','capability_revision','work_class_ref','learning_policy_ref','learning_policy_revision','from_occupancy_ref','from_implementation_ref','from_implementation_revision','from_substrate','to_implementation_ref','to_implementation_revision','to_substrate','to_cognition_fraction','semantic_contract_ref','authority_contract_ref','evidence_contract_ref','equivalence_contract_ref','profile_ref','assessment_ref','fallback_implementation_ref','fallback_implementation_revision','fallback_substrate'],
};
for (const [name, fields] of Object.entries(expectedObjects)) {
  check(`${name} machine object matches executable contract`,
    JSON.stringify(manifest.objects[name]) === JSON.stringify(fields));
}

const contract = read('circulation/sedimentation/lib/contract.mjs');
const controller = read('circulation/sedimentation/lib/controller.mjs');
const ports = read('circulation/sedimentation/lib/rpc-ports.mjs');
const worker = read('circulation/sedimentation/worker/src/index.js');
const workerCore = read('circulation/sedimentation/worker/src/core.mjs');
const heartimeRouter = read('heartime/worker/src/rpc-ports.mjs');
const heartimeState = read('heartime/worker/src/postgrest-state.mjs');
const heartimeIndex = read('heartime/worker/src/index.js');
const migration = read('heartime/migrations/20260824120000_heartime_capability_learning.sql');

check('portable learning core has no Node-only imports', !/from ['"]node:/.test(contract + controller + ports));
check('production learning code is independent of test doubles', !/tests\/fixtures|in-memory/.test(contract + controller + ports + worker + workerCore));
check('private Worker public HTTP surface is closed', /status: 404/.test(worker));
check('Worker does not expose direct activation or promotion methods', !/\b(?:activate|promote)\s*\(/.test(worker + workerCore));
check('Heartime caller is bound to exact BeatRef', /validatedCaller\.beat_ref !== wake\.beat_ref/.test(workerCore));
check('wake requires CapabilityLearningScopeRef resource hint', /capability learning scope resource hint/.test(workerCore));
check('controller never mutates an occupancy directly', !/active_occupancy\s*=(?!=)|\.active_occupancy\.[a-z_]+\s*=(?!=)/.test(controller));
check('controller ensures proposals through Process', /process\.ensureTransitionProposal/.test(controller));
check('controller ensures construction through Imagineering', /imagineering\.ensureConstruction/.test(controller));
check('controller ensures independent evaluation through Imagineering', /imagineering\.ensureEvaluation/.test(controller));
check('candidate semantics must equal capability semantics', /candidate\.semantic_contract_ref !== scope\.semantic_contract_ref/.test(contract));
check('candidate authority must equal capability authority', /candidate\.authority_contract_ref !== scope\.authority_contract_ref/.test(contract));
check('candidate evidence obligations must remain equal', /candidate\.evidence_contract_ref !== scope\.evidence_contract_ref/.test(contract));
check('candidate cannot change capability revision', /candidate changes capability identity or revision/.test(contract));
check('non-inference occupancy requires fallback', /requires a complete inference fallback/.test(contract));
check('candidate author cannot be its evaluator', /candidate author cannot be the independent evaluator/.test(contract));
check('exception rate is derived from counts', /exception_rate must be derived/.test(contract));
check('quality regression is derived from independent observed quality', /quality_regression must be derived/.test(contract));
check('learning policy is revisioned and bound to the scope', /learning_policy_ref/.test(contract) && /learning_policy_revision/.test(contract));
check('substrate policy is a contiguous prefix, never an arbitrary menu', /contiguous prefix of the canonical substrate order/.test(contract));
check('inference, configuration and fixed cognition fractions have distinct invariants', /inference occupancy cognition_fraction must be 1/.test(contract) && /non-inference occupancy must reduce cognition fraction/.test(contract) && /fixed occupancy cognition_fraction must be 0/.test(contract));
check('fixed candidates and assessments require zero runtime cognition', /fixed candidate expected_cognition_fraction must be 0/.test(contract) && /fixed assessment observed_cognition_fraction must be 0/.test(contract));
check('work evidence binds exact capability revision and work class', /work profile belongs to a different capability revision/.test(contract) && /work profile belongs to a different work class/.test(contract));
check('work evidence cannot double-count stable and exceptional runs', /stable_runs and exception_count cannot exceed observed_runs together/.test(contract));
check('equivalence evidence binds exact candidate, profile and equivalence contract', /assessment belongs to a different candidate revision/.test(contract) && /assessment belongs to a different work profile/.test(contract) && /assessment used a different equivalence contract/.test(contract));
check('equivalence evidence cannot predate the candidate or evidence window', /assessment predates the candidate/.test(contract) && /assessment predates the work profile/.test(contract));
check('promotion economics use observed assessment values', /assessment\.observed_cost_per_run/.test(controller) && /assessment\.observed_latency_ms/.test(controller) && /assessment\.observed_cognition_fraction/.test(controller));
check('zero baseline cost cannot manufacture a savings ratio', /if \(currentCost <= 0\) return 0/.test(controller));
check('transition proposal binds source occupancy and target strategy', /from_occupancy_ref:\s*scope\.active_occupancy\.ref/.test(controller) && /to_cognition_fraction:\s*toCognitionFraction/.test(controller) && /Process returned proposal with mismatched/.test(controller));
check('transition proposal binds exact source, target and policy revisions', /fromImplementationRevision/.test(controller) && /toImplementationRevision/.test(controller) && /learningPolicyRevision/.test(controller) && /to_implementation_revision:\s*toImplementationRevision/.test(controller) && /learning_policy_revision:\s*scope\.learning_policy_revision/.test(controller));
check('hardening proposals move exactly one rung and softening returns to inference', /hardening proposal must move exactly one substrate rung/.test(contract) && /softening proposal must return to the admitted inference fallback/.test(contract));
check('hardening follows admitted substrate order', /allowedSubstrates\[current \+ 1\]/.test(controller));
check('softening considers contradiction, workarounds and uncertainty', /contradiction_count/.test(controller) && /workaround_count/.test(controller) && /residual_uncertainty/.test(controller));
check('institutional obligation and evidence observation use separate semantic keys', /sedimentation-obligation/.test(controller) && /sedimentation-decision-evidence/.test(controller) && /obligationKey/.test(controller) && /evidenceKey/.test(controller));
check('candidate lifecycle separates construction, evaluation and contradiction repair', /candidate_not_ready_for_evaluation/.test(controller) && /candidate_assessment_contradicted/.test(controller) && /evaluation_requested/.test(controller));
check('Heartime router admits sedimentation as a separate versioned binding', /createSedimentationReconcilerRpcPort/.test(heartimeRouter) && /SEDIMENTATION_RECONCILER/.test(heartimeIndex));
check('Heartime state is configured by canonical ReconcilerRef', /HEARTIME_RECONCILER_REF/.test(heartimeState) && /this\.reconcilerRef/.test(heartimeState));
check('Heartime summary guard rejects organ-owned learning bodies', /'capability', 'implementation', 'candidate', 'profile', 'policy'/.test(migration));
check('no physical hardware toolchain is introduced', !/from ['"](?:@?xilinx|vivado|verilator|yosys|circt|calyx|allo)/i.test(contract + controller + ports + worker + workerCore));
check('all substrate semantics are explicitly digital', manifest.laws.includes('All substrates are digital; hardware terminology is analogy only.'));

console.log(`CAPABILITY LEARNING CONTRACT: PASS · ${checks.length} checks`);
for (const label of checks) console.log(`  ok    ${label}`);
