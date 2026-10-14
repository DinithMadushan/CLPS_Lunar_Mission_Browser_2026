import { el, $, stateBox } from './ui.js';
import { fetchStatistics } from './api.js';
import { on } from './state.js';

let seq = 0, lastFilters = {};
const PALETTE = ['#5fd4ff', '#3ddc97', '#ffb454', '#c9a3ff', '#ff7a9c', '#7aa7ff', '#9be37a', '#f0e68c'];

function card(label, value, sub) { return el('div', { class: 'scard' }, el('b', { text: value }), el('span', { text: label }), sub ? el('small', { text: sub }) : null); }

/** Horizontal bar chart in plain SVG; shows an empty message instead of a blank box. */
export function barChart(title, data, { unit = '' } = {}) {
  const entries = Object.entries(data || {});
  const box = el('figure', { class: 'chart' }, el('figcaption', { text: title }));
  if (!entries.length) { box.append(el('p', { class: 'muted small', text: 'No data for the current filters.' })); return box; }
  const max = Math.max(...entries.map(([, v]) => v), 1), rowH = 24, labelW = 140, W = 340;
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${entries.length * rowH + 4}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', title);
  entries.forEach(([k, v], i) => {
    const y = i * rowH + 2, g = document.createElementNS(ns, 'g');
    const t = document.createElementNS(ns, 'text'); t.setAttribute('x', 0); t.setAttribute('y', y + 15); t.setAttribute('class', 'cl'); t.textContent = k.length > 22 ? k.slice(0, 21) + '…' : k.replace(/_/g, ' ');
    const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', labelW); r.setAttribute('y', y + 3); r.setAttribute('height', 14); r.setAttribute('rx', 3);
    r.setAttribute('width', Math.max(2, (v / max) * (W - labelW - 34))); r.setAttribute('fill', PALETTE[i % PALETTE.length]);
    const n = document.createElementNS(ns, 'text'); n.setAttribute('x', labelW + Math.max(2, (v / max) * (W - labelW - 34)) + 5); n.setAttribute('y', y + 15); n.setAttribute('class', 'cn'); n.textContent = v + unit;
    const tt = document.createElementNS(ns, 'title'); tt.textContent = `${k}: ${v}${unit}`; g.append(t, r, n, tt); svg.append(g);
  });
  box.append(svg); return box;
}
const pct = (v) => (v == null ? 'n/a' : `${Math.round(v * 100)}%`);

export async function renderStats(filters = lastFilters) {
  lastFilters = filters; const my = ++seq, root = $('#panel-stats');
  root.replaceChildren(el('div', { class: 'statebox loading', text: 'Loading statistics…' }));
  try {
    const { statistics: s, source } = await fetchStatistics(filters);
    if (my !== seq) return;
    const r = s.rates, active = Object.entries(filters).filter(([k, v]) => v && !['sort', 'desc'].includes(k)).map(([k, v]) => `${k}=${v}`);
    root.replaceChildren(
      el('p', { class: 'muted small', text: `${active.length ? `Filtered (${active.join(', ')}). ` : 'All missions. '}Source: ${source}. Charts follow the filters in CLPS Missions.` }),
      el('div', { class: 'scards' }, card('Total missions', s.total_missions), card('Planned', s.planned), card('Launched', s.launched), card('Landed', s.landed), card('Completed', s.completed), card('Failed / partial', s.failed_or_partial),
        card('Payloads documented', s.payloads_documented, `${s.missions_unknown_payload_count} mission(s) with unknown count`)),
      el('h4', { text: 'Rates' }),
      el('div', { class: 'scards' }, card('Soft-landing rate', pct(r.soft_landing_rate), `of ${r.attempts_with_known_outcome} attempts`), card('Full-success rate', pct(r.full_success_rate), `of ${r.attempts_with_known_outcome} attempts`), card('Completion rate', pct(r.completion_rate), `of ${r.completion_denominator} non-planned`)),
      el('details', {}, el('summary', { text: 'How rates are calculated' }), ...Object.entries(r.definitions).map(([k, v]) => el('p', { class: 'small' }, el('b', { text: k.replace(/_/g, ' ') + ': ' }), v)), el('p', { class: 'small muted', text: 'Planned, cancelled, in-flight and unknown missions are excluded from denominators; planned missions are never counted as failures.' })),
      barChart('Missions by status', Object.fromEntries(Object.entries(s.by_status).filter(([, v]) => v))), barChart('Missions by launch year', s.by_launch_year), barChart('Missions by landing year', s.by_landing_year),
      barChart('Payloads by scientific category', s.payloads_by_category), barChart('Outcomes', s.by_outcome), barChart('Landing-site distribution (region)', s.by_landing_region),
      el('p', { class: 'note', text: `Payload categories count only individually named payloads (${s.payloads_named}); categories are an editorial classification.` }));
  } catch (e) { if (my === seq) root.replaceChildren(stateBox('error', e.message, () => renderStats(lastFilters))); }
}
export function initStats() { on('filters-changed', (f) => renderStats(f)); }
