import * as THREE from 'three';
import { camera, controls, renderer, setActiveScene, frameCallbacks, makeStarfield } from './scene.js';
import { fetchBodies } from './api.js';
import { el, $, stateBox, fade, toast } from './ui.js';
import { state, emit, on } from './state.js';
import { tween, ease, cancelTween } from './camera.js';
import { mulberry32 } from './terrain.js';

/* VISUALISATION SCALE ONLY. Orbit radius = 20 + 40*log10(a / 0.387) scene units; body size ~ diameter^0.4.
   Neither is proportional to reality: this is NOT a physically accurate distance or size map. */
const solarScene = new THREE.Scene();
const bodies = {};            // id -> { data, mesh, pivot, label, r, orbitR, angle, speed }
let data = null, ready = false, selected = null, follow = null, savedOrbit = null, animate = true, entering = false;
const labelsEl = () => $('#labels');

function texture(id, seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'), r = mulberry32(seed);
  const fill = (col) => { g.fillStyle = col; g.fillRect(0, 0, 256, 128); };
  const bands = (cols, n, amp) => { fill(cols[0]); for (let i = 0; i < n; i++) { g.fillStyle = cols[1 + Math.floor(r() * (cols.length - 1))]; g.globalAlpha = 0.25 + r() * 0.4; const y = r() * 128; g.fillRect(0, y, 256, 3 + r() * amp); } g.globalAlpha = 1; };
  const blobs = (col, n, s) => { g.fillStyle = col; for (let i = 0; i < n; i++) { g.globalAlpha = 0.3 + r() * 0.4; g.beginPath(); g.ellipse(r() * 256, r() * 128, 4 + r() * s, 3 + r() * s * 0.6, r() * 3, 0, 6.28); g.fill(); } g.globalAlpha = 1; };
  switch (id) {
    case 'mercury': fill('#8c8782'); blobs('#6b6661', 80, 10); blobs('#b0aaa3', 40, 6); break;
    case 'venus': bands(['#d9b87a', '#e8cf9a', '#c9a064', '#f1dfb8'], 40, 9); break;
    case 'earth': fill('#1f5aa8'); blobs('#3f7a45', 28, 28); blobs('#8a7d52', 12, 16); blobs('#ffffff', 70, 18); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 8); g.fillRect(0, 120, 256, 8); break;
    case 'moon': fill('#9a9a9a'); blobs('#6e6e6e', 50, 14); blobs('#bdbdbd', 60, 5); break;
    case 'mars': fill('#b5603a'); blobs('#7e3f24', 40, 14); blobs('#d9a070', 25, 10); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 122, 256, 6); break;
    case 'jupiter': bands(['#c9a679', '#e8d5b5', '#a8744a', '#f2e8d5', '#8f5b3a'], 70, 8); g.fillStyle = '#b4462f'; g.beginPath(); g.ellipse(170, 84, 16, 9, 0, 0, 6.28); g.fill(); break;
    case 'saturn': bands(['#d9c48f', '#eadbb0', '#c4a96d'], 55, 6); break;
    case 'uranus': bands(['#9fd9dc', '#b5e6e8', '#8cc9cf'], 14, 6); break;
    case 'neptune': bands(['#3856c9', '#4a6be0', '#2a40a0'], 22, 6); g.fillStyle = '#1b2a77'; g.beginPath(); g.ellipse(80, 70, 12, 7, 0, 0, 6.28); g.fill(); break;
    default: fill('#888');
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sizeOf = (d) => (d.id === 'sun' ? 8 : 2 * Math.pow(d.diameter_km / 12756, 0.4));
const orbitOf = (d) => (d.semi_major_axis_au > 0 ? 20 + 40 * Math.log10(d.semi_major_axis_au / 0.387) : 0);

function build() {
  solarScene.add(makeStarfield(3500, 600, 900, 1.6), new THREE.AmbientLight(0xffffff, 0.22));
  solarScene.children[0].material.sizeAttenuation = false;
  const sunLight = new THREE.PointLight(0xfff2d8, 3.2, 0, 0); solarScene.add(sunLight);
  data.bodies.forEach((d, i) => {
    const r = sizeOf(d), mat = d.id === 'sun' ? new THREE.MeshBasicMaterial({ color: 0xffc45c }) : new THREE.MeshStandardMaterial({ map: texture(d.id, 40 + i), roughness: 0.95 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat); mesh.userData.id = d.id;
    const b = { data: d, mesh, r, orbitR: orbitOf(d), angle: (i * 2.399) % 6.283, speed: d.orbital_period_days ? 0.35 / Math.pow(d.orbital_period_days / 365.25, 0.5) : 0 };
    if (d.id === 'moon') { b.orbitR = 5.6; b.speed = 1.6; }
    if (d.id === 'saturn') { const rc = document.createElement('canvas'); rc.width = 256; rc.height = 1; const g = rc.getContext('2d'); for (let x = 0; x < 256; x++) { const a = (x > 20 && x < 235) ? 0.35 + 0.4 * Math.abs(Math.sin(x * 0.35)) : 0; g.fillStyle = `rgba(222,205,165,${a})`; g.fillRect(x, 0, 1, 1); }
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.35, r * 2.3, 96), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rc), side: THREE.DoubleSide, transparent: true, depthWrite: false })); ring.rotation.x = Math.PI / 2 - 0.45;
      // RingGeometry UVs are planar: remap u to radius so the 1-D texture reads as concentric bands
      const pos = ring.geometry.attributes.position, uv = ring.geometry.attributes.uv, v3 = new THREE.Vector3(); for (let k = 0; k < pos.count; k++) { v3.fromBufferAttribute(pos, k); uv.setXY(k, (v3.length() / r - 1.35) / 0.95, 0.5); }
      mesh.add(ring); }
    b.label = el('span', { text: d.name, onclick: () => selectBody(d.id) }); labelsEl().append(b.label); b.label.style.display = 'none';
    bodies[d.id] = b; solarScene.add(mesh);
    if (d.semi_major_axis_au > 0 && d.id !== 'moon') {   // orbit path (compressed scale)
      const pts = []; for (let k = 0; k <= 128; k++) pts.push(new THREE.Vector3(Math.cos(k / 128 * 6.2832) * b.orbitR, 0, Math.sin(k / 128 * 6.2832) * b.orbitR));
      solarScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x35507a, transparent: true, opacity: 0.55 })));
    }
  });
  const earthOrbit = []; for (let k = 0; k <= 64; k++) earthOrbit.push(new THREE.Vector3(Math.cos(k / 64 * 6.2832) * 5.6, 0, Math.sin(k / 64 * 6.2832) * 5.6));
  bodies.earth.moonPath = new THREE.Line(new THREE.BufferGeometry().setFromPoints(earthOrbit), new THREE.LineBasicMaterial({ color: 0x6aa9ff, transparent: true, opacity: 0.5 })); solarScene.add(bodies.earth.moonPath);
}

const v = new THREE.Vector3(), proj = new THREE.Vector3();
function tick(dt) {
  if (state.mode !== 'solar') return;
  for (const b of Object.values(bodies)) {
    if (animate && b.speed) b.angle += b.speed * dt * 0.25;
    if (b.data.id === 'moon') continue;
    b.mesh.position.set(Math.cos(b.angle) * b.orbitR, 0, Math.sin(b.angle) * b.orbitR); b.mesh.rotation.y += dt * 0.15;
  }
  const m = bodies.moon, e = bodies.earth; m.mesh.position.set(e.mesh.position.x + Math.cos(m.angle) * 5.6, 0, e.mesh.position.z + Math.sin(m.angle) * 5.6); e.moonPath.position.copy(e.mesh.position);
  if (follow) { v.copy(follow.mesh.position); if (follow.id === 'earthmoon') v.lerp(bodies.moon.mesh.position, 0.0); v.sub(controls.target); camera.position.add(v); controls.target.add(v); }
  controls.update();
  const rect = renderer.domElement.getBoundingClientRect();
  for (const b of Object.values(bodies)) {
    proj.copy(b.mesh.position).project(camera);
    const vis = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
    b.label.style.display = vis ? '' : 'none'; if (vis) { b.label.style.left = `${(proj.x * 0.5 + 0.5) * rect.width}px`; b.label.style.top = `${(-proj.y * 0.5 + 0.5) * rect.height}px`; b.label.style.fontWeight = selected === b.data.id ? '700' : '400'; }
  }
}
frameCallbacks.add(tick);

/* ---------- navigation ---------- */
const trail = (...p) => emit('trail', [{ label: 'Solar System', go: 'solar-home' }, ...p]);
async function flyTo(pos, target, dur = 1.8) {
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  await tween({ duration: dur, update: (k) => { camera.position.lerpVectors(p0, pos, k); controls.target.lerpVectors(t0, target, k); camera.lookAt(controls.target); } });
}
export async function showOverview() {
  follow = null; selected = null; trail({ label: 'Overview' }); renderInfo();
  await flyTo(new THREE.Vector3(0, 95, 165), new THREE.Vector3(0, 0, 0), 1.8);
}
export async function selectBody(id) {
  const b = bodies[id]; if (!b) return; selected = id; follow = null;
  const label = { sun: [{ label: 'Sun' }], moon: [{ label: 'Earth–Moon', go: 'solar-focus', arg: 'earth' }, { label: 'Moon' }], earth: [{ label: 'Earth–Moon' }] }[id] || [{ label: b.data.name }];
  trail(...label); renderInfo();
  const target = b.mesh.position.clone(), dir = camera.position.clone().sub(controls.target).normalize(); if (dir.y < 0.15) dir.y = 0.35, dir.normalize();
  const dist = id === 'earth' ? 17 : Math.max(b.r * 5.5, 4);
  await flyTo(target.clone().addScaledVector(dir, dist), target, 1.8);
  follow = b.mesh && { mesh: b.mesh, id };
}
on('solar-focus', (id) => selectBody(id));

async function enter() {
  if (state.mode === 'solar' || entering) return; entering = true;
  if (state.mode === 'surface' || state.mode === 'landing') { const m = await import('./surfaceMode.js'); await m.exitToOrbit(); }
  await fade(true, 450);
  savedOrbit = camera.position.clone(); cancelTween();
  state.mode = 'solar'; setActiveScene(solarScene); camera.near = 0.05; camera.far = 4000; camera.updateProjectionMatrix();
  controls.enablePan = true; controls.minDistance = 1.2; controls.maxDistance = 450; controls.target.set(0, 0, 0);
  camera.position.set(0, 95, 165); $('#hint').textContent = 'Drag to rotate · scroll to zoom · right-drag to pan · click a body'; emit('mode', 'solar');
  trail({ label: 'Overview' }); renderInfo(); await fade(false, 450); entering = false;
}
export async function leaveToMoon(land = false) {
  if (state.mode !== 'solar') return; cancelTween(); follow = null; selected = null;
  await fade(true, 450);
  Object.values(bodies).forEach((b) => { b.label.style.display = 'none'; });
  const { orbitScene } = await import('./scene.js'); setActiveScene(orbitScene);
  camera.near = 0.01; camera.far = 1000; camera.updateProjectionMatrix(); controls.enablePan = false; controls.minDistance = 2.0; controls.maxDistance = 9; controls.target.set(0, 0, 0);
  camera.position.copy(savedOrbit || new THREE.Vector3(0, 0, -4.5)); camera.lookAt(0, 0, 0);
  state.mode = 'orbit'; $('#hint').textContent = 'Drag to rotate · scroll to zoom · click a marker'; emit('mode', 'orbit');
  emit('trail', [{ label: 'Solar System', go: 'solar-home' }, { label: 'Earth–Moon', go: 'solar-home' }, { label: 'Lunar orbit' }]); await fade(false, 450);
}
on('exit-to-orbit', () => { if (state.mode === 'solar') leaveToMoon(); });
on('solar-home', async () => { if (state.panel !== 'solar') { emit('open-panel', 'solar'); return; } await enter(); if (ready) showOverview(); });
on('panel-opened', (id) => { if (state.mode === 'solar' && ['quakes', 'missions', 'stats', 'surface'].includes(id)) leaveToMoon(); });

/* ---------- panel ---------- */
function renderInfo() {
  const root = $('#panel-solar'); if (!ready) return;
  const nav = el('div', { class: 'row' },
    el('button', { class: 'btn small', onclick: showOverview, text: 'Solar System overview' }),
    el('button', { class: 'btn small', onclick: () => selectBody('earth'), text: 'Earth–Moon system' }),
    el('button', { class: 'btn small primary', onclick: () => leaveToMoon(), text: 'Return to the Moon' }));
  const list = el('div', { class: 'row', style: 'margin:8px 0' }, data.bodies.filter((d) => d.id !== 'moon').map((d) => el('button', { class: `btn small${selected === d.id ? ' primary' : ''}`, onclick: () => selectBody(d.id), text: d.name })), el('button', { class: `btn small${selected === 'moon' ? ' primary' : ''}`, onclick: () => selectBody('moon'), text: 'Moon' }));
  const d = selected && bodies[selected]?.data, kv = (k, val) => el('div', { class: 'kv' }, el('span', { text: k }), el('b', { text: val }));
  let info;
  if (d) {
    const pos = d.id === 'sun' ? 'Centre of the Solar System' : d.id === 'moon' ? 'Orbits Earth, the 3rd planet from the Sun' : `Planet ${d.order} from the Sun`;
    info = el('div', { class: 'mcard', style: 'cursor:default' }, el('h4', { text: d.name }), el('p', { class: 'muted small', text: `${d.category} · ${pos}` }), el('p', { class: 'small', text: d.summary }),
      kv('Diameter', `${d.diameter_km.toLocaleString()} km`), kv('Surface gravity', `${d.gravity_ms2} m/s²${d.id !== 'earth' ? ` (${(d.gravity_ms2 / 9.80665).toFixed(2)} × Earth)` : ''}`),
      d.orbital_period_days ? kv(d.id === 'moon' ? 'Orbital period (around Earth)' : 'Orbital period', `${d.orbital_period_days.toLocaleString()} days${d.orbital_period_days > 700 ? ` (${(d.orbital_period_days / 365.25).toFixed(1)} years)` : ''}`) : null,
      kv('Atmosphere', d.atmosphere), el('p', { class: 'note', text: `Source: NASA Planetary Fact Sheet (${data._meta.source_url}). ${data._meta.note.split('.')[0]}.` }),
      el('div', { class: 'actions' }, d.id === 'moon' ? el('button', { class: 'btn primary', onclick: () => leaveToMoon(), text: 'Enter lunar orbit' }) : null, d.id === 'earth' ? el('button', { class: 'btn', onclick: () => selectBody('moon'), text: 'Go to the Moon' }) : null));
  } else info = el('p', { class: 'muted', text: 'Select a body in the 3D view, its label, or the buttons above.' });
  root.replaceChildren(el('div', { class: 'sim-banner', text: 'NOT TO SCALE: orbit spacing is logarithmic and body sizes are compressed so every planet fits on screen. This is not a physically accurate distance or size map.' }),
    nav, el('div', { class: 'section-title', text: 'HIERARCHY: SOLAR SYSTEM → SUN → PLANET → EARTH–MOON → MOON → LANDING SITE' }), list, info,
    el('label', { class: 'row small' }, el('input', { type: 'checkbox', checked: animate, onchange: (e) => { animate = e.target.checked; } }), ' Animate orbits (illustrative speeds)'),
    el('div', { class: 'actions' }, el('button', { class: 'btn small', onclick: async () => { await leaveToMoon(); emit('open-panel', 'surface'); }, text: 'Choose a lunar landing site' })));
}

/* ---------- picking ---------- */
function initPicking() {
  let down; const rc = new THREE.Raycaster(), canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (state.mode !== 'solar' || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = canvas.getBoundingClientRect(); rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = rc.intersectObjects(Object.values(bodies).map((b) => b.mesh), false)[0]; if (hit) selectBody(hit.object.userData.id);
  });
}

export async function init() {
  const root = $('#panel-solar'); root.replaceChildren(el('div', { class: 'statebox loading', text: 'Loading Solar System data…' }));
  try { data = await fetchBodies(); } catch (e) { root.replaceChildren(stateBox('error', `Solar System data unavailable: ${e.message}`, () => { init(); })); throw e; }
  build(); initPicking(); ready = true; renderInfo(); await enter(); }
