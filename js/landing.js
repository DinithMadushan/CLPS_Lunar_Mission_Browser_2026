import * as THREE from 'three';
import { camera, controls, setActiveScene, frameCallbacks } from './scene.js';
import { moon } from './moon.js';
import { latLonToVector3, surfaceBasis, fmtLat, fmtLon, MOON_RADIUS_KM } from './geo.js';
import { tween, ease, cancelTween } from './camera.js';
import { markerGroup, highlightLatLon } from './markers.js';
import { buildWorld, surfaceScene, world, emitLanderDust, touchdownBurst, ENV_DEFAULT, env, applyEnv } from './surfaceWorld.js';
import { ensureHud, session, startWalking, spawnPose, player, applyCamera } from './surfaceMode.js';
import { hudShow, hudInfo, hudBanner, hudBannerOff, hudMode } from './hud.js';
import { state, emit, on } from './state.js';
import { fade, toast, $ } from './ui.js';
import { hideDetail } from './detail.js';

const START_ALT = 170, START_OFFSET = new THREE.Vector3(24, 0, -15);
let busy = false, skipRequested = false;
on('skip-descent', () => { skipRequested = true; });

/** Landing sequence: orbital approach (globe) -> cross-fade -> powered descent in a local terrain scene -> touchdown -> ground-level surface mode. */
export async function startLanding(site) {
  if (busy || state.mode !== 'orbit') return; busy = true; skipRequested = false;
  state.mode = 'landing'; emit('mode', 'landing'); ensureHud(); cancelTween(); controls.enabled = false; hideDetail();
  const R = moon.radius, dir = latLonToVector3(site.lat, site.lon, 1).normalize(), b = surfaceBasis(site.lat, site.lon);
  session.site = site; session.dir = dir.toArray(); session.phase = 'approach';
  emit('trail', [{ label: 'Solar System', go: 'solar-home' }, { label: 'Earth–Moon', go: 'solar-home' }, { label: 'Lunar orbit', go: 'exit-to-orbit' }, { label: `Approach: ${site.name}` }]);
  $('#hint').style.display = 'none'; hudMode('approach'); hudShow(true); highlightLatLon(site.lat, site.lon, R);
  const altKm = () => Math.max(0, (camera.position.length() / R - 1) * MOON_RADIUS_KM);
  const info = () => hudInfo([['Target', site.name], ['Coordinates', `${fmtLat(site.lat)}, ${fmtLon(site.lon)}`], ['Orbital altitude', `${altKm().toFixed(0)} km`], ['Phase', 'Orbital approach']]);
  hudBanner('Approaching landing site…');

  // 1) rotate to face the site and descend into a close orbit; camera tilts toward the horizon as it comes down
  const from = camera.position.clone(), fromDir = from.clone().normalize(), fromLen = from.length(), site3 = dir.clone().multiplyScalar(R);
  const ok1 = await tween({ duration: 2.2, update: (e) => { camera.position.copy(fromDir.clone().lerp(dir, e).normalize().multiplyScalar(THREE.MathUtils.lerp(fromLen, 3.0, e))); camera.lookAt(0, 0, 0); info(); } });
  if (!ok1) return abort();
  const ok2 = await tween({ duration: 3.4, easing: ease.inOut, update: (e) => {
    const dist = THREE.MathUtils.lerp(3.0, R * 1.045, e), tilt = (dist - R) * 0.7 * (1 - e * 0.15);
    camera.position.copy(dir).multiplyScalar(dist).addScaledVector(b.north, tilt * -1);
    camera.lookAt(site3.clone().addScaledVector(b.north, 0)); info();
  } });
  if (!ok2) return abort();

  // 2) cross-fade into the local, human-scale terrain scene
  await fade(true, 500);
  hudBannerOff(); const w = buildWorld(site);
  setActiveScene(surfaceScene); markerGroup.visible = false;
  camera.near = 0.1; camera.far = 22000; camera.updateProjectionMatrix(); camera.rotation.order = 'YXZ';
  session.phase = 'descent'; hudMode('descent'); applyEnv();
  const L = w.lander.group; L.position.set(START_OFFSET.x, START_ALT, START_OFFSET.z);
  placeChase(L, 0, true); await fade(false, 600);

  // 3) powered descent
  await runDescent(w, site);
  if (state.mode !== 'landing') return;

  // 4) touchdown -> ground-level view
  hudBanner('TOUCHDOWN — landing status: nominal (simulation)', 0); touchdownBurst(); w.lander.setThrottle(0);
  await settle(w, 2.6);
  hudBannerOff(); await groundHandoff(w);
  startWalking(site); busy = false;
  hudBanner(`You are standing at ${fmtLat(site.lat)}, ${fmtLon(site.lon)} · simulated terrain`, 6000);
}

function abort() { busy = false; if (state.mode === 'landing') { state.mode = 'orbit'; controls.enabled = true; hudShow(false); $('#hint').style.display = ''; emit('trail', [{ label: 'Solar System', go: 'solar-home' }, { label: 'Earth–Moon', go: 'solar-home' }, { label: 'Lunar orbit' }]); } }

const camTarget = new THREE.Vector3(), look = new THREE.Vector3();
function placeChase(L, p, snap, dt = 0.016) {
  const dist = THREE.MathUtils.lerp(70, 19, p), up = THREE.MathUtils.lerp(48, 3.2, Math.pow(p, 1.4)), ang = 0.9 + p * 0.95;
  camTarget.set(L.position.x + Math.cos(ang) * dist, 0, L.position.z + Math.sin(ang) * dist);
  camTarget.y = Math.max(L.position.y + up - 3 * (1 - p), world.heightAt(camTarget.x, camTarget.z) + 1.8);
  if (snap) camera.position.copy(camTarget); else camera.position.lerp(camTarget, 1 - Math.exp(-4 * dt));
  look.set(L.position.x, L.position.y + 1.6, L.position.z);
  // keep looking at the lander, easing the pitch from steep-down toward the horizon as altitude drops
  camera.lookAt(look);
}

function runDescent(w, site) {
  return new Promise((resolve) => {
    const L = w.lander.group, v = { x: 0, y: -2, z: 0 };
    const tick = (dt) => {
      if (state.mode !== 'landing') { frameCallbacks.delete(tick); return resolve(); }
      dt = Math.min(dt, 0.05);
      if (skipRequested) { L.position.set(0, 0.0, 0); v.x = v.y = v.z = 0; }
      const h = Math.max(L.position.y, 0), g = state.applyGravityToSurface ? state.gravity : 1.62;
      // guidance: braking curve vt(h); decelerate hard, then a slow controlled final descent
      const vt = h > 1.5 ? Math.max(0.9, Math.min(26, Math.sqrt(2 * 1.1 * (h - 1.5)) + 0.9)) : 0.9;
      const aMax = 3.2; v.y += THREE.MathUtils.clamp(-vt - v.y, -aMax * dt, aMax * dt);
      v.x += (-(L.position.x) * 0.22 - v.x * 0.9) * dt * 2; v.z += (-(L.position.z) * 0.22 - v.z * 0.9) * dt * 2;
      if (h < 4) { v.x *= 0.9; v.z *= 0.9; }
      L.position.x += v.x * dt; L.position.z += v.z * dt; L.position.y += v.y * dt;
      const throttle = THREE.MathUtils.clamp(0.45 + Math.abs(v.y + vt) * 0.1 + (g / 1.62) * 0.1, 0.4, 1);
      w.lander.setThrottle(L.position.y > 0.02 ? throttle : 0);
      emitLanderDust(h, throttle, dt);
      const p = 1 - Math.min(h, START_ALT) / START_ALT; placeChase(L, p, false, dt);
      hudInfo([['Target', site.name], ['Coordinates', `${fmtLat(site.lat)}, ${fmtLon(site.lon)}`], ['Altitude', `${h.toFixed(1)} m`], ['Descent rate', `${(-v.y).toFixed(1)} m/s`], ['Lateral speed', `${Math.hypot(v.x, v.z).toFixed(1)} m/s`], ['Phase', h > 30 ? 'Braking burn' : (h > 4 ? 'Terminal descent' : 'Final descent')]]);
      if (L.position.y <= 0.0) { L.position.y = 0; frameCallbacks.delete(tick); resolve(); }
    };
    frameCallbacks.add(tick);
  });
}

function settle(w, secs) {   // legs compress slightly, dust drifts, camera holds
  return new Promise((resolve) => {
    let t = 0; const L = w.lander.group;
    const fn = (dt) => { t += dt; L.position.y = -0.07 * Math.exp(-t * 4) * Math.cos(t * 13) * (t < 1.2 ? 1 : 0); camera.lookAt(L.position.x, 1.6, L.position.z); if (t >= secs) { frameCallbacks.delete(fn); L.position.y = 0; resolve(); } };
    frameCallbacks.add(fn);
  });
}

async function groundHandoff(w) {
  const s = spawnPose(); player.x = s.x; player.z = s.z; player.yaw = s.yaw; player.pitch = -0.05; player.third = false;
  const y = world.heightAt(s.x, s.z), endPos = new THREE.Vector3(s.x, y + 1.7, s.z), startPos = camera.position.clone();
  const q0 = camera.quaternion.clone(), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  await tween({ duration: 2.4, easing: ease.inOut, update: (e) => { camera.position.lerpVectors(startPos, endPos, e); camera.quaternion.slerpQuaternions(q0, q1, e); } });
}
