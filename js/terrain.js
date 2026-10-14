import * as THREE from 'three';

/** Seeded PRNG + value noise so each site gets stable, reproducible SIMULATED terrain. This is not real topography. */
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function makeNoise(rand) {
  const N = 256, perm = new Uint8Array(512), val = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; val[i] = rand() * 2 - 1; }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const v = (a, b) => val[perm[perm[X + a] + Y + b]];
    const u = fade(xf), w = fade(yf);
    return (v(0, 0) * (1 - u) + v(1, 0) * u) * (1 - w) + (v(0, 1) * (1 - u) + v(1, 1) * u) * w;
  };
}
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

export const MOON_R_M = 1737400;
export const NEAR_SIZE = 400, FAR_SIZE = 7000, PLAY_RADIUS = 180, PAD_FLAT = 11;

export function createTerrain(seed) {
  const rand = mulberry32(seed), noise = makeNoise(rand);
  const craters = [];
  const addCraters = (n, rMin, rMax, area, depthK) => {
    for (let i = 0; i < n; i++) {
      const r = rMin * Math.pow(rMax / rMin, Math.pow(rand(), 1.7));   // many small, few large
      const a = rand() * 6.2832, d = Math.sqrt(rand()) * area;
      if (Math.hypot(d * Math.cos(a), d * Math.sin(a)) < PAD_FLAT + r * 0.6) continue;   // keep the landing pad clear
      craters.push({ x: d * Math.cos(a), z: d * Math.sin(a), r, depth: r * depthK * (0.6 + 0.5 * rand()) });
    }
  };
  addCraters(160, 2.5, 45, 260, 0.2); addCraters(40, 40, 260, 1500, 0.16); addCraters(30, 200, 700, 3500, 0.12);

  function heightAt(x, z) {
    let h = noise(x / 90 + 11, z / 90) * 5 + noise(x / 28, z / 28) * 1.6 + noise(x / 7, z / 7) * 0.35 + noise(x / 1.8, z / 1.8) * 0.06;
    h += noise(x / 900 + 40, z / 900) * 55 * smooth(150, 1200, Math.hypot(x, z));   // distant rolling relief
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i], dx = x - c.x, dz = z - c.z, rr = c.r * 1.6;
      if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
      const d = Math.hypot(dx, dz) / c.r;
      if (d < 1) h += c.depth * (d * d * 1.15 - 1) * (1 - 0.0 * d);                 // bowl
      if (d < 1.6) h += c.depth * 0.22 * Math.exp(-Math.pow((d - 1.02) / 0.22, 2));  // raised rim
    }
    h *= smooth(PAD_FLAT, PAD_FLAT + 14, Math.hypot(x, z));                            // flat landing pad at the origin
    return h - (x * x + z * z) / (2 * MOON_R_M);                                       // lunar curvature (horizon ~2.4 km at eye height)
  }

  const rockRand = mulberry32(seed ^ 0x9e3779b9), boulders = [];
  return { heightAt, craters, boulders, rand, rockRand, noise };
}

function regolithTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = mulberry32(seed);
  g.fillStyle = '#8d8982'; g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256), n = makeNoise(r);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4, v = 125 + n(x / 20, y / 20) * 22 + n(x / 5, y / 5) * 16 + (r() - 0.5) * 34;
    img.data[i] = v; img.data[i + 1] = v * 0.98; img.data[i + 2] = v * 0.94; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function buildTerrainMeshes(terrain, seed) {
  const tex = regolithTexture(seed), group = new THREE.Group();
  const mk = (size, seg, repeat, offsetFar) => {
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, terrain.heightAt(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(repeat, repeat);
    const m = new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 2.2, roughness: 1, metalness: 0, color: 0xb9b9b6,
      polygonOffset: offsetFar, polygonOffsetFactor: offsetFar ? 3 : 0, polygonOffsetUnits: offsetFar ? 3 : 0 });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = !offsetFar; return mesh;
  };
  const near = mk(NEAR_SIZE, 300, 130, false), far = mk(FAR_SIZE, 220, 2200, true);
  group.add(far, near); tex.dispose();
  return group;
}

/** Instanced rocks; boulders big enough to block walking are recorded for collision. */
export function buildRocks(terrain, count = 700) {
  const r = terrain.rockRand;
  const geo = new THREE.IcosahedronGeometry(1, 1), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const k = 0.78 + r() * 0.44; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k); }
  geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  let n = 0;
  while (n < count) {
    const a = r() * 6.2832, d = 9 + Math.pow(r(), 0.8) * 220, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const size = 0.08 + Math.pow(r(), 4.5) * 2.2;
    p.set(x, terrain.heightAt(x, z) + size * 0.15, z); e.set(r() * 3, r() * 6.28, r() * 3); q.setFromEuler(e);
    s.set(size * (0.8 + r() * 0.5), size * (0.6 + r() * 0.4), size * (0.8 + r() * 0.5)); m.compose(p, q, s);
    mesh.setMatrixAt(n, m); const g = 0.2 + r() * 0.2; col.setRGB(g, g * 0.97, g * 0.92); mesh.setColorAt(n, col);
    if (size > 0.7) terrain.boulders.push({ x, z, r: size * 0.9 });
    n++;
  }
  mesh.castShadow = mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  return mesh;
}
