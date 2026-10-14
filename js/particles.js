import * as THREE from 'three';
import { camera, renderer } from './scene.js';

/** Fixed-size GPU point pool with ballistic motion (vacuum: no drag unless `drag` > 0). Reused, never reallocated. */
export class ParticlePool {
  constructor(max, { size = 0.15, color = 0xb7ad9f, opacity = 0.8 } = {}) {
    this.max = max; this.next = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1); this.life = new Float32Array(max).fill(1); this.alpha = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSize: { value: size }, uScale: { value: 600 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: 'attribute float aAlpha; varying float vA; uniform float uSize; uniform float uScale; void main(){ vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=max(1.0,uSize*uScale/-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vA; uniform vec3 uColor; uniform float uOpacity; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(uColor, vA*uOpacity*smoothstep(0.5,0.1,d)); }'
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    this.drag = 0; this.wind = new THREE.Vector3(); this.active = 0;
  }
  emit(x, y, z, vx, vy, vz, life) {
    const i = this.next; this.next = (this.next + 1) % this.max; const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z; this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.age[i] = 0; this.life[i] = life;
  }
  update(dt, g, groundAt) {
    this.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    let active = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= 1) { this.alpha[i] = 0; continue; }
      const k = i * 3; active++;
      this.age[i] += dt / this.life[i];
      if (this.drag > 0) { const f = Math.exp(-this.drag * dt); this.vel[k] += (this.wind.x - this.vel[k]) * (1 - f); this.vel[k + 2] += (this.wind.z - this.vel[k + 2]) * (1 - f); }
      this.vel[k + 1] -= g * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const gh = groundAt(this.pos[k], this.pos[k + 2]) + 0.03;
      if (this.pos[k + 1] < gh) { this.pos[k + 1] = gh; this.vel[k] = this.vel[k + 2] = this.vel[k + 1] = 0; }
      this.alpha[i] = Math.min(1, (1 - this.age[i]) * 1.6);
    }
    this.active = active;
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }
  clear() { this.age.fill(1); this.alpha.fill(0); }
}
