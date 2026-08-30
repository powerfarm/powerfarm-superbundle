import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(root, 'migrations/20260824120000_heartime_capability_learning.sql'),
  'utf8',
);
const failures = [];
const checks = [];
const check = (label, condition) => {
  if (condition) {
    checks.push(label);
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FALHA ${label}`);
  }
};

console.log('\nHEARTIME CAPABILITY LEARNING: migration verification\n');

check('migration evolves the existing compact-summary guard', /create or replace function heartime\.reconciliation_summary_is_compact/.test(migration));
check('capability bodies are forbidden', /'capability', 'implementation', 'candidate', 'profile', 'policy'/.test(migration));
check('proposal and assessment bodies are forbidden', /'proposal', 'assessment'/.test(migration));
check('semantic and authority contract bodies are forbidden', /'semantic_contract', 'authority_contract'/.test(migration));
check('learning policy bodies are forbidden', /'learning_policy'/.test(migration));
check('reference-shaped fields remain possible because only exact body keys are rejected', !/'capability_ref'/.test(migration));
check('guard remains recursive for objects', /jsonb_each\(p_value\)/.test(migration));
check('guard remains recursive for arrays', /jsonb_array_elements\(p_value\)/.test(migration));
check('migration creates no new scheduler or queue table', !/create\s+table/i.test(migration));
check('migration does not replace cycle or wake functions', !/create or replace function heartime\.(?:prepare_cycle|finish_cycle|next_reconciliation_wake|defer_failure)/.test(migration));
check('public and anon cannot execute the guard', /revoke all on function heartime\.reconciliation_summary_is_compact\(jsonb\) from public, anon/.test(migration));
check('authenticated runtime may execute the guard', /grant execute on function heartime\.reconciliation_summary_is_compact\(jsonb\) to authenticated/.test(migration));
check('dollar-quoted body is paired', (migration.match(/\$\$/g) ?? []).length % 2 === 0);
check('migration ends with a complete statement', /;\s*$/.test(migration));

if (failures.length) {
  console.error(`\nHEARTIME CAPABILITY LEARNING: FALHA - ${failures.length} problema(s)\n`);
  process.exit(1);
}
console.log(`\nHEARTIME CAPABILITY LEARNING: PASSA · ${checks.length} verificacoes\n`);
