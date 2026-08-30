import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const START = '<!-- POWERFARM-MAP:START -->';
const END = '<!-- POWERFARM-MAP:END -->';
const COPYRIGHT = 'Copyright © 2026 PowerFarm. All rights reserved.';
const isUpstream = rel => rel.startsWith('engines/ai-sdk/upstream/');
const isGenerated = rel => rel.includes('/.pytest_cache/') || rel.startsWith('.pytest_cache/');
const posix = p => p.split(path.sep).join('/');
const relLink = (from, target) => {
  let r = posix(path.relative(path.dirname(from), target));
  if (!r.startsWith('.')) r = './' + r;
  return r;
};

function allMarkdown(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allMarkdown(p));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out;
}

function kind(rel) {
  const b = path.posix.basename(rel).toUpperCase();
  if (b === 'DOCUMENTATION.MD') return 'MAP';
  if (b === 'CHANGELOG.MD' || b.startsWith('CHANGELOG')) return 'HISTORY';
  if (rel.startsWith('canon/')) return 'CANON';
  if (rel.startsWith('contracts/')) return b.includes('DATABASE-PLAN') ? 'PLAN' : 'CONTRACT';
  if (rel.startsWith('conformance/')) return 'CONFORMANCE';
  if (rel.startsWith('engine-decisions/')) return 'ENGINE DECISION';
  if (rel.startsWith('operations/')) return 'OPERATIONS';
  if (rel.startsWith('proposals/')) return 'PROPOSAL';
  if (rel.startsWith('evidence/')) return 'EVIDENCE';
  if (rel.includes('/docs/adr/')) return 'ADR';
  if (rel.includes('/docs/runbooks/')) return 'RUNBOOK';
  if (b.includes('INVARIANT')) return 'INVARIANT';
  if (b.includes('ARCHITECTURE')) return 'ARCHITECTURE';
  if (b.includes('SECURITY') || b.includes('THREAT-MODEL') || b.includes('HARDENING')) return 'SECURITY';
  if (b.includes('RECOVERY') || b.includes('OPERATIONS')) return 'OPERATIONS';
  if (b === 'PAIRING.MD' || b === 'POWERFARM-PROCESS.MD') return 'BOUNDARY';
  return 'README';
}

function mapPath(rel) {
  const p = rel.split('/');
  if (p[0] === 'process') {
    if (p[1] === 'continuum') return ['Super Bundle','Process','Continuum', ...p.slice(2,-1)].join(' / ');
    if (p[1] === 'continuum-adk') return ['Super Bundle','Process','ADK Setting', ...p.slice(2,-1)].join(' / ');
    if (p[1] === 'continuum-ai-sdk') return ['Super Bundle','Process','AI SDK Setting', ...p.slice(2,-1)].join(' / ');
    if (p[1] === 'continuum-maf') return ['Super Bundle','Process','Microsoft Agent Framework Setting', ...p.slice(2,-1)].join(' / ');
    return 'Super Bundle / Process';
  }
  if (p[0] === 'heartime') return ['Super Bundle','Organism','Heartime', ...p.slice(1,-1)].join(' / ');
  if (p[0] === 'circulation') return ['Super Bundle','Organism','Circulation', ...p.slice(1,-1)].join(' / ');
  if (p[0] === 'roster') return 'Super Bundle / Organism / Roster';
  if (p[0] === 'canon') return 'Super Bundle / Canon';
  if (p[0] === 'contracts') return 'Super Bundle / Contracts';
  if (p[0] === 'conformance') return ['Super Bundle','Conformance', ...p.slice(1,-1)].join(' / ');
  if (p[0] === 'engines') return 'Super Bundle / Engines';
  if (p[0] === 'engine-decisions') return 'Super Bundle / Engine decisions';
  if (p[0] === 'operations') return 'Super Bundle / Operations';
  if (p[0] === 'evidence') return 'Super Bundle / Evidence';
  if (p[0] === 'proposals') return 'Super Bundle / Proposals';
  return 'Super Bundle';
}

function localHome(rel) {
  if (rel.startsWith('process/continuum-adk/')) return 'process/continuum-adk/README.md';
  if (rel.startsWith('process/continuum-ai-sdk/')) return 'process/continuum-ai-sdk/README.md';
  if (rel.startsWith('process/continuum-maf/')) return 'process/continuum-maf/README.md';
  if (rel.startsWith('process/continuum/')) return 'process/continuum/README.md';
  if (rel.startsWith('process/')) return 'process/README.md';
  if (rel.startsWith('heartime/')) return 'heartime/README.md';
  if (rel.startsWith('circulation/attention/')) return 'circulation/attention/README.md';
  if (rel.startsWith('circulation/sedimentation/')) return 'circulation/sedimentation/README.md';
  if (rel.startsWith('circulation/')) return 'circulation/README.md';
  if (rel.startsWith('canon/')) return 'canon/README.md';
  if (rel.startsWith('contracts/')) return 'contracts/README.md';
  if (rel.startsWith('conformance/')) return 'conformance/README.md';
  if (rel.startsWith('roster/')) return 'roster/README.md';
  if (rel.startsWith('engines/')) return 'engines/README.md';
  if (rel.startsWith('evidence/')) return 'evidence/README.md';
  return 'README.md';
}

function mapBlock(rel) {
  const fileAbs = path.join(root, rel);
  const targets = [['Super Bundle','README.md'],['Documentation map','DOCUMENTATION.md']];
  const local = localHome(rel);
  if (local !== rel && !targets.some(([,t]) => t === local) && fs.existsSync(path.join(root,local))) targets.push(['Local home',local]);
  if (!rel.startsWith('canon/') && fs.existsSync(path.join(root,'canon/README.md'))) targets.push(['Canon','canon/README.md']);
  if (!rel.startsWith('contracts/') && fs.existsSync(path.join(root,'contracts/README.md'))) targets.push(['Contracts','contracts/README.md']);
  const nav = targets.map(([label,t]) => `[${label}](${relLink(fileAbs,path.join(root,t))})`).join(' · ');
  return `${START}\n> **PowerFarm map** · \`${mapPath(rel)}\` · **${kind(rel)}**  \n> **Navigate:** ${nav}  \n> **Boundary:** The Super Bundle owns Process and Organism. Registry remains the source of Identity, Office/Occupancy, Brand, Store and exact artifact lineage; engines do not define PowerFarm meaning.\n${END}`;
}

function stripExisting(text) {
  const s = text.indexOf(START), e = text.indexOf(END);
  if (s !== -1 && e !== -1 && e > s) {
    const after = e + END.length;
    text = (text.slice(0,s).replace(/\s+$/,'') + '\n\n' + text.slice(after).replace(/^\s+/,''));
  }
  text = text.replace(/\n*---\n\nCopyright © 2026 PowerFarm\. All rights reserved\.\s*$/,'').replace(/\s+$/,'') + '\n';
  return text;
}

function normalize(file) {
  const rel = posix(path.relative(root,file));
  if (isUpstream(rel) || isGenerated(rel)) return;
  let text = stripExisting(fs.readFileSync(file,'utf8'));
  const lines = text.split('\n');
  let idx = lines.findIndex(l => /^#\s+/.test(l));
  if (idx < 0) idx = 0;
  const block = mapBlock(rel).split('\n');
  if (/^#\s+/.test(lines[idx] || '')) {
    let insertAt = idx + 1;
    if ((lines[insertAt] ?? '').trim() !== '') lines.splice(insertAt, 0, '');
    insertAt += 1;
    lines.splice(insertAt, 0, ...block, '');
  } else lines.splice(0,0,...block,'');
  text = lines.join('\n').replace(/\s+$/,'') + `\n\n---\n\n${COPYRIGHT}\n`;
  fs.writeFileSync(file,text);
}

for (const file of allMarkdown(root)) normalize(file);
console.log(`Normalized PowerFarm Markdown under ${root}; upstream engines untouched.`);
