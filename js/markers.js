import * as THREE from 'three';
import { orbitScene } from './scene.js';
import { latLonToVector3 } from './geo.js';
import { STATUS_COLOR } from './ui.js';

/** Every selectable marker. Picking only considers entries whose layer is visible. */
export const markers = [];
export const pulseRings = [];
export const layerVisible = { apollo: true, shallow: true, deep: true, impact: true, clps: true };
const group = new THREE.Group();   // all markers live here so they can be hidden in surface/solar mode
orbitScene.add(group);
export const markerGroup = group;

const QUAKE_COLOR = { shallow: 0xff3333, deep: 0xff9f43, artificial_impact: 0xb56cff };
const QUAKE_LAYER = { shallow: 'shallow', deep: 'deep', artificial_impact: 'impact' };
const sharedSphere = new Map();
function sphereGeo(r) { const k = r.toFixed(4); if (!sharedSphere.has(k)) sharedSphere.set(k, new THREE.SphereGeometry(r, 16, 16)); return sharedSphere.get(k); }

function register(object, layer, kind, data, ring) {
  group.add(object); markers.push({ object, layer, kind, data, ring });
  if (ring) { group.add(ring); }
}

export function createApolloMarkers(sites, R) {
  sites.forEach((s) => {
    const m = new THREE.Mesh(sphereGeo(R * 0.016), new THREE.MeshBasicMaterial({ color: 0x00ffcc }));
    m.position.copy(latLonToVector3(s.latitude, s.longitude, R * 1.012));
    register(m, 'apollo', 'apollo', s);
  });
}

export function createQuakeMarkers(quakes, R) {
  const counts = { shallow: 0, deep: 0, artificial_impact: 0 };
  let skipped = 0;
  quakes.forEach((q) => {
    if (q.latitude == null || q.longitude == null) { skipped++; return; }
    const layer = QUAKE_LAYER[q.event_type]; if (layer) counts[q.event_type]++;
    const color = QUAKE_COLOR[q.event_type] ?? 0xffffff, pos = latLonToVector3(+q.latitude, +q.longitude, R * 1.012);
    const m = new THREE.Mesh(sphereGeo(R * 0.012), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pos);
    const ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.016, R * 0.026, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.copy(pos); ring.lookAt(0, 0, 0);
    pulseRings.push({ object: ring, layer: layer || 'shallow', phase: Math.random() });
    register(m, layer || 'shallow', 'quake', q, ring);
  });
  return { counts, total: quakes.length, skipped };
}

let clpsMarkers = [];
/** (Re)build CLPS markers from mission records. Only missions with coordinates get a marker; estimated sites are drawn hollow. */
export function createClpsMarkers(missions, R) {
  clpsMarkers.forEach((e) => { group.remove(e.object); e.object.geometry.dispose(); e.object.material.dispose(); markers.splice(markers.indexOf(e), 1); });
  clpsMarkers = [];
  missions.filter((m) => m.has_coordinates).forEach((m) => {
    const estimated = m.coordinate_kind !== 'reported_actual';
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(STATUS_COLOR[m.status] || '#fff'), wireframe: estimated });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.028), mat);
    mesh.position.copy(latLonToVector3(m.latitude, m.longitude, R * 1.02));
    mesh.visible = layerVisible.clps;
    group.add(mesh);
    const entry = { object: mesh, layer: 'clps', kind: 'mission', data: m };
    markers.push(entry); clpsMarkers.push(entry);
  });
}

export function setLayerVisible(layer, visible) {
  layerVisible[layer] = visible;
  markers.forEach((e) => { if (e.layer === layer) { e.object.visible = visible; if (e.ring) e.ring.visible = visible; } });
}

// Selection highlight: a pulsing halo plus a thin beam up from the surface.
const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
halo.visible = false; group.add(halo);
export function highlight(entry, R) {
  if (!entry) { halo.visible = false; return; }
  halo.position.copy(entry.object.position); halo.lookAt(0, 0, 0);
  halo.scale.setScalar(R * 0.05); halo.visible = true; halo.userData.base = R * 0.05;
}
export function highlightLatLon(lat, lon, R) {
  const fake = { object: { position: latLonToVector3(lat, lon, R * 1.02) } };
  highlight(fake, R);
}
export function findMarker(kind, pred) { return markers.find((e) => e.kind === kind && pred(e.data)); }

export function updateMarkers(t) {
  pulseRings.forEach((p) => {
    const ring = p.object; if (!ring.visible) return;
    const k = (t * 0.6 + p.phase) % 1;
    ring.scale.setScalar(1 + k * 0.9); ring.material.opacity = 0.7 * (1 - k);
  });
  if (halo.visible) { const k = (t * 0.9) % 1; halo.scale.setScalar(halo.userData.base * (1 + k * 0.6)); halo.material.opacity = 1 - k; }
}
