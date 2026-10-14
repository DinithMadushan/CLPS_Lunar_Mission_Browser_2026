import * as THREE from 'three';
import { camera, renderer } from './scene.js';
import { markers } from './markers.js';
import { state, emit } from './state.js';

/**
 * Screen-space picking: project each VISIBLE marker to the screen and choose the nearest one within a
 * pixel radius, ignoring markers on the far side of the Moon. This (a) makes tiny markers easy to hit,
 * (b) never selects hidden layers, and (c) avoids raycasting against the huge Moon mesh.
 */
const PICK_PX = 16;
const v = new THREE.Vector3(), camDir = new THREE.Vector3();
export function pick(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  let best = null, bestD = PICK_PX;
  for (const e of markers) {
    if (!e.object.visible) continue;
    v.copy(e.object.position);
    camDir.copy(camera.position).sub(v);
    if (camDir.dot(v) <= 0) continue;                       // below the horizon from the camera
    v.project(camera); if (v.z > 1) continue;
    const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left, sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    const d = Math.hypot(sx - clientX, sy - clientY);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function initInteraction() {
  const canvas = renderer.domElement;
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || state.mode !== 'orbit') return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 5) return;                                   // it was a drag (orbit), not a click
    const hit = pick(e.clientX, e.clientY);
    if (hit) emit('marker-selected', hit);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (state.mode !== 'orbit' || e.buttons) return;
    canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : 'grab';
  });
}
