import { el, $, stateBox, badge, fmtDate } from './ui.js';
import { fetchMissions, fetchMissionMeta } from './api.js';
import { emit, on, state } from './state.js';

export const filters = { q: '', status: '', launch_year: '', landing_year: '', provider: '', region: '', category: '', sort: 'launch_date', desc: false };
let view = 'cards', items = [], loadSeq = 0, debounce;
export const getMissions = () => items;

const SORTS = [['launch_date', 'Launch date'], ['landing_date', 'Landing date'], ['name', 'Name'], ['duration', 'Duration'], ['payload_count', 'Payload count']];

function select(id, label, opts, key) {
  const s = el('select', { id, 'aria-label': label, onchange: (e) => { filters[key] = e.target.value; refresh(); } },
    el('option', { value: '', text: `${label}: any` }), opts.map(([v, t]) => el('option', { value: v, text: t })));
  return s;
}

export async function initMissions() {
  const root = $('#panel-missions');
  root.replaceChildren(el('div', { class: 'statebox loading', text: 'Loading missions…' }));
  let meta;
  try { meta = await fetchMissionMeta(); } catch (e) { root.replaceChildren(stateBox('error', `Could not load CLPS missions: ${e.message}`, initMissions)); emit('missions-failed', e); return; }
  state.dataSources.missions = meta.source;
  const statusOpts = meta.statuses.map((s) => [s, s.replace(/_/g, ' ')]);
  root.replaceChildren(
    el('div', { class: 'filters' },
      el('input', { type: 'search', id: 'm-search', placeholder: 'Search missions, payloads, providers…', 'aria-label': 'Search missions', oninput: (e) => { filters.q = e.target.value; clearTimeout(debounce); debounce = setTimeout(refresh, 200); } }),
      el('div', { class: 'grid2' },
        select('f-status', 'Status', statusOpts, 'status'), select('f-provider', 'Provider', meta.providers.map((p) => [p, p]), 'provider'),
        select('f-launch', 'Launch year', meta.launch_years.map((y) => [y, y]), 'launch_year'), select('f-landing', 'Landing year', meta.landing_years.map((y) => [y, y]), 'landing_year'),
        select('f-region', 'Region', meta.regions.map((r) => [r, r]), 'region'), select('f-cat', 'Payload type', meta.categories.map((c) => [c, c]), 'category')),
      el('div', { class: 'row' },
        el('select', { id: 'f-sort', 'aria-label': 'Sort by', onchange: (e) => { filters.sort = e.target.value; refresh(); } }, SORTS.map(([v, t]) => el('option', { value: v, text: `Sort: ${t}` }))),
        el('button', { class: 'btn small', id: 'f-dir', 'aria-label': 'Toggle sort direction', onclick: (e) => { filters.desc = !filters.desc; e.target.textContent = filters.desc ? '↓ Desc' : '↑ Asc'; refresh(); }, text: '↑ Asc' }),
        el('button', { class: 'btn small', id: 'f-view', onclick: (e) => { view = view === 'cards' ? 'table' : 'cards'; e.target.textContent = view === 'cards' ? 'Table view' : 'Card view'; render(); }, text: 'Table view' }),
        el('button', { class: 'btn small', onclick: resetFilters, text: 'Reset' }))),
    el('div', { id: 'm-meta', class: 'muted small' }), el('div', { id: 'm-list' }));
  await refresh();
}

function resetFilters() {
  Object.assign(filters, { q: '', status: '', launch_year: '', landing_year: '', provider: '', region: '', category: '', sort: 'launch_date', desc: false });
  $('#m-search').value = ''; ['f-status', 'f-provider', 'f-launch', 'f-landing', 'f-region', 'f-cat'].forEach((id) => { $('#' + id).value = ''; });
  $('#f-sort').value = 'launch_date'; $('#f-dir').textContent = '↑ Asc'; refresh();
}

export async function refresh() {
  const seq = ++loadSeq, list = $('#m-list');
  list.replaceChildren(el('div', { class: 'statebox loading', text: 'Loading…' }));
  try {
    const res = await fetchMissions(filters);
    if (seq !== loadSeq) return;
    items = res.items; state.dataSources.missions = res.source;
    $('#m-meta').textContent = `${res.count} mission${res.count === 1 ? '' : 's'} · data source: ${res.source === 'bundled' ? 'bundled reference dataset (Supabase tables not configured)' : 'Supabase'}`;
    render(); emit('filters-changed', { ...filters }); emit('missions-loaded', items);
  } catch (e) { if (seq === loadSeq) list.replaceChildren(stateBox('error', e.message, refresh)); }
}

const dateLine = (m) => m.landing_actual ? `Landed ${fmtDate(m.landing_actual).slice(0, 10)}` : (m.launch_actual ? `Launched ${fmtDate(m.launch_actual).slice(0, 10)}` : (m.launch_target_text || 'Date not confirmed'));
function render() {
  const list = $('#m-list'); if (!list) return;
  if (!items.length) { list.replaceChildren(stateBox('empty', 'No missions match these filters.', resetFilters)); return; }
  if (view === 'cards') {
    list.replaceChildren(...items.map((m) => el('article', { class: 'mcard', tabindex: 0, role: 'button', 'aria-label': `Open ${m.name}`, onclick: () => emit('mission-selected', m.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); emit('mission-selected', m.id); } } },
      el('div', { class: 'row between' }, el('h4', { text: m.name }), badge(m.status)),
      el('div', { class: 'muted small', text: `${m.provider || 'Unknown provider'} · ${m.target_site_name || 'site unconfirmed'}` }),
      el('div', { class: 'small', text: dateLine(m) }),
      el('div', { class: 'small muted', text: `Duration: ${m.duration.text || '—'} · Payloads: ${m.payload_count ?? 'unknown'}${m.has_coordinates ? '' : ' · no coordinates'}` }))));
  } else {
    const th = (t, key) => el('th', { onclick: () => { filters.desc = filters.sort === key ? !filters.desc : false; filters.sort = key; $('#f-sort').value = key; refresh(); }, text: t });
    list.replaceChildren(el('div', { class: 'tablewrap' }, el('table', {}, el('thead', {}, el('tr', {}, th('Mission', 'name'), el('th', { text: 'Status' }), th('Launch', 'launch_date'), th('Landing', 'landing_date'), th('Duration', 'duration'), th('Payloads', 'payload_count'))),
      el('tbody', {}, items.map((m) => el('tr', { tabindex: 0, onclick: () => emit('mission-selected', m.id), onkeydown: (e) => e.key === 'Enter' && emit('mission-selected', m.id) },
        el('td', { text: m.name }), el('td', {}, badge(m.status)), el('td', { text: m.launch_actual ? fmtDate(m.launch_actual).slice(0, 10) : '—' }),
        el('td', { text: m.landing_actual ? fmtDate(m.landing_actual).slice(0, 10) : '—' }), el('td', { text: m.duration.text || '—' }), el('td', { text: m.payload_count ?? '?' })))))));
  }
}
