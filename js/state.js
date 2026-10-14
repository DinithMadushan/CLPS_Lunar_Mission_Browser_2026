// Shared application state and a tiny event bus. Modules communicate through events, not imports of each other.
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));

export const state = {
  mode: 'orbit',            // 'orbit' | 'landing' | 'surface' | 'solar'
  panel: 'overview',
  selectedMissionId: null,
  gravity: 1.62,            // m/s^2 used by Gravity Lab and surface physics
  gravityIsHypothetical: false,
  applyGravityToSurface: true,
  dataSources: {}
};
export const REAL_MOON_G = 1.62, EARTH_G = 9.81;
