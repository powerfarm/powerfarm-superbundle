export const $ = selector => document.querySelector(selector);

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function renderBranches(branches) {
  $('#branch').innerHTML = branches.map(b => `<option value="${esc(b.id)}">${esc(b.id)}</option>`).join('');
  $('#branches').innerHTML = branches.map(b => `<div class="branch"><strong class="${b.canonical?'canonical':''}">${esc(b.id)}</strong><span>${b.canonical?'official':esc(b.label||'fork')}</span></div>`).join('');
}

export function renderTimeline(events, onSelect) {
  $('#timeline').innerHTML = events.length ? events.slice().reverse().map(e => `<div class="event" data-id="${esc(e.id)}"><div class="seq">#${e.seq}</div><div class="event-dot"></div><div class="body"><span class="kind">${esc(e.kind)}</span><span class="subject">${esc(e.subject)}</span><div class="meta">${esc(e.office)} · ${esc(e.actor)} · ${esc(e.recorded_at)} · ${esc(e.hash.slice(0,14))}</div></div></div>`).join('') : '<div class="empty">No acts.</div>';
  document.querySelectorAll('.event').forEach(el => el.addEventListener('click', () => onSelect(el.dataset.id)));
}

export function renderObjects(objects) {
  $('#objects').innerHTML = objects.length ? objects.map(o => `<div class="object"><span class="pill">${esc(o.type)}</span> <strong>${esc(o.subject)}</strong><div class="meta">status=${esc(o.status)} · last=${esc(o.last_event?.slice(0,18))}</div></div>`).join('') : '<div class="empty">No projected subjects.</div>';
}

export function renderFindings(findings) {
  $('#findings').innerHTML = findings.length ? findings.map(f => `<div class="finding ${esc(f.severity)}"><strong>${esc(f.code)}</strong><small>${esc(f.subject)}</small>${esc(f.message)}</div>`).join('') : '<div class="empty">No reconciliation findings.</div>';
}
