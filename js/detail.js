import { el, $, badge, fmtDate } from './ui.js';
import { fmtLat, fmtLon } from './geo.js';
import { emit } from './state.js';

const card = () => $('#detail-card');
export function hideDetail() { card().hidden = true; card().replaceChildren(); emit('detail-closed'); }
function open(...kids) {
  card().replaceChildren(el('button', { class: 'x', 'aria-label': 'Close details', onclick: hideDetail, text: '×' }), ...kids.flat().filter((k) => k != null && k !== false));
  card().hidden = false;
}
const row = (k, v) => (v == null || v === '' ? null : el('div', { class: 'kv' }, el('span', { text: k }), el('b', { text: v })));
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

export function showQuake(q) {
  const t = { shallow: 'Shallow moonquake', deep: 'Deep moonquake', artificial_impact: 'Artificial impact' }[q.event_type] || q.event_type || 'Seismic event';
  open(el('h3', { text: t }),
    row('Date', q.event_timestamp ?? 'Unknown'), row('Latitude', q.latitude != null ? fmtLat(q.latitude) : 'Unknown'),
    row('Longitude', q.longitude != null ? fmtLon(q.longitude) : 'Unknown'), row('Magnitude', q.magnitude ?? 'N/A'),
    row('Depth', q.depth_km != null ? `${q.depth_km} km` : 'N/A'),
    q.latitude != null ? el('div', { class: 'actions' }, el('button', { class: 'btn primary', onclick: () => emit('focus-latlon', { lat: +q.latitude, lon: +q.longitude, highlight: true }), text: 'FOCUS EVENT' })) : null);
}

export function showApollo(s) {
  open(el('h3', { text: s.mission }), el('p', { class: 'muted', text: 'Apollo surface station (seismic data source)' }),
    row('Instrument', s.instrument), row('Latitude', fmtLat(s.latitude)), row('Longitude', fmtLon(s.longitude)),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => emit('focus-latlon', { lat: s.latitude, lon: s.longitude, highlight: true }), text: 'Focus' }),
      el('button', { class: 'btn primary', onclick: () => emit('land-request', { name: s.mission, lat: s.latitude, lon: s.longitude, kind: 'apollo' }), text: 'EXPLORE SURFACE' })),
    el('p', { class: 'note', text: 'Surface view is a simulated terrain scene at these coordinates (see About).' }));
}

export function showMission(m) {
  const d = m.duration || {};
  const kindText = { reported_actual: 'Reported landing coordinates', estimated_region: 'ESTIMATED region centre — not an actual landing point', unavailable: 'Unavailable' }[m.coordinate_kind];
  const src = safeUrl(m.source_url);
  const landed = ['landed', 'completed', 'partially_successful'].includes(m.status);
  open(
    el('h3', { text: m.name }), el('div', { class: 'row' }, badge(m.status), el('span', { class: 'chip', text: `Confidence: ${m.confidence || 'n/a'}` })),
    el('p', { class: 'muted', text: [m.provider, m.lander, m.task_order && `Task order ${m.task_order}`].filter(Boolean).join(' · ') }),
    m.status_warnings?.length ? el('p', { class: 'warn', text: `Status unconfirmed: ${m.status_warnings.join('; ')}` }) : null,
    el('h4', { text: 'Timeline' }),
    row('Launch (actual)', fmtDate(m.launch_actual)),
    row('Launch (planned/unconfirmed)', !m.launch_actual ? (m.launch_target_text || 'Not documented') : null),
    row('Landing (actual)', fmtDate(m.landing_actual) || (m.lifecycle === 'launched' && m.outcome === 'failure' ? 'No landing occurred' : (m.lifecycle === 'planned' ? 'Not yet occurred' : null))),
    row('Launch vehicle', m.launch_vehicle),
    row(d.kind === 'elapsed_since_launch' ? 'Elapsed since launch' : 'Mission duration', d.text || '—'),
    el('p', { class: 'note', text: d.note || '' }),
    el('h4', { text: 'Site' }),
    row('Target', m.target_site_name), row('Region', m.landing_region),
    m.has_coordinates ? row('Coordinates', `${fmtLat(m.latitude)}, ${fmtLon(m.longitude)}`) : row('Coordinates', 'Unavailable'),
    el('p', { class: m.coordinate_kind === 'estimated_region' ? 'warn' : 'note', text: `${kindText}. ${m.coordinate_note || ''}` }),
    el('h4', { text: 'Outcome' }), el('p', { text: m.outcome_note || 'No outcome recorded yet.' }),
    el('h4', { text: `Payloads (${m.payload_count ?? 'count unknown'}${m.payload_scope && m.payload_scope !== 'unknown' ? ` · ${m.payload_scope}` : ''})` }),
    m.payloads?.length
      ? el('ul', { class: 'payloads' }, m.payloads.map((p) => el('li', {}, el('b', { text: p.name }), el('span', { class: 'chip', text: p.category || 'Uncategorised' }), el('br'), el('small', { text: p.description || '' }))))
      : el('p', { class: 'muted', text: 'No individual payload names confirmed in the sources checked.' }),
    m.payloads?.length && !m.payloads_listed_complete ? el('p', { class: 'note', text: `Showing ${m.payloads.length} confirmed payload names; the list may be incomplete.` }) : null,
    el('p', { class: 'note', text: `Source: ${src ? '' : (m.source_label || 'n/a')}`, }, src ? el('a', { href: src, target: '_blank', rel: 'noopener noreferrer', text: m.source_label || src }) : null, ` · last checked ${m.last_checked || 'n/a'}`),
    el('div', { class: 'actions' },
      m.has_coordinates ? el('button', { class: 'btn', onclick: () => emit('focus-latlon', { lat: m.latitude, lon: m.longitude, highlight: true }), text: 'Show on Moon' }) : null,
      m.has_coordinates ? el('button', { class: 'btn primary', onclick: () => emit('land-request', { name: m.name, lat: m.latitude, lon: m.longitude, kind: 'mission', mission: m }), text: 'LAND HERE' }) : null),
    m.has_coordinates ? el('p', { class: 'note', text: `The landing sequence is a simulation of a generic nominal touchdown${landed && m.outcome !== 'success' ? `, not this mission's actual outcome` : ''}.${m.coordinate_kind === 'estimated_region' ? ' Coordinates are an estimated region centre.' : ''}` }) : null);
}
