import {api, q} from './api.js';
import {$, esc, renderBranches, renderFindings, renderObjects, renderTimeline} from './render.js';

let current = 'main';

async function showProof(id) {
  const query = `branch=${q(current)}&id=${q(id)}`;
  const [proof, impact] = await Promise.all([api('/api/proof?' + query), api('/api/impact?' + query)]);
  const root = proof.nodes.find(node => node.id === id);
  if (!root) throw new Error('proof root missing');
  $('#detail').innerHTML = `<div class="kv"><span>kind</span><b>${esc(root.kind)}</b></div><div class="kv"><span>subject</span><b>${esc(root.subject)}</b></div><div class="kv"><span>office</span><span>${esc(root.office)}</span></div><div class="kv"><span>authority</span><span>${esc(root.authority_ref)}</span></div><div class="kv"><span>causes</span><span>${root.causes.length}</span></div><div class="kv"><span>proof nodes</span><span>${proof.nodes.length}</span></div><div class="kv"><span>blast radius</span><b>${impact.blast_radius}</b></div><div class="kv"><span>subjects hit</span><span>${impact.affected_subjects.length}</span></div><pre class="proof">${esc(JSON.stringify({payload:root.payload,causal_edges:proof.edges,impact:impact.affected.map(x=>({depth:x.depth,kind:x.event.kind,subject:x.event.subject,reasons:x.reasons}))},null,2))}</pre>`;
}

async function load() {
  current = $('#branch').value || 'main';
  const branch = q(current);
  const [events, state, findings, metrics, health] = await Promise.all([
    api('/api/events?branch=' + branch), api('/api/state?branch=' + branch),
    api('/api/findings?branch=' + branch), api('/api/metrics'), api('/api/health?branch=' + branch)
  ]);
  $('#nEvents').textContent = events.length;
  $('#nOffices').textContent = Object.keys(state.offices).length;
  $('#nObjects').textContent = Object.keys(state.objects).length;
  $('#nGrants').textContent = Object.keys(state.grants).length;
  $('#nSignatures').textContent = metrics.event_signatures;
  $('#nFindings').textContent = findings.length;
  $('#healthText').textContent = health.ok ? 'audit clean' : 'audit failed';
  $('#healthDot').className = 'dot-status ' + (health.ok ? 'good' : 'bad');
  renderTimeline(events, showProof);
  renderObjects(Object.values(state.objects));
  renderFindings(findings);
}

async function boot() {
  const branches = await api('/api/branches');
  renderBranches(branches);
  $('#branch').value = current;
  await load();
}

$('#branch').addEventListener('change', load);
$('#reload').addEventListener('click', boot);
boot().catch(error => { document.body.innerHTML = `<pre>${esc(error.stack || error)}</pre>`; });
