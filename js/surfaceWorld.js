import * as THREE from 'three';
import { camera, renderer, makeStarfield, disposeTree } from './scene.js';
import { createTerrain, buildTerrainMeshes, buildRocks, hashString, mulberry32 } from './terrain.js';
import { buildLander, buildAstronaut } from './lander.js';
import { ParticlePool } from './particles.js';
import { surfaceBasis, earthDirection } from './geo.js';
import { state } from './state.js';

export const surfaceScene = new THREE.Scene();
surfaceScene.background = new THREE.Color(0x000000);       // lunar sky stays black even in full sunlight: no atmosphere to scatter light

export const ENV_DEFAULT = {
  sunElevation: 25, sunAzimuth: 120,      // degrees; azimuth from north toward east
  sunlight: 1, brightness: 1, shadow: 0.85, stars: 0.35,
  dust: 0, density: 0.5, meteors: false, headlamp: false,
  atmosphere: 0, wind: 0, lightning: false
};
export const env = { ...ENV_DEFAULT };
export const world = { built: false };

const SUN_LUX = 3.4, HEAD = new THREE.Vector3();
const deg = THREE.MathUtils.degToRad;
export const sunDirLocal = () => { const e = deg(env.sunElevation), a = deg(env.sunAzimuth); return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)); };   // x east, y up, z south

function earthTexture(seed) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'), r = mulberry32(seed);
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#2a5db0'); grd.addColorStop(0.5, '#1d4f9c'); grd.addColorStop(1, '#2a5db0'); g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 38; i++) { g.fillStyle = r() > 0.5 ? '#3f7a45' : '#8a7d52'; g.beginPath(); g.ellipse(r() * 512, 40 + r() * 176, 14 + r() * 50, 8 + r() * 28, r() * 3, 0, 6.28); g.fill(); }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * 512, r() * 256, 10 + r() * 40, 3 + r() * 8, r() * 3, 0, 6.28); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, 512, 12); g.fillRect(0, 244, 512, 12);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildWorld(site) {
  disposeWorld(); renderer.toneMapping = THREE.LinearToneMapping;
  const seed = hashString(`${site.name}|${site.lat}|${site.lon}`), terrain = createTerrain(seed);
  const w = world; Object.assign(w, { built: true, site, seed, terrain, heightAt: terrain.heightAt, time: 0 });

  w.terrainMesh = buildTerrainMeshes(terrain, seed); w.rocks = buildRocks(terrain);
  w.lander = buildLander(); w.lander.group.position.set(0, 0, 0);
  w.astro = buildAstronaut(); w.astro.visible = false;
  w.scaleAstro = buildAstronaut(); w.scaleAstro.visible = false; w.scaleAstro.position.set(5.5, terrain.heightAt(5.5, 3), 3); w.scaleAstro.lookAt(0, 1.5, 0);
  w.sun = new THREE.DirectionalLight(0xfff6e8, SUN_LUX); w.sun.castShadow = true;
  Object.assign(w.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 700 });
  w.sun.shadow.mapSize.set(2048, 2048); w.sun.shadow.bias = -0.0004; w.sun.shadow.normalBias = 0.06;
  w.ambient = new THREE.AmbientLight(0xffffff, 0.15);
  w.earthLight = new THREE.DirectionalLight(0xbcd4ff, 0.0);
  w.flash = new THREE.PointLight(0xffffff, 0, 400); w.flash.position.set(0, 120, 0);
  w.headlamp = new THREE.SpotLight(0xfff2dd, 0, 60, 0.5, 0.5, 1.2); w.headlamp.target.position.set(0, 0, -1); camera.add(w.headlamp, w.headlamp.target);

  w.stars = makeStarfield(4500, 9000, 10000, 1.7); w.stars.material.sizeAttenuation = false; w.stars.frustumCulled = false;
  w.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(37, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false }));
  w.earth = new THREE.Mesh(new THREE.SphereGeometry(133, 48, 32), new THREE.MeshStandardMaterial({ map: earthTexture(seed), roughness: 0.9, emissive: 0x0a1a33, emissiveIntensity: 0.6 }));
  w.sky = new THREE.Mesh(new THREE.SphereGeometry(9500, 32, 16), new THREE.MeshBasicMaterial({ color: 0x4a86d8, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  w.dust = new ParticlePool(900, { size: 0.35, color: 0xb9ad9b, opacity: 0.75 });
  w.ambientDust = new ParticlePool(1200, { size: 0.09, color: 0xcfc4b2, opacity: 0.7 }); w.ambientDust.drag = 0.8;
  w.meteorLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); w.meteorLine.frustumCulled = false;
  w.meteorT = 0; w.nextMeteor = 1; w.nextBolt = 2; w.boltT = 0;

  surfaceScene.add(w.terrainMesh, w.rocks, w.lander.group, w.astro, w.scaleAstro, w.sun, w.sun.target, w.ambient, w.earthLight, w.flash, w.stars, w.sunDisc, w.earth, w.sky, w.dust.points, w.ambientDust.points, w.meteorLine);
  surfaceScene.add(camera);
  w.basis = surfaceBasis(site.lat, site.lon);
  const dE = earthDirection(site.lat, site.lon), b = w.basis;
  const dl = new THREE.Vector3(dE.dot(b.east), dE.dot(b.up), -dE.dot(b.north));    // Earth direction in the local frame
  w.earthDir = dl; w.earthElevationDeg = Math.asin(dl.y) * 180 / Math.PI; w.earthVisible = dl.y > 0.0;
  w.earth.visible = w.earthVisible; w.earthLight.visible = w.earthVisible;
  applyEnv(); return w;
}

export function disposeWorld() {
  if (!world.built) return;
  camera.remove(world.headlamp, world.headlamp.target); surfaceScene.remove(camera);
  [world.dust, world.ambientDust].forEach((p) => p.points.geometry.dispose());
  disposeTree(surfaceScene); surfaceScene.clear(); world.built = false; renderer.toneMappingExposure = 1; renderer.toneMapping = THREE.NoToneMapping;
}

export function applyEnv() {
  if (!world.built) return;
  const w = world, sd = sunDirLocal(), el = env.sunElevation;
  const sunFactor = THREE.MathUtils.smoothstep(el, -1.5, 3);            // sun fades over the horizon
  w.sun.intensity = SUN_LUX * env.sunlight * sunFactor; w.sun.visible = sunFactor > 0.001;
  w.ambient.intensity = 0.03 + (1 - env.shadow) * 0.8;
  w.earthLight.intensity = w.earthVisible ? 0.3 : 0; if (w.earthVisible) w.earthLight.position.copy(w.earthDir).multiplyScalar(100);
  renderer.toneMappingExposure = env.brightness;
  w.stars.material.opacity = env.stars * (1 - Math.min(1, env.atmosphere * 1.4));
  w.sunDisc.visible = el > -1; w.earth.visible = w.earthVisible;
  const atm = env.atmosphere; w.sky.material.opacity = atm * 0.9 * THREE.MathUtils.clamp((el + 8) / 25, 0, 1);
  surfaceScene.fog = atm > 0 ? new THREE.FogExp2(0x6c8fc4, atm * 0.0032 * THREE.MathUtils.clamp((el + 8) / 25, 0.15, 1)) : null;
  w.headlamp.intensity = env.headlamp ? 650 : 0;
  w.sunDirection = sd;
}

export function groundAt(x, z) { return world.built ? world.heightAt(x, z) : 0; }
export const gravity = () => (state.applyGravityToSurface ? state.gravity : 1.62);

export function emitLanderDust(altitude, throttle, dt) {
  const w = world; if (!w.built || altitude > 32) return;
  const k = (1 - altitude / 32) * throttle, n = Math.floor(k * 90 * dt * 60 / 60 + Math.random());
  for (let i = 0; i < n * 3; i++) {
    const a = Math.random() * 6.2832, sp = (4 + Math.random() * 14) * (0.4 + k), el = 0.02 + Math.random() * 0.22;
    w.dust.emit(Math.cos(a) * 1.2, w.heightAt(0, 0) + 0.15, Math.sin(a) * 1.2, Math.cos(a) * sp, sp * el * 2, Math.sin(a) * sp, 2.5 + Math.random() * 3);
  }
}
export function touchdownBurst() {
  const w = world;
  for (let i = 0; i < 380; i++) { const a = Math.random() * 6.2832, sp = 2 + Math.random() * 11, up = 0.5 + Math.random() * 3.5; w.dust.emit(Math.cos(a) * 1.8, 0.2, Math.sin(a) * 1.8, Math.cos(a) * sp, up, Math.sin(a) * sp, 3 + Math.random() * 4); }
}

const tmp = new THREE.Vector3();
export function updateWorld(dt, t, focus) {
  const w = world; if (!w.built) return;
  w.time += dt;
  const g = gravity(), cp = camera.position;
  // shadow frustum follows the viewer
  w.sun.target.position.set(focus.x, focus.y, focus.z); w.sun.position.copy(w.sun.target.position).addScaledVector(w.sunDirection, 300);
  w.stars.position.copy(cp); w.sky.position.copy(cp);
  w.sunDisc.position.copy(cp).addScaledVector(w.sunDirection, 8000);
  w.earth.position.copy(cp).addScaledVector(w.earthDir, 8000); w.earth.rotation.y += dt * 0.02;
  // particles
  w.dust.update(dt, g, w.heightAt);
  // ambient dust activity (hypothetical visual) and hypothetical wind
  w.ambientDust.wind.set(env.wind * 9, 0, env.wind * 3 * (env.atmosphere > 0 ? 1 : 0)); w.ambientDust.drag = env.atmosphere > 0 ? 1.2 : 0.05;
  const rate = env.dust * (60 + env.density * 500) * dt, count = Math.floor(rate + Math.random());
  for (let i = 0; i < count; i++) {
    const a = Math.random() * 6.2832, d = 2 + Math.random() * 38, x = cp.x + Math.cos(a) * d, z = cp.z + Math.sin(a) * d;
    w.ambientDust.emit(x, w.heightAt(x, z) + 0.05, z, (Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5, 4 + Math.random() * 4);
  }
  w.ambientDust.update(dt, g, w.heightAt);
  // micrometeoroid visual (illustrative: real micrometeoroid impacts are far too small and fast to see like this)
  if (env.meteors) {
    w.nextMeteor -= dt;
    if (w.nextMeteor <= 0) {
      w.nextMeteor = 0.8 + Math.random() * 1.8; const a = Math.random() * 6.2832, d = 25 + Math.random() * 90, x = cp.x + Math.cos(a) * d, z = cp.z + Math.sin(a) * d, y = w.heightAt(x, z);
      w.meteorT = 0.35; w.meteorImpact = new THREE.Vector3(x, y, z); w.meteorFrom = new THREE.Vector3(x - 60 + Math.random() * 20, y + 90, z - 60 + Math.random() * 20);
      for (let i = 0; i < 40; i++) { const b = Math.random() * 6.2832, s = 2 + Math.random() * 7; w.dust.emit(x, y + 0.1, z, Math.cos(b) * s, 2 + Math.random() * 6, Math.sin(b) * s, 2.5); }
    }
  }
  if (w.meteorT > 0) {
    w.meteorT -= dt; const k = Math.max(0, w.meteorT / 0.35), a = w.meteorLine.geometry.attributes.position;
    a.setXYZ(0, w.meteorFrom.x, w.meteorFrom.y, w.meteorFrom.z); tmp.lerpVectors(w.meteorFrom, w.meteorImpact, 1 - k * 0.15); a.setXYZ(1, tmp.x, tmp.y, tmp.z); a.needsUpdate = true;
    w.meteorLine.material.opacity = k; w.flash.position.copy(w.meteorImpact).add(HEAD.set(0, 3, 0)); w.flash.intensity = k * 6000 * (env.meteors ? 1 : 0);
  } else if (!(w.boltT > 0)) { w.flash.intensity = 0; w.meteorLine.material.opacity = 0; }
  // hypothetical lightning (fictional; only when the hypothetical atmosphere is on)
  if (env.lightning && env.atmosphere > 0.05) {
    w.nextBolt -= dt; if (w.nextBolt <= 0) { w.nextBolt = 1.5 + Math.random() * 3.5; w.boltT = 0.25; }
  }
  if (w.boltT > 0) { w.boltT -= dt; const k = Math.max(0, w.boltT / 0.25); w.flash.position.set(cp.x, cp.y + 150, cp.z); w.flash.intensity = k * Math.random() * 30000; if (w.boltT <= 0) w.flash.intensity = 0; }
}
