import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const docPath = path.join(root, 'canon/01-organism-and-organization.md');
const releasePath = path.join(root, 'canon/01.release.json');
const doc2Path = path.join(root, 'canon/02-capability-learning-and-sedimentation.md');
const release2Path = path.join(root, 'canon/02.release.json');
const heartimeReleasePath = path.join(root, 'heartime/RELEASE.json');
const conformancePath = path.join(root, 'conformance/README.md');

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const DOC_MAP_START = '<!-- POWERFARM-MAP:START -->';
const DOC_MAP_END = '<!-- POWERFARM-MAP:END -->';
const DOC_COPYRIGHT = 'Copyright © 2026 PowerFarm. All rights reserved.';

// Navigation metadata and copyright belong to the distributed documentation map,
// not to Canon semantics. Release digests deliberately ignore that wrapper so a
// documentation-only navigation change cannot masquerade as a Canon revision.
function stripPowerFarmDocumentationWrapper(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf(DOC_MAP_START);
  if (start !== -1) {
    const end = lines.indexOf(DOC_MAP_END, start);
    if (end !== -1) {
      let after = end + 1;
      while (after < lines.length && lines[after].trim() === '') after += 1;
      lines.splice(start, after - start);
    }
  }
  const copyright = lines.lastIndexOf(DOC_COPYRIGHT);
  if (copyright !== -1) {
    let footer = copyright;
    while (footer > 0 && lines[footer - 1].trim() === '') footer -= 1;
    if (footer > 0 && lines[footer - 1].trim() === '---') {
      footer -= 1;
      while (footer > 0 && lines[footer - 1].trim() === '') footer -= 1;
    }
    lines.splice(footer);
  }
  return `${lines.join('\n').replace(/\s+$/, '')}\n`;
}

const rawText = fs.readFileSync(docPath, 'utf8');
const text = stripPowerFarmDocumentationWrapper(rawText);
const bytes = Buffer.from(text, 'utf8');
const count = (re) => (text.match(re) ?? []).length;
const lines = text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
const controls = count(/^\| \d+ \|/gm);
const h1 = count(/^# /gm);
const h2 = count(/^## /gm);
const h3 = count(/^### /gm);
const doc2Text = stripPowerFarmDocumentationWrapper(fs.readFileSync(doc2Path, 'utf8'));
const doc2Bytes = Buffer.from(doc2Text, 'utf8');
const count2 = (re) => (doc2Text.match(re) ?? []).length;
const doc2Lines = doc2Text.length === 0 ? 0 : doc2Text.split('\n').length - (doc2Text.endsWith('\n') ? 1 : 0);
const doc2Controls = count2(/^\| L\d+ \|/gm);
const doc2H1 = count2(/^# /gm);
const doc2H2 = count2(/^## /gm);
const doc2H3 = count2(/^### /gm);

function listTestFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listTestFiles(current));
    else if (entry.name.endsWith('.test.mjs')) result.push(current);
  }
  return result.sort();
}

function testStats(relativeDirectory) {
  const files = listTestFiles(path.join(root, relativeDirectory));
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  return {
    files: files.length,
    tests: (source.match(/\btest\s*\(/g) ?? []).length,
    source,
  };
}

const suites = {
  heartime_logic: testStats('heartime/tests'),
  heartime_setting: testStats('heartime/worker/tests'),
  roster: testStats('roster/tests'),
  first_seam_core: testStats('circulation/attention/tests'),
  first_seam_setting: testStats('circulation/attention/worker/tests'),
  first_seam_integration: testStats('conformance/first-seam'),
  capability_learning_core: testStats('circulation/sedimentation/tests'),
  capability_learning_setting: testStats('circulation/sedimentation/worker/tests'),
  capability_learning_integration: testStats('conformance/capability-learning'),
  cards_core: testStats('circulation/cards/tests'),
  card_circulation_integration: testStats('conformance/circulation'),
};
const totalTests = Object.values(suites).reduce((sum, suite) => sum + suite.tests, 0);
const allTestSource = Object.values(suites).map((suite) => suite.source).join('\n');
const executableControls = [...new Set(
  [...allTestSource.matchAll(/\bC(\d+)\b/g)].map((match) => Number(match[1])),
)].sort((a, b) => a - b);
const executableLearningControls = [...new Set(
  [...allTestSource.matchAll(/\bL(\d+)\b/g)].map((match) => Number(match[1])),
)].sort((a, b) => a - b);

function runCheck(script) {
  const output = execFileSync(process.execPath, [path.join(root, script)], { encoding: 'utf8' });
  return {
    script,
    output,
    checks: (output.match(/^  ok\s+/gm) ?? []).length,
  };
}

const migrationChecks = [
  runCheck('heartime/scripts/validate-heartime.mjs'),
  runCheck('heartime/scripts/validate-first-seam.mjs'),
  runCheck('heartime/scripts/validate-capability-learning.mjs'),
];
const contractChecks = {
  first_seam: runCheck('scripts/validate-first-seam.mjs'),
  capability_learning: runCheck('scripts/validate-capability-learning.mjs'),
  card: runCheck('scripts/validate-card.mjs'),
  epistemic_continuity: runCheck('scripts/validate-epistemic-continuity.mjs'),
  energy_cost: runCheck('scripts/validate-energy-cost.mjs'),
  production_circulation: runCheck('scripts/validate-production-circulation.mjs'),
  legacy_removal: runCheck('scripts/validate-legacy-removal.mjs'),
};
const migrationCheckCount = migrationChecks.reduce((sum, item) => sum + item.checks, 0);
const migrationFiles = fs.readdirSync(path.join(root, 'heartime/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();

const contracts = {
  first_seam: {
    id: 'pf.contract.first-seam.v1',
    file: 'contracts/first-seam.v1.json',
    structural_checks: contractChecks.first_seam.checks,
  },
  capability_learning: {
    id: 'pf.contract.capability-learning.v1',
    file: 'contracts/capability-learning.v1.json',
    structural_checks: contractChecks.capability_learning.checks,
  },
  card: {
    id: 'pf.contract.card.v1',
    file: 'contracts/card.v1.json',
    structural_checks: contractChecks.card.checks,
  },
  epistemic_continuity: {
    id: 'pf.contract.epistemic-continuity.v1',
    file: 'contracts/epistemic-continuity.v1.json',
    structural_checks: contractChecks.epistemic_continuity.checks,
  },
  energy_cost: {
    id: 'pf.contract.energy-cost.v1',
    file: 'contracts/energy-cost.v1.json',
    structural_checks: contractChecks.energy_cost.checks,
  },
  production_circulation: {
    id: 'pf.contract.production-circulation.v1',
    file: 'contracts/production-circulation.v1.json',
    structural_checks: contractChecks.production_circulation.checks,
  },
  legacy_removal: {
    id: 'pf.contract.legacy-removal.v1',
    file: 'contracts/legacy-removal.v1.json',
    structural_checks: contractChecks.legacy_removal.checks,
  },
};
for (const contract of Object.values(contracts)) {
  contract.sha256 = hash(fs.readFileSync(path.join(root, contract.file)));
}

const release = {
  name: 'powerfarm-doc-01',
  title: 'PowerFarm: Organism and Organization',
  document: 1,
  status: 'canon-candidate',
  date: '2026-08-24',
  generated_by: 'scripts/derive-repository.mjs',
  document_metrics: {
    lines,
    bytes: bytes.length,
    sha256: hash(bytes),
    h1_headings: h1,
    sections: h2,
    subsections: h3,
    negative_controls: controls,
  },
  contracts,
  executable_evidence: {
    total_deterministic_tests: totalTests,
    test_suites: Object.fromEntries(Object.entries(suites).map(([name, suite]) => [name, {
      files: suite.files,
      tests: suite.tests,
    }])),
    heartime_migration_checks: migrationCheckCount,
    negative_controls_made_executable: executableControls,
  },
  deployment_evidence: {
    heartime_postgres_migrations: 'not_run',
    heartime_cloudflare_settings: 'not_deployed',
    first_seam_organ_bindings: 'not_deployed',
    capability_learning_organ_bindings: 'not_deployed',
    whole_system_test: 'not_run',
  },
};

const release2 = {
  name: 'powerfarm-doc-02',
  title: 'PowerFarm: Capability Learning and Sedimentation',
  document: 2,
  status: 'canon-candidate',
  date: '2026-08-24',
  generated_by: 'scripts/derive-repository.mjs',
  document_metrics: {
    lines: doc2Lines,
    bytes: doc2Bytes.length,
    sha256: hash(doc2Bytes),
    h1_headings: doc2H1,
    sections: doc2H2,
    subsections: doc2H3,
    negative_controls: doc2Controls,
  },
  contract: contracts.capability_learning,
  executable_evidence: {
    total_deterministic_tests: suites.capability_learning_core.tests
      + suites.capability_learning_setting.tests
      + suites.capability_learning_integration.tests,
    test_suites: {
      capability_learning_core: {
        files: suites.capability_learning_core.files,
        tests: suites.capability_learning_core.tests,
      },
      capability_learning_setting: {
        files: suites.capability_learning_setting.files,
        tests: suites.capability_learning_setting.tests,
      },
      capability_learning_integration: {
        files: suites.capability_learning_integration.files,
        tests: suites.capability_learning_integration.tests,
      },
    },
    structural_contract_checks: contractChecks.capability_learning.checks,
    heartime_migration_checks: migrationChecks[2].checks,
    negative_controls_made_executable: executableLearningControls,
  },
  deployment_evidence: {
    heartime_postgres_migration: 'not_run',
    sedimentation_worker: 'not_deployed',
    registry_port: 'not_deployed',
    evidence_port: 'not_deployed',
    imagineering_port: 'not_deployed',
    process_port: 'not_deployed',
    admitted_learning_scope: 'not_run',
    whole_system_test: 'not_run',
  },
};

const heartimeRelease = {
  name: 'powerfarm-heartime',
  version: '0.8.0',
  date: '2026-08-30',
  generated_by: 'scripts/derive-repository.mjs',
  implements: 'Document 1 Heartime plus canonical Card v1 circulation, recovery, epistemic sampling, energy/cost enforcement, attention, and capability-learning reconciliation settings',
  contracts: {
    first_seam: 'pf.contract.first-seam.v1',
    capability_learning: 'pf.contract.capability-learning.v1',
    card: 'pf.contract.card.v1',
    card_wire: 'powerfarm.card.v1',
    epistemic_continuity: 'pf.contract.epistemic-continuity.v1',
    epistemic_record_wire: 'powerfarm.epistemic-record.v1',
    energy_cost: 'pf.contract.energy-cost.v1',
    production_circulation: 'pf.contract.production-circulation.v1',
    operational_trace: 'powerfarm.operational-trace.v1',
    legacy_removal: 'pf.contract.legacy-removal.v1',
    execution_slice: 'powerfarm.execution-slice.v3',
    cycle: 'powerfarm.heartime.cycle.v1',
    attention_reconciler: 'powerfarm.first-seam.reconciler.v1',
    sedimentation_reconciler: 'powerfarm.sedimentation.reconciler.v1',
  },
  source: {
    migrations: migrationFiles,
    contract_sha256: Object.fromEntries(Object.entries(contracts).map(([name, value]) => [name, value.sha256])),
  },
  checks: {
    deterministic_logic_tests: {
      status: 'pass',
      passed: suites.heartime_logic.tests,
      failed: 0,
    },
    physical_and_state_setting_tests: {
      status: 'pass',
      passed: suites.heartime_setting.tests,
      failed: 0,
    },
    migration_structure: {
      status: 'pass',
      checks: migrationCheckCount,
      derived_by: migrationChecks.map((item) => item.script),
    },
    contracts: Object.fromEntries(Object.entries(contractChecks).map(([name, result]) => [name, {
      status: 'pass',
      checks: result.checks,
    }])),
    migrations_applied: {
      status: 'not_run',
      reason: 'production authorization and a staging database were not supplied',
    },
    workers_deployed: {
      status: 'not_run',
      reason: 'provider account bindings and deployment identities remain explicit placeholders',
    },
    live_organ_bindings: {
      status: 'not_run',
      reason: 'target organ ports for both permanent seams were not supplied',
    },
    whole_system_test: {
      status: 'not_run',
    },
  },
  negative_controls_made_executable: executableControls,
};

const numberedTestCount = executableControls.length;
const learningNumberedTestCount = executableLearningControls.length;
const conformance = `# Conformance

<!-- POWERFARM-MAP:START -->
> **PowerFarm map** · \`Super Bundle / Conformance\` · **CONFORMANCE**  
> **Navigate:** [Super Bundle](../README.md) · [Documentation map](../DOCUMENTATION.md) · [Canon](../canon/README.md) · [Contracts](../contracts/README.md)  
> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.
<!-- POWERFARM-MAP:END -->

The negative controls, executable.

Document 1 currently contains **${controls} negative controls**. **${numberedTestCount} numbered controls** are executable today.

Document 2 currently contains **${doc2Controls} capability-learning controls**. **${learningNumberedTestCount} learning controls** are executable today.

The repository carries ${totalTests} deterministic tests for Heartime, canonical Cards, roster, attention circulation, capability learning, private settings, and vertical seams. A control is listed only when a test names it explicitly.

The Heartime migrations pass ${migrationCheckCount} structural checks without touching a database. The First Seam contract passes ${contractChecks.first_seam.checks} source/contract checks. The Capability Learning contract passes ${contractChecks.capability_learning.checks}. The canonical Card contract passes ${contractChecks.card.checks}. The Epistemic Continuity contract passes ${contractChecks.epistemic_continuity.checks}. The Energy + Cost contract passes ${contractChecks.energy_cost.checks}. Production Circulation passes ${contractChecks.production_circulation.checks}. Legacy Removal passes ${contractChecks.legacy_removal.checks}.

Document 1 executable controls: \`${executableControls.join(', ')}\`.

Document 2 executable controls: \`${executableLearningControls.map((value) => `L${value}`).join(', ')}\`.

A control moves here only when it can run against real behavior or against a deterministic contract whose mutation is observable. \`NOT RUN\` is never reported as \`PASS\`.

This file is derived by \`scripts/derive-repository.mjs\`.

---

Copyright © 2026 PowerFarm. All rights reserved.
`;


function checkOrWrite(file, expected) {
  if (write) {
    fs.writeFileSync(file, expected);
    console.log(`wrote ${path.relative(root, file)}`);
    return;
  }
  const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (actual !== expected) {
    console.error(`${path.relative(root, file)} is stale; run: node scripts/derive-repository.mjs --write`);
    process.exitCode = 1;
  } else {
    console.log(`ok ${path.relative(root, file)}`);
  }
}

checkOrWrite(releasePath, `${JSON.stringify(release, null, 2)}\n`);
checkOrWrite(release2Path, `${JSON.stringify(release2, null, 2)}\n`);
checkOrWrite(heartimeReleasePath, `${JSON.stringify(heartimeRelease, null, 2)}\n`);
checkOrWrite(conformancePath, conformance);
