import * as THREE from 'three';

export const MOON_RADIUS_KM = 1737.4;
// Orientation of models/moon.glb: its near side (lon 0) faces -Z and east is toward -X.
// The original formula put lon 0 on +X, so markers sat 90 deg off the real features.
// Verified visually: Apollo 11/12/15/16/17 land on their maria/highland features.
export const MODEL_LON_OFFSET = 90;

export function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + MODEL_LON_OFFSET + 180) * Math.PI / 180;
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

/** Local surface frame at a lat/lon in globe space: up (normal), east, north (right-handed: east x north = up). */
export function surfaceBasis(lat, lon) {
  const up = latLonToVector3(lat, lon, 1).normalize();
  const eps = 0.01;
  let east = latLonToVector3(lat, lon + eps, 1).sub(latLonToVector3(lat, lon - eps, 1));
  east.addScaledVector(up, -east.dot(up)).normalize();
  if (Math.abs(lat) > 89.9) east.set(1, 0, 0).addScaledVector(up, -up.x).normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  return { up, east, north };
}

export const fmtLat = (v) => `${Math.abs(v).toFixed(3)}°${v < 0 ? 'S' : 'N'}`;
export const fmtLon = (v) => { const w = ((v + 540) % 360) - 180; return `${Math.abs(w).toFixed(3)}°${w < 0 ? 'W' : 'E'}`; };

/** Direction (unit, globe frame) from a surface site toward Earth. Earth sits ~384,400 km away on the lat0/lon0 axis (mean position, libration ignored). */
export function earthDirection(lat, lon) {
  const R = MOON_RADIUS_KM, D = 384400;
  const earth = latLonToVector3(0, 0, D);
  const site = latLonToVector3(lat, lon, R);
  return earth.sub(site).normalize();
}
