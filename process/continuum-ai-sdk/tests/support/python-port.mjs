import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { delimiter } from 'node:path';

const DEFAULT_BRIDGE = fileURLToPath(new URL('./bridge.py', import.meta.url));
const CONTINUUM_ROOT = fileURLToPath(new URL('../../../continuum', import.meta.url));

export class PythonContinuumPort {
  constructor({ dbPath, registry, python = 'python', bridgePath = DEFAULT_BRIDGE, branch = 'main', env = {}, expectInstitution = null } = {}) {
    if (!dbPath) throw new Error('dbPath is required');
    if (!registry) throw new Error('registry snapshot is required');
    this.dbPath = dbPath;
    this.registry = registry;
    this.python = python;
    this.bridgePath = bridgePath;
    this.branch = branch;
    this.env = env;
    // Which institution is this port serving? Learned once from bootstrap, then
    // carried into every child process. The child re-verifies it against the
    // store it is actually pointed at, so this value is a declaration rather
    // than a permission: if the two disagree, the child refuses.
    this.institution = expectInstitution ?? null;
  }

  async request(action, body = {}) {
    const payload = {
      action,
      db_path: this.dbPath,
      branch: this.branch,
      registry: this.registry,
      ...(this.institution ? { expect_institution: this.institution } : {}),
      ...body,
    };
    return runJsonProcess(this.python, [this.bridgePath], payload, this.env);
  }

  async bootstrap(body) {
    const result = await this.request('bootstrap', body);
    // Genesis is the only action that may found an institution. From here on the
    // port knows which institution it serves and every child carries it.
    if (result?.anchor) this.institution = result.anchor;
    return result;
  }
  takeoverRun(body) { return this.request('takeover_run', body); }
  admitToolCall(body) { return this.request('admit_tool', body); }
  completeToolCall(body) { return this.request('finish_tool', body); }
  failToolCall(body) { return this.request('fail_tool', body); }
  events() { return this.request('events'); }
  audit() { return this.request('audit'); }
}

function runJsonProcess(command, args, payload, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONPATH: [CONTINUUM_ROOT, process.env.PYTHONPATH].filter(Boolean).join(delimiter), ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`Continuum bridge exited ${code}: ${stderr.trim()}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Continuum bridge returned invalid JSON: ${stdout.slice(0, 500)}`, { cause: error }));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
