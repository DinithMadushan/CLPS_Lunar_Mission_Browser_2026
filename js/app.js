import { orbitScene, camera, controls } from './scene.js';
import { loadMoon, moon } from './moon.js';
import { fetchLandingSites, fetchMoonquakes, fetchMission } from './api.js';
import { createApolloMarkers, createQuakeMarkers, createClpsMarkers, highlight, highlightLatLon, findMarker } from './markers.js';
import { initLayerControls } from './layers.js';
import { initInteraction } from './interaction.js';
import { startAnimationLoop } from './animation.js';
import { focusLatLon } from './camera.js';
import { showQuake, showApollo, showMission, hideDetail } from './detail.js';
import { initMissions, getMissions } from './missions.js';
import { initStats, renderStats } from './stats.js';
import { el, $, $$, toast, stateBox } from './ui.js';
import { state, on, emit } from './state.js';

const TITLES = { overview: 'Overview', missions: 'CLPS Missions', stats: 'Mission Statistics', quakes: 'Moonquake Map', surface: 'Surface Explorer', gravity: 'Gravity Lab', env: 'Environment Lab', solar: 'Solar System', about: 'Settings / About' };
const lazy = { surface: './surface.js', gravity: './gravity.js', env: './environment.js', solar: './solar.js' };
const loaded = {};

/* ---------- navigation ---------- */
export async function openPanel(id) {
  state.panel = id;
  $$('#rail button').forEach((b) => b.classList.toggle('active', b.dataset.panel === id));
  $$('.panel').forEach((p) => { p.hidden = p.id !== `panel-${id}`; });
  $('#side-title').textContent = TITLES[id]; $('#side').classList.remove('collapsed');
  if (id === 'stats') renderStats();
  if (lazy[id] && !loaded[id]) {
    loaded[id] = true;
    try { const m = await import(lazy[id]); await m.init?.(); }
    catch (e) { console.error(`Module ${id} failed`, e); loaded[id] = false; $(`#panel-${id}`).replaceChildren(stateBox('error', `This module failed to load: ${e.message}`, () => openPanel(id))); }
  }
  emit('panel-opened', id);
  if (id === 'solar' && loaded.solar) emit('solar-home');
}
$$('#rail button').forEach((b) => b.addEventListener('click', () => (state.panel === b.dataset.panel && !$('#side').classList.contains('collapsed') ? $('#side').classList.add('collapsed') : openPanel(b.dataset.panel))));
$('#side-collapse').addEventListener('click', () => $('#side').classList.add('collapsed'));
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) openPanel(g.dataset.go); });
on('open-panel', openPanel);

/* ---------- breadcrumb ---------- */
export function setTrail(parts) {
  $('#breadcrumb').replaceChildren(...parts.flatMap((p, i) => {
    const last = i === parts.length - 1;
    const node = p.go && !last ? el('button', { onclick: () => emit(p.go, p.arg), text: p.label }) : el('span', { class: last ? 'cur' : '', text: p.label });
    return i ? [el('span', { class: 'sep', text: '›' }), node] : [node];
  }));
}
on('trail', setTrail);
on('mode', (m) => { if (m === 'surface' || m === 'landing') $('#side').classList.add('collapsed'); });
export const orbitTrail = () => [{ label: 'Solar System', go: 'solar-home' }, { label: 'Earth–Moon', go: 'solar-home' }, { label: 'Lunar orbit' }];
setTrail(orbitTrail());

/* ---------- selection handling ---------- */
let selectedEntry = null;
function selectEntry(entry) {
  selectedEntry = entry; highlight(entry, moon.radius);
  if (entry.kind === 'quake') showQuake(entry.data);
  else if (entry.kind === 'apollo') showApollo(entry.data);
  else if (entry.kind === 'mission') { state.selectedMissionId = entry.data.id; showMission(entry.data); }
}
on('marker-selected', (entry) => { selectEntry(entry); });
on('detail-closed', () => { highlight(null); selectedEntry = null; });
on('focus-latlon', ({ lat, lon, highlight: h }) => { if (state.mode !== 'orbit') return; focusLatLon(lat, lon, Math.max(3.2, camera.position.length() * 0.8)); if (h && !selectedEntry) highlightLatLon(lat, lon, moon.radius); });
on('mission-selected', async (id) => {
  if (state.mode !== 'orbit') emit('exit-to-orbit');
  let m = getMissions().find((x) => x.id === id);
  if (!m) { try { m = (await fetchMission(id)).mission; } catch (e) { toast(`Could not load mission: ${e.message}`); return; } }
  const entry = findMarker('mission', (d) => d.id === id);
  if (entry) { selectEntry(entry); }
  else { selectedEntry = null; highlight(null); showMission(m); toast('This mission has no coordinates, so it is not shown on the Moon.'); }
  if (m.has_coordinates) emit('focus-latlon', { lat: m.latitude, lon: m.longitude });
});
on('land-request', async (site) => {
  try { const m = await import('./landing.js'); m.startLanding(site); }
  catch (e) { console.error(e); toast(`Landing module unavailable: ${e.message}`); }
});

/* ---------- data loading ---------- */
function setChips() {
  const s = state.dataSources;
  $('#chips').replaceChildren(...Object.entries(s).map(([k, v]) => el('span', { class: `chip${v === 'bundled' ? ' sim' : ''}`, text: `${k}: ${v}` })));
  const a = $('#about-source'); if (a) a.replaceChildren(el('p', { class: 'note', text: `Data sources — ${Object.entries(s).map(([k, v]) => `${k}: ${v}`).join(', ') || 'loading'}. "bundled" means the backend is serving the verified local reference files because the Supabase tables are not configured.` }));
}
async function loadMarkers() {
  const R = moon.radius;
  const [sites, quakes] = await Promise.allSettled([fetchLandingSites(), fetchMoonquakes()]);
  const qs = $('#quake-status');
  if (sites.status === 'fulfilled') { createApolloMarkers(sites.value, R); $('#apollo-count').textContent = $('#apollo-layer-count').textContent = sites.value.length; state.apollo = sites.value; }
  else { console.error('Apollo site loading failed:', sites.reason); qs.append(stateBox('error', `Apollo stations unavailable: ${sites.reason.message}`)); }
  if (quakes.status === 'fulfilled') {
    const r = createQuakeMarkers(quakes.value, R);
    $('#quake-count').textContent = r.total; $('#shallow-count').textContent = `${r.counts.shallow} events`; $('#deep-count').textContent = `${r.counts.deep} events`; $('#impact-count').textContent = `${r.counts.artificial_impact} events`;
    if (r.skipped) qs.append(el('p', { class: 'note', text: `${r.skipped} record(s) without coordinates are not plotted.` }));
    state.quakes = quakes.value;
  } else { console.error('Moonquake loading failed:', quakes.reason); qs.append(stateBox('error', `Moonquake data unavailable: ${quakes.reason.message}`)); }
  setChips();
}
on('missions-loaded', (items) => {
  createClpsMarkers(items, moon.radius);
  $('#clps-layer-count').textContent = `${items.filter((m) => m.has_coordinates).length} of ${items.length} have coordinates`;
  state.dataSources.missions = state.dataSources.missions || 'unknown'; setChips();
  $('#ov-cards').replaceChildren(...[['Missions', items.length], ['Landed', items.filter((m) => m.landing_actual).length], ['Planned', items.filter((m) => m.status === 'planned').length]].map(([l, v]) => el('div', { class: 'scard' }, el('b', { text: v }), el('span', { text: l }))));
});

async function init() {
  startAnimationLoop(); initLayerControls(); initInteraction(); initStats();
  await loadMoon((p) => { $('#loadbar').style.width = `${Math.round(p * 100)}%`; $('#loadtext').textContent = `Loading Moon model… ${Math.round(p * 100)}%`; });
  if (moon.usingFallback) toast('Moon model failed to load — showing a plain sphere. Markers still work.', 7000);
  $('#loading').classList.add('done');
  initMissions();                // independent of marker loading; failures show in its own panel
  await loadMarkers();
  window.__app = { state, camera, controls, moon, renderer: (await import('./scene.js')).renderer };      // handy for debugging / automated tests
  emit('ready');
}
init();
