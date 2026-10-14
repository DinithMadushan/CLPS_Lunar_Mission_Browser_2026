import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { orbitScene } from './scene.js';

export const moon = { group: null, radius: 1.59, usingFallback: false };

export function loadMoon(onProgress) {
  return new Promise((resolve) => {
    new GLTFLoader().load('./models/moon.glb', (gltf) => {
      const mesh = gltf.scene;
      mesh.scale.setScalar(1.25);
      orbitScene.add(mesh);
      const size = new THREE.Vector3(); new THREE.Box3().setFromObject(mesh).getSize(size);
      moon.group = mesh; moon.radius = Math.min(size.x, size.y, size.z) / 2;
      resolve(moon);
    }, (e) => e.total && onProgress?.(e.loaded / e.total), (err) => {
      // Model-loading failure: show a plain sphere so markers and the rest of the app still work.
      console.error('Error loading Moon GLB:', err);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.59, 96, 96), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 1 }));
      orbitScene.add(mesh);
      moon.group = mesh; moon.usingFallback = true;
      resolve(moon);
    });
  });
}
