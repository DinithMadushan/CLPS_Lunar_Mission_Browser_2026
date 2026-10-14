import * as THREE from 'three';
import { camera, controls } from './scene.js';
import { latLonToVector3 } from './geo.js';

export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  linear: (t) => t
};

let current = null;
/** Run an interruptible tween. A new tween (or cancelTween) stops the previous one; the promise resolves false if interrupted. */
export function tween({ duration = 1, easing = ease.inOut, update, signal }) {
  cancelTween();
  return new Promise((resolve) => {
    const job = { done: false, resolve };
    current = job;
    const t0 = performance.now();
    (function step() {
      if (job.done) return;
      if (signal?.aborted) { job.done = true; return resolve(false); }
      const k = Math.min((performance.now() - t0) / (duration * 1000), 1);
      update(easing(k), k);
      if (k < 1) requestAnimationFrame(step); else { job.done = true; if (current === job) current = null; resolve(true); }
    })();
  });
}
export function cancelTween() { if (current && !current.done) { current.done = true; current.resolve(false); } current = null; }
controls.addEventListener('start', cancelTween);   // user grabbing the camera interrupts any fly-to

/** Fly the orbit camera so the given lat/lon faces it, at `dist` from the Moon centre. */
export function focusLatLon(lat, lon, dist = 3.6, duration = 1.6) {
  const dir = latLonToVector3(lat, lon, 1).normalize();
  const from = camera.position.clone(), to = dir.clone().multiplyScalar(dist);
  const fromDir = from.clone().normalize();
  return tween({
    duration,
    update: (e) => {
      const d = fromDir.clone().lerp(dir, e).normalize();
      camera.position.copy(d.multiplyScalar(THREE.MathUtils.lerp(from.length(), dist, e)));
      camera.lookAt(0, 0, 0);
    }
  });
}
