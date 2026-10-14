import { startLoop, frameCallbacks, controls } from './scene.js';
import { updateMarkers } from './markers.js';
import { state } from './state.js';
export function startAnimationLoop() {
  frameCallbacks.add((dt, t) => { if (state.mode === 'orbit') { updateMarkers(t); controls.update(); } });
  startLoop();
}
