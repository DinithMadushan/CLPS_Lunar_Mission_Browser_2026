/** Small DOM helpers. All dynamic text goes through textContent, so API data can never inject HTML. */
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
export function fade(on, ms = 450) {
  const f = $('#fade'); f.style.transitionDuration = `${ms}ms`; f.classList.toggle('on', on);
  return new Promise((r) => setTimeout(r, ms));
}
export function stateBox(kind, text, retry) {
  return el('div', { class: `statebox ${kind}` }, el('span', { text }), retry ? el('button', { class: 'btn small', onclick: retry, text: 'Retry' }) : null);
}
export const STATUS_LABEL = { planned: 'Planned', launched: 'Launched', landed: 'Landed', completed: 'Completed', failed: 'Failed', partially_successful: 'Partially successful', cancelled: 'Cancelled', unknown: 'Unknown / unconfirmed' };
export const STATUS_COLOR = { planned: '#7aa7ff', launched: '#5fd4ff', landed: '#9be37a', completed: '#3ddc97', failed: '#ff5d5d', partially_successful: '#ffb454', cancelled: '#8793a6', unknown: '#c9a3ff' };
export function badge(status) {
  const b = el('span', { class: 'badge', text: STATUS_LABEL[status] || status });
  b.style.setProperty('--c', STATUS_COLOR[status] || '#888'); return b;
}
export function fmtDate(iso) {
  if (!iso) return null; const d = new Date(iso);
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
