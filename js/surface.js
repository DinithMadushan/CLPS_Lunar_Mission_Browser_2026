// Surface Explorer panel: choose a site and land. The heavy 3D modules load on demand.
import { el, $, stateBox, badge } from './ui.js';
import { emit, state } from './state.js';
import { fmtLat, fmtLon } from './geo.js';
import { fetchLandingSites, fetchMissions } from './api.js';

export async function init() {
  const root = $('#panel-surface');
  root.replaceChildren(el('div', { class: 'statebox loading', text: 'Loading landing sites…' }));
  try {
    const [apollo, ms] = await Promise.all([fetchLandingSites(), fetchMissions({ sort: 'name' })]);
    const clps = ms.items.filter((m) => m.has_coordinates);
    const site = (name, lat, lon, extra, payload) => el('div', { class: 'mcard', style: 'cursor:default' }, el('div', { class: 'row between' }, el('h4', { text: name }), extra),
      el('div', { class: 'small muted', text: `${fmtLat(lat)}, ${fmtLon(lon)}` }), el('div', { class: 'actions' }, el('button', { class: 'btn primary small', onclick: () => emit('land-request', payload), text: 'LAND HERE' })));
    root.replaceChildren(
      el('p', {}, 'Pick a site to fly to, descend onto and walk around. Controls: ', el('b', { text: 'WASD / arrows' }), ' move, mouse to look, ', el('b', { text: 'Space' }), ' jump, ', el('b', { text: 'R' }), ' return to lander.'),
      el('div', { class: 'sim-banner', text: 'The ground scene is SIMULATED procedural terrain at the real coordinates. It is not the actual topography of the site. The lander is a generic model and the astronaut is a scale reference only (CLPS landers are uncrewed).' }),
      el('h4', { text: 'CLPS sites' }), ...clps.map((m) => site(m.name, m.latitude, m.longitude, badge(m.status), { name: m.name, lat: m.latitude, lon: m.longitude, kind: 'mission', mission: m })),
      el('h4', { text: 'Apollo stations' }), ...apollo.map((s) => site(s.mission, s.latitude, s.longitude, null, { name: s.mission, lat: s.latitude, lon: s.longitude, kind: 'apollo' })),
      el('p', { class: 'note', text: 'Sites with estimated (not confirmed) coordinates use the centre of the targeted region.' }));
  } catch (e) { root.replaceChildren(stateBox('error', `Could not load sites: ${e.message}`, init)); }
}
