import { el, $ } from './ui.js';
import { state, emit, REAL_MOON_G, EARTH_G } from './state.js';

/* Kinematics (SI units). Drop: downward positive, u = 0:  s = u t + 1/2 g t^2  ->  t = sqrt(2h/g), v = g t.
   Jump: upward positive, launch speed v0:  y(t) = v0 t - 1/2 g t^2  ->  peak = v0^2/(2g), air time = 2 v0 / g. */
export const fallTime = (h, g) => Math.sqrt((2 * h) / g);
export const dropDistance = (t, g) => 0.5 * g * t * t;
export const jumpHeightAt = (v0, g, t) => v0 * t - 0.5 * g * t * t;
export const jumpPeak = (v0, g) => (v0 * v0) / (2 * g);
export const airTime = (v0, g) => (2 * v0) / g;

const PRESETS = [['Moon', REAL_MOON_G], ['Mars', 3.71], ['Earth', EARTH_G], ['Jupiter', 24.79]];
let canvas, ctx, exp = 'drop', t0 = null, raf = 0, params = { h: 10, v0: 3.0 };

const cols = () => [['Earth', EARTH_G, '#4f9bff'], ['Moon', REAL_MOON_G, '#cfd6e4'], [state.gravityIsHypothetical ? 'Selected (hypothetical)' : 'Selected', state.gravity, '#ffb454']];

export function init() {
  const root = $('#panel-gravity');
  const out = el('output', { id: 'g-out' }), pct = el('span', { id: 'g-pct', class: 'muted small' }), tag = el('div', { id: 'g-tag', class: 'sim-banner' });
  const slider = el('input', { type: 'range', id: 'g-slider', min: 0.5, max: 30, step: 0.01, value: state.gravity, 'aria-label': 'Gravity strength', oninput: (e) => setG(+e.target.value) });
  const bar = el('div', { id: 'g-bar', style: 'height:10px;border-radius:6px;background:#14203a;overflow:hidden' }, el('i', { id: 'g-fill', style: 'display:block;height:100%;background:linear-gradient(90deg,#5fd4ff,#ffb454);width:0' }));
  canvas = el('canvas', { class: 'lab', width: 340, height: 300 }); ctx = canvas.getContext('2d');
  root.replaceChildren(
    el('p', { class: 'muted small', text: 'Real reference values: Earth surface gravity ≈ 9.81 m/s²; Moon ≈ 1.62 m/s² (about 16.5% of Earth).' }),
    el('div', { class: 'lab-row' }, el('span', { text: 'Live gravity indicator' }), out, bar, pct),
    el('div', { class: 'lab-row' }, el('span', { text: 'Gravity strength (educational slider)' }), slider),
    el('div', { class: 'row' }, PRESETS.map(([n, g]) => el('button', { class: 'btn small', onclick: () => setG(g), text: `${n} ${g}` }))),
    tag,
    el('label', { class: 'row small' }, el('input', { type: 'checkbox', id: 'g-apply', checked: state.applyGravityToSurface, onchange: (e) => { state.applyGravityToSurface = e.target.checked; render(); } }), ' Apply selected gravity to the surface explorer (jumping, falling dust)'),
    el('h4', { text: 'Experiment' }),
    el('div', { class: 'row' },
      el('button', { class: 'btn small primary', id: 'x-drop', onclick: () => run('drop'), text: 'Object drop' }), el('button', { class: 'btn small', id: 'x-jump', onclick: () => run('jump'), text: 'Astronaut jump' }), el('button', { class: 'btn small', onclick: reset, text: 'Reset' })),
    el('div', { class: 'lab-row' }, el('span', { text: 'Drop height' }), el('output', { id: 'h-out' }), el('input', { type: 'range', min: 1, max: 50, step: 1, value: params.h, oninput: (e) => { params.h = +e.target.value; render(); } })),
    el('div', { class: 'lab-row' }, el('span', { text: 'Jump launch speed' }), el('output', { id: 'v-out' }), el('input', { type: 'range', min: 1, max: 8, step: 0.1, value: params.v0, oninput: (e) => { params.v0 = +e.target.value; render(); } })),
    canvas, el('div', { id: 'g-table' }),
    el('p', { class: 'note', text: 'Changing the slider only changes this simulation. It does not change the real Moon’s gravitational field. Equations: s = ut + ½gt², peak = v²/2g.' }));
  render();
}

function setG(g) {
  state.gravity = +g.toFixed(2); state.gravityIsHypothetical = Math.abs(g - REAL_MOON_G) > 0.005; $('#g-slider').value = state.gravity; emit('gravity-changed'); t0 = null; render();
}
function reset() { params = { h: 10, v0: 3.0 }; state.applyGravityToSurface = true; $('#g-apply').checked = true; setG(REAL_MOON_G); cancelAnimationFrame(raf); t0 = null; init(); }

function run(kind) { exp = kind; t0 = performance.now(); cancelAnimationFrame(raf); loop(); }
function loop() {
  render(); const dur = totalTime() * 1000 + 800;
  if (t0 != null && performance.now() - t0 < dur) raf = requestAnimationFrame(loop);
}
const totalTime = () => (exp === 'drop' ? Math.max(...cols().map(([, g]) => fallTime(params.h, g))) : Math.max(...cols().map(([, g]) => airTime(params.v0, g))));

function render() {
  const g = state.gravity, hyp = state.gravityIsHypothetical;
  $('#g-out').textContent = `${g.toFixed(2)} m/s²`; $('#g-pct').textContent = `${((g / EARTH_G) * 100).toFixed(1)}% of Earth surface gravity (9.81 m/s²)`;
  $('#g-fill').style.width = `${Math.min(100, (g / 30) * 100)}%`; $('#h-out').textContent = `${params.h} m`; $('#v-out').textContent = `${params.v0.toFixed(1)} m/s`;
  const tag = $('#g-tag'); tag.textContent = hyp ? 'HYPOTHETICAL gravity — the real Moon’s surface gravity is 1.62 m/s² and is not affected by this slider.' : 'Using the real lunar surface gravity (1.62 m/s²).'; tag.style.borderColor = hyp ? '' : 'rgba(95,212,255,.4)'; tag.style.color = hyp ? '' : 'var(--cyan)'; tag.style.background = hyp ? '' : 'rgba(95,212,255,.08)';
  const C = cols(), W = canvas.width, H = canvas.height, ground = H - 26, el_ = t0 == null ? 0 : (performance.now() - t0) / 1000;
  ctx.clearRect(0, 0, W, H); ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  const peakMax = Math.max(...C.map(([, gg]) => jumpPeak(params.v0, gg))), scale = (ground - 28) / (exp === 'drop' ? params.h : peakMax * 1.05);
  C.forEach(([name, gg, color], i) => {
    const x = (i + 0.5) * (W / 3); ctx.strokeStyle = 'rgba(150,190,255,.25)'; ctx.beginPath(); ctx.moveTo(x - 38, ground); ctx.lineTo(x + 38, ground); ctx.stroke();
    ctx.fillStyle = '#9fb3d1'; ctx.fillText(name.length > 14 ? 'Selected*' : name, x, H - 8); ctx.fillText(`${gg.toFixed(2)} m/s²`, x, 14);
    if (exp === 'drop') {
      const tf = fallTime(params.h, gg), tt = Math.min(el_, tf), s = dropDistance(tt, gg), y = ground - 8 - (params.h - s) * scale;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.fill();
      if (t0 != null && el_ >= tf) { ctx.fillStyle = '#e6edf7'; ctx.fillText(`t = ${tf.toFixed(2)} s`, x, ground - 30); }
    } else {
      const T = airTime(params.v0, gg), tt = t0 == null ? 0 : (el_ % (T + 0.5)), up = tt < T ? jumpHeightAt(params.v0, gg, tt) : 0, y = ground - 40 - up * scale + 0;
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 22, 6, 0, 6.2832); ctx.moveTo(x, y - 16); ctx.lineTo(x, y + 2); const sw = up > 0.01 ? 10 : 6; ctx.moveTo(x, y + 2); ctx.lineTo(x - sw, y + 20); ctx.moveTo(x, y + 2); ctx.lineTo(x + sw, y + 20); ctx.moveTo(x - 9, y - 8); ctx.lineTo(x + 9, up > 0.01 ? y - 18 : y - 4); ctx.stroke(); ctx.lineWidth = 1;
    }
  });
  const rows = C.map(([n, gg]) => exp === 'drop'
    ? `<tr><td>${n.replace(/</g, '')}</td><td>${fallTime(params.h, gg).toFixed(2)} s</td><td>${(gg * fallTime(params.h, gg)).toFixed(2)} m/s</td></tr>`
    : `<tr><td>${n.replace(/</g, '')}</td><td>${jumpPeak(params.v0, gg).toFixed(2)} m</td><td>${airTime(params.v0, gg).toFixed(2)} s</td></tr>`).join('');
  $('#g-table').innerHTML = `<table><thead><tr><th>Gravity</th><th>${exp === 'drop' ? `Fall time (${params.h} m)` : 'Jump height'}</th><th>${exp === 'drop' ? 'Impact speed' : 'Air time'}</th></tr></thead><tbody>${rows}</tbody></table>${hyp ? '<p class="note">* Selected value is hypothetical.</p>' : ''}`;
}
