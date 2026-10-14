import * as THREE from 'three';
import { camera, controls, orbitScene, setActiveScene, frameCallbacks, renderer } from './scene.js';
import { world, surfaceScene, updateWorld, disposeWorld, gravity, env, applyEnv, ENV_DEFAULT, sunDirLocal } from './surfaceWorld.js';
import { PLAY_RADIUS } from './terrain.js';
import { buildHud, hudShow, hudInfo, hudBanner, hudMode, drawCompass } from './hud.js';
import { state, emit, on } from './state.js';
import { fade, toast, $ } from './ui.js';
import { fmtLat, fmtLon } from './geo.js';
import { moon } from './moon.js';
import { markerGroup } from './markers.js';
import { tween, ease } from './camera.js';

const EYE = 1.7, WALK = 2.2, RUN = 4.8, JUMP_V = 2.8, LANDER_BLOCK = 2.7;
export const player = { x: 6.5, z: 7, y: 0, vy: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, onGround: true, third: false, walkPhase: 0 };
export const session = { phase: 'none', saved: null, site: null };
const keys = {};
let handlers = null, hudRefs = null, compassT = 0, locked = false, dragging = false;

export function spawnPose() { const dx = 0 - 6.5, dz = 0 - 7; return { x: 6.5, z: 7, yaw: Math.atan2(-dx, -dz) }; }
export const eyePosition = () => new THREE.Vector3(player.x, player.y + EYE, player.z);

export function ensureHud() {
  if (hudRefs) return hudRefs;
  handlers = { toLander: returnToLander, toggleView, toggleScale, toOrbit: () => exitToOrbit(), skip: () => emit('skip-descent') };
  hudRefs = buildHud(handlers); return hudRefs;
}

export function startWalking(site) {
  session.phase = 'walk'; state.mode = 'surface'; hudMode('walk'); hudShow(true);
  const s = spawnPose(); Object.assign(player, { x: s.x, z: s.z, yaw: s.yaw, pitch: -0.05, vx: 0, vz: 0, vy: 0, onGround: true });
  player.y = world.heightAt(player.x, player.z);
  camera.rotation.order = 'YXZ'; applyCamera();
  emit('trail', [{ label: 'Solar System', go: 'solar-home' }, { label: 'Earth–Moon', go: 'solar-home' }, { label: 'Moon', go: 'exit-to-orbit' }, { label: `Surface: ${site.name}` }]);
  attachInput(); toast('Click the view to capture the mouse and look around. Esc releases it.', 5000);
  emit('mode', 'surface');
}

/* ---------- input ---------- */
const onKey = (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const down = e.type === 'keydown'; keys[e.code] = down;
  if (down && session.phase === 'walk') {
    if (e.code === 'KeyR') returnToLander(); else if (e.code === 'KeyV') toggleView();
    if (e.code === 'Space') { e.preventDefault(); jump(); }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }
};
const LOOK = 0.0022;
const lookBy = (dx, dy) => { player.yaw -= dx * LOOK; player.pitch = THREE.MathUtils.clamp(player.pitch - dy * LOOK, -1.45, 1.45); };
const onMouseMove = (e) => { if (session.phase !== 'walk') return; if (document.pointerLockElement === renderer.domElement) lookBy(e.movementX, e.movementY); else if (dragging) lookBy(e.movementX, e.movementY); };
// requestPointerLock must be called synchronously inside the user gesture handler (browser requirement)
const onCanvasDown = (e) => { if (session.phase !== 'walk') return; dragging = true; try { const p = renderer.domElement.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* fall back to drag-look */ } };
const onUp = () => { dragging = false; };
const onLockChange = () => { locked = document.pointerLockElement === renderer.domElement; const h = $('#lockhint'); if (h) h.style.display = (!locked && session.phase === 'walk') ? 'block' : 'none'; };
let attached = false;
function attachInput() {
  if (attached) return; attached = true;
  addEventListener('keydown', onKey); addEventListener('keyup', onKey); addEventListener('mousemove', onMouseMove); addEventListener('mouseup', onUp);
  renderer.domElement.addEventListener('mousedown', onCanvasDown); document.addEventListener('pointerlockchange', onLockChange);
  renderer.domElement.style.cursor = 'crosshair'; onLockChange();
}
function detachInput() {
  if (!attached) return; attached = false;
  removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('mousemove', onMouseMove); removeEventListener('mouseup', onUp);
  renderer.domElement.removeEventListener('mousedown', onCanvasDown); document.removeEventListener('pointerlockchange', onLockChange);
  if (document.pointerLockElement) document.exitPointerLock(); Object.keys(keys).forEach((k) => delete keys[k]); renderer.domElement.style.cursor = 'grab';
  const h = $('#lockhint'); if (h) h.style.display = 'none';
}

function jump() { if (player.onGround) { player.vy = JUMP_V; player.onGround = false; } }
export function returnToLander() { const s = spawnPose(); Object.assign(player, { x: s.x, z: s.z, yaw: s.yaw, vx: 0, vz: 0 }); player.y = world.heightAt(player.x, player.z); player.vy = 0; player.onGround = true; toast('Back at the lander'); }
export function toggleView() { player.third = !player.third; hudRefs.view.textContent = `View: ${player.third ? 'third person' : 'first person'} (V)`; }
export function toggleScale() { world.scaleAstro.visible = !world.scaleAstro.visible; hudRefs.astro.textContent = `Scale astronaut: ${world.scaleAstro.visible ? 'on' : 'off'}`; if (world.scaleAstro.visible) toast('Astronaut shown for scale only: CLPS missions are uncrewed.'); }

/* ---------- per-frame ---------- */
const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
export function applyCamera() {
  const w = world;
  if (player.third) {
    const back = 4.5, h = player.y + 1.6 + Math.sin(-player.pitch) * 2;
    camera.position.set(player.x + Math.sin(player.yaw) * back * Math.cos(player.pitch), Math.max(h, world.heightAt(player.x + Math.sin(player.yaw) * back, player.z + Math.cos(player.yaw) * back) + 0.8), player.z + Math.cos(player.yaw) * back * Math.cos(player.pitch));
    camera.lookAt(player.x, player.y + 1.4, player.z); w.astro.visible = true;
  } else {
    camera.position.set(player.x, player.y + EYE, player.z); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); w.astro.visible = false;
  }
  w.astro.position.set(player.x, player.y, player.z); w.astro.rotation.y = player.yaw + Math.PI;
}

function walkTick(dt) {
  const w = world, f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const speed = keys.ShiftLeft || keys.ShiftRight ? RUN : WALK;
  let tx = 0, tz = 0;
  if (f || r) { const l = Math.hypot(f, r); tx = (-Math.sin(player.yaw) * f + Math.cos(player.yaw) * r) / l * speed; tz = (-Math.cos(player.yaw) * f - Math.sin(player.yaw) * r) / l * speed; }
  const air = player.onGround ? 8 : 1.2, k = 1 - Math.exp(-air * dt);   // little air control while jumping
  player.vx += (tx - player.vx) * k; player.vz += (tz - player.vz) * k;
  player.x += player.vx * dt; player.z += player.vz * dt;
  const d = Math.hypot(player.x, player.z);
  if (d > PLAY_RADIUS) { const s = PLAY_RADIUS / d; player.x *= s; player.z *= s; if (!walkTick.warned) { toast('Edge of the simulated area'); walkTick.warned = true; setTimeout(() => { walkTick.warned = false; }, 4000); } }
  // collisions: lander body and boulders (simple circle push-out)
  const push = (cx, cz, rad) => { const dx = player.x - cx, dz = player.z - cz, dd = Math.hypot(dx, dz); if (dd < rad) { const s = (rad - dd) / (dd || 1); player.x += dx * s; player.z += dz * s; } };
  push(0, 0, LANDER_BLOCK); for (const b of w.terrain.boulders) { if (Math.abs(b.x - player.x) < 4 && Math.abs(b.z - player.z) < 4) push(b.x, b.z, b.r + 0.35); }
  const ground = w.heightAt(player.x, player.z), g = gravity();
  if (!player.onGround) { player.vy -= g * dt; player.y += player.vy * dt; if (player.y <= ground) { player.y = ground; player.vy = 0; player.onGround = true; } }
  else { if (ground < player.y - 0.05 && ground < player.y - speed * dt * 0.6) { player.onGround = false; } else player.y = ground; }
  const moving = Math.hypot(player.vx, player.vz);
  player.walkPhase += moving * dt * 3.2; w.astro.userData.walk(player.walkPhase, Math.min(1, moving / WALK) * (player.onGround ? 1 : 0.3));
  applyCamera();
}

function hudTick(dt) {
  compassT -= dt; if (compassT > 0) return; compassT = 0.1;
  const w = world, el = env.sunElevation, headingDeg = ((-player.yaw * 180 / Math.PI) % 360 + 360) % 360, g = gravity();
  const dist = Math.hypot(player.x, player.z), irr = Math.max(0, Math.sin(el * Math.PI / 180)) * 1361 * env.sunlight;
  const earthAz = ((Math.atan2(w.earthDir.x, -w.earthDir.z) * 180 / Math.PI) + 360) % 360;
  hudInfo([
    ['Site', session.site.name], ['Landing coordinates', `${fmtLat(session.site.lat)}, ${fmtLon(session.site.lon)}`],
    ['Distance from lander', `${dist.toFixed(1)} m`], ['Heading', `${headingDeg.toFixed(0)}°`],
    ['Gravity', `${g.toFixed(2)} m/s²${state.gravityIsHypothetical && state.applyGravityToSurface ? ' (hypothetical)' : ' (lunar)'}`],
    ['Sun elevation', `${el.toFixed(0)}°`], ['Irradiance (geometric est.)', `${irr.toFixed(0)} W/m²`],
    ['Earth', w.earthVisible ? `${w.earthElevationDeg.toFixed(0)}° above horizon` : 'below horizon'], ['Terrain', 'SIMULATED (procedural)']]);
  drawCompass(env.sunAzimuth, el, headingDeg, earthAz, w.earthVisible ? w.earthElevationDeg : null);
}

export function surfaceTick(dt, t) {
  if (!world.built || state.mode === 'orbit' || state.mode === 'solar') return;
  if (session.phase === 'walk') walkTick(dt);
  const focus = session.phase === 'walk' ? { x: player.x, y: player.y, z: player.z } : { x: camera.position.x, y: 0, z: camera.position.z };
  updateWorld(dt, t, focus); if (session.phase === 'walk' || session.phase === 'descent') hudTick(dt);
}
frameCallbacks.add(surfaceTick);

/* ---------- leaving ---------- */
let leaving = false;
export async function exitToOrbit() {
  if (leaving || state.mode === 'orbit') return; leaving = true;
  session.phase = 'leaving'; detachInput(); hudShow(false);
  await fade(true, 500);
  disposeWorld(); setActiveScene(orbitScene);
  camera.near = 0.01; camera.far = 1000; camera.updateProjectionMatrix(); camera.rotation.order = 'XYZ';
  markerGroup.visible = true; controls.enabled = true;
  const dir = new THREE.Vector3(...(session.dir || [0, 0, -1])).normalize(), start = dir.clone().multiplyScalar(moon.radius * 1.06);
  camera.position.copy(start); camera.lookAt(0, 0, 0);
  state.mode = 'orbit'; session.phase = 'none'; $('#hint').style.display = '';
  emit('trail', [{ label: 'Solar System', go: 'solar-home' }, { label: 'Earth–Moon', go: 'solar-home' }, { label: 'Lunar orbit' }]); emit('mode', 'orbit');
  await fade(false, 500);
  await tween({ duration: 2.2, update: (e) => { camera.position.copy(dir).multiplyScalar(THREE.MathUtils.lerp(moon.radius * 1.06, 3.6, e)); camera.lookAt(0, 0, 0); } });
  leaving = false;
}
on('exit-to-orbit', () => { if (state.mode === 'surface' || state.mode === 'landing') exitToOrbit(); });
