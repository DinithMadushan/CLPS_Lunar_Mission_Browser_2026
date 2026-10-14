import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// One renderer + one camera shared by every view. Each view owns its own Scene root.
export const orbitScene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 1000);
camera.position.set(0, 0, -4.5);   // near side faces -Z (see geo.js)

const host = document.getElementById('viewport');
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
host.prepend(renderer.domElement);
renderer.domElement.id = 'gl';

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2.0;
controls.maxDistance = 9;
controls.enablePan = false;

export let activeScene = orbitScene;
export function setActiveScene(s) { activeScene = s; }
export const frameCallbacks = new Set();   // functions(dt, elapsed)

export function makeStarfield(count = 3000, rMin = 40, rMax = 80, size = 0.08) {
  const g = new THREE.BufferGeometry(), p = new Float32Array(count * 3);
  for (let i = 0; i < p.length; i += 3) {
    const r = rMin + Math.random() * (rMax - rMin), t = Math.random() * 6.2832, f = Math.acos(2 * Math.random() - 1);
    p[i] = r * Math.sin(f) * Math.cos(t); p[i + 1] = r * Math.cos(f); p[i + 2] = r * Math.sin(f) * Math.sin(t);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true, transparent: true, depthWrite: false }));
}

export const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
sunLight.position.set(-5, 3, -5);
orbitScene.add(sunLight, new THREE.AmbientLight(0xffffff, 0.8), makeStarfield());

export function resize() {
  const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
}
addEventListener('resize', resize);
new ResizeObserver(resize).observe(host);   // panel collapse/expand changes the viewport size
resize();

/** Release GPU memory for everything under an object. */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    mats.forEach((m) => { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); });
  });
}

const clock = new THREE.Clock();
export function startLoop() {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    frameCallbacks.forEach((fn) => fn(dt, t));
    renderer.render(activeScene, camera);
  });
}
