import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = path.join(root, 'engines', 'ai-sdk');
const upstream = path.join(engine, 'upstream');
const pin = JSON.parse(fs.readFileSync(path.join(engine, 'PIN.json'), 'utf8'));
const distribution = JSON.parse(fs.readFileSync(path.join(engine, 'GITHUB-DISTRIBUTION.json'), 'utf8'));
const manifestPath = path.join(engine, 'SOURCE-MANIFEST.sha256');
const omissions = new Map(distribution.omitted_files.map(entry => [entry.path, entry]));

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifyManifest() {
  assert.equal(await sha256File(manifestPath), pin.source_manifest_sha256, 'source manifest digest drifted');
  const lines = fs.readFileSync(manifestPath, 'utf8').trim().split('\n').filter(Boolean);
  const seenOmissions = new Set();
  for (let i = 0; i < lines.length; i += 64) {
    await Promise.all(lines.slice(i, i + 64).map(async line => {
      const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
      assert.ok(match, `bad source manifest line: ${line}`);
      const [, expected, rel] = match;
      const omitted = omissions.get(rel);
      const file = path.join(upstream, rel.replace(/^\.\//, ''));
      if (omitted) {
        assert.equal(omitted.sha256, expected, `declared omission digest does not match original manifest: ${rel}`);
        assert.ok(!fs.existsSync(file), `declared GitHub distribution omission unexpectedly present: ${rel}`);
        seenOmissions.add(rel);
        return;
      }
      assert.ok(fs.existsSync(file), `pinned upstream file missing: ${rel}`);
      assert.equal(await sha256File(file), expected, `pinned upstream file drifted: ${rel}`);
    }));
  }
  assert.deepEqual([...seenOmissions].sort(), [...omissions.keys()].sort(), 'distribution omissions must be exact');
  return { total: lines.length, omitted: seenOmissions.size };
}

const packagePaths = {
  'ai': 'packages/ai/package.json',
  '@ai-sdk/provider': 'packages/provider/package.json',
  '@ai-sdk/provider-utils': 'packages/provider-utils/package.json',
  '@ai-sdk/gateway': 'packages/gateway/package.json',
  '@ai-sdk/workflow': 'packages/workflow/package.json',
  '@ai-sdk/harness': 'packages/harness/package.json',
  '@ai-sdk/workflow-harness': 'packages/workflow-harness/package.json',
  '@ai-sdk/harness-codex': 'packages/harness-codex/package.json',
  '@ai-sdk/harness-claude-code': 'packages/harness-claude-code/package.json',
  '@ai-sdk/policy-opa': 'packages/policy-opa/package.json',
  '@ai-sdk/mcp': 'packages/mcp/package.json',
  '@ai-sdk/otel': 'packages/otel/package.json',
  '@ai-sdk/sandbox-vercel': 'packages/sandbox-vercel/package.json',
  '@ai-sdk/sandbox-just-bash': 'packages/sandbox-just-bash/package.json',
};

for (const [name, version] of Object.entries(pin.packages)) {
  const rel = packagePaths[name];
  assert.ok(rel, `pin names unknown package ${name}`);
  const pkg = JSON.parse(fs.readFileSync(path.join(upstream, rel), 'utf8'));
  assert.equal(pkg.name, name, `${name} package identity drifted`);
  assert.equal(pkg.version, version, `${name} version drifted`);
}

assert.equal(await sha256File(path.join(upstream, 'pnpm-lock.yaml')), pin.pnpm_lock_sha256, 'pnpm lockfile drifted');

const toolContract = fs.readFileSync(path.join(upstream, 'packages/provider-utils/src/types/tool-execute-function.ts'), 'utf8');
for (const token of ['toolCallId: string', 'context: CONTEXT', 'experimental_sandbox?: SandboxSession']) {
  assert.ok(toolContract.includes(token), `AI SDK ToolExecutionOptions contract changed: missing ${token}`);
}
const workflowAgent = fs.readFileSync(path.join(upstream, 'packages/workflow/src/workflow-agent.ts'), 'utf8');
assert.ok(workflowAgent.includes('export class WorkflowAgent'), 'WorkflowAgent source contract missing');
const harnessAgent = fs.readFileSync(path.join(upstream, 'packages/harness/src/agent/harness-agent.ts'), 'utf8');
assert.ok(harnessAgent.includes('export class HarnessAgent'), 'HarnessAgent source contract missing');
const toolLoop = fs.readFileSync(path.join(upstream, 'packages/ai/src/agent/tool-loop-agent-settings.ts'), 'utf8');
assert.ok(toolLoop.includes('toolApproval?: ToolApprovalConfiguration'), 'tool approval contract missing');

const result = await verifyManifest();
console.log(`AI SDK pin verified: ${pin.packages.ai}, ${result.total} source-manifest entries, ${result.omitted} declared GitHub-only binary omissions, manifest ${pin.source_manifest_sha256}`);
