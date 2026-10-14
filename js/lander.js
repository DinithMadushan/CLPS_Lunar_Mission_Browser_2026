import * as THREE from 'three';

/** Generic CLPS-style lander. Illustrative only: it is NOT a model of any specific mission's spacecraft. Origin = ground contact plane. */
export function buildLander() {
  const g = new THREE.Group(), std = (c, m = 0.6, r = 0.4) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 2.1, 6), std(0xcfd3d8, 0.5, 0.45)); body.position.y = 2.05;
  const foil = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.55, 6), std(0xc9a227, 0.9, 0.3)); foil.position.y = 1.05;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 1.9), std(0x2b3342, 0.3, 0.6)); deck.position.y = 3.17;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 1.5), std(0x16233f, 0.2, 0.3)); panel.position.set(0, 3.45, 0); panel.rotation.z = 0.12;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), std(0xaaaaaa)); mast.position.set(0.6, 3.8, 0.4);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 8, 0, 6.28, 0, 1.2), std(0xe8e8e8, 0.4, 0.3)); dish.position.set(0.6, 4.45, 0.4); dish.rotation.x = -0.5;
  const box1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), std(0x808890)); box1.position.set(-0.5, 3.4, -0.4);
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.75, 20, 1, true), std(0x222222, 0.8, 0.5)); bell.position.y = 0.62; bell.rotation.x = Math.PI; bell.material.side = THREE.DoubleSide;
  g.add(body, foil, deck, panel, mast, dish, box1, bell);
  const feet = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, top = new THREE.Vector3(Math.cos(a) * 0.85, 1.25, Math.sin(a) * 0.85), foot = new THREE.Vector3(Math.cos(a) * 2.1, 0.07, Math.sin(a) * 2.1);
    const dir = foot.clone().sub(top), len = dir.length();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 8), std(0xb8bcc2, 0.7, 0.4));
    leg.position.copy(top).add(foot).multiplyScalar(0.5); leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.1, 16), std(0x777c84)); pad.position.copy(foot); pad.position.y = 0.05;
    g.add(leg, pad); feet.push(pad);
  }
  // Engine plume (vacuum plume spreads wide and has no atmospheric shock structure; this is a stylised visual)
  const plumeMat = new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(1.3, 9, 24, 1, true), plumeMat);
  plume.position.y = 0.3 - 4.5; plume.rotation.x = Math.PI; plume.visible = false;
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.45, 5, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.y = 0.3 - 2.5; core.rotation.x = Math.PI; plume.add(core); core.position.set(0, 2, 0);
  const plumeLight = new THREE.PointLight(0xffa860, 0, 40, 1.4); plumeLight.position.y = -1.2;
  g.add(plume, plumeLight);
  g.traverse((o) => { if (o.isMesh && o !== plume && o !== core) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    group: g, feet, bodyParts: [body, foil, deck, panel],
    setThrottle(t) { plume.visible = t > 0.02; const f = 0.85 + Math.random() * 0.3; plume.scale.set(0.7 + t * 0.6, 0.3 + t * 0.7, 0.7 + t * 0.6); plumeMat.opacity = 0.55 * f; plumeLight.intensity = t * 90 * f; }
  };
}

/** Human-scale scale reference (~1.8 m). Visual only: CLPS missions were uncrewed. */
export function buildAstronaut() {
  const g = new THREE.Group(), suit = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 }), dark = new THREE.MeshStandardMaterial({ color: 0x444a55, roughness: 0.6 }), visor = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 1, roughness: 0.12 });
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  g.add(part(new THREE.BoxGeometry(0.5, 0.65, 0.3), suit, 0, 1.18, 0));
  g.add(part(new THREE.BoxGeometry(0.36, 0.5, 0.2), dark, 0, 1.22, -0.25));    // life-support backpack
  const head = part(new THREE.SphereGeometry(0.22, 20, 16), suit, 0, 1.72, 0); g.add(head);
  g.add(part(new THREE.SphereGeometry(0.18, 20, 14, 0, 6.28, 0, 2.2), visor, 0, 1.73, 0.08));
  const limb = (w, h, x, y, mat) => { const pivot = new THREE.Group(); pivot.position.set(x, y, 0); const m = new THREE.Mesh(new THREE.CylinderGeometry(w, w, h, 10), mat); m.position.y = -h / 2; m.castShadow = true; pivot.add(m); g.add(pivot); return pivot; };
  g.userData.legL = limb(0.1, 0.8, -0.13, 0.85, suit); g.userData.legR = limb(0.1, 0.8, 0.13, 0.85, suit);
  g.userData.armL = limb(0.075, 0.6, -0.33, 1.45, suit); g.userData.armR = limb(0.075, 0.6, 0.33, 1.45, suit);
  g.add(part(new THREE.BoxGeometry(0.14, 0.1, 0.28), dark, -0.13, 0.04, 0.04), part(new THREE.BoxGeometry(0.14, 0.1, 0.28), dark, 0.13, 0.04, 0.04));
  g.userData.walk = (phase, amount) => { const s = Math.sin(phase) * 0.7 * amount; g.userData.legL.rotation.x = s; g.userData.legR.rotation.x = -s; g.userData.armL.rotation.x = -s * 0.8; g.userData.armR.rotation.x = s * 0.8; };
  return g;
}
