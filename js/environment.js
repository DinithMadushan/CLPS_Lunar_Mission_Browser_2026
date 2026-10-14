import { el, $, toast } from './ui.js';
import { env, ENV_DEFAULT, applyEnv, world } from './surfaceWorld.js';
import { sunLight } from './scene.js';
import { state, emit, on } from './state.js';

/* Mode A values are quoted from NASA references and kept qualitative where no sourced number is available. */
const FACTS = [
  ['Atmosphere', 'Essentially airless: only an extremely thin exosphere. No clouds, rain, wind or atmospheric lightning.', 'NASA Moon facts', false],
  ['Surface temperature', 'About 127 °C in direct sunlight to about −173 °C at night (equatorial regions).', 'NASA Moon facts', true],
  ['Permanently shadowed craters', 'Can fall to roughly −248 °C (about 25 K) at the poles.', 'NASA / LRO Diviner', true],
  ['Day / night', 'One day-night cycle is about 29.5 Earth days: roughly two weeks of sunlight, then two weeks of darkness (away from the poles).', 'NASA', true],
  ['Solar illumination', 'Sunlight arrives at about 1,361 W/m² (the solar constant at Earth’s distance), scaled by the cosine of the Sun’s zenith angle on level ground. Shown live in the surface HUD as a geometric estimate.', 'NASA (solar constant)', false],
  ['Gravity', '1.62 m/s² (about 16.5% of Earth).', 'NASA Moon facts', false],
  ['Radiation', 'Higher than on Earth’s surface: no thick atmosphere and no global magnetic field. No numerical dose is shown because it depends on location and solar activity.', 'NASA (qualitative)', true],
  ['Dust & micrometeoroids', 'Lunar dust is sharp, abrasive and clings to equipment (reported by Apollo crews); micrometeoroid impacts are a standing hazard.', 'NASA (qualitative)', false]
];

const SLIDERS = [
  ['Illumination', [['sunElevation', 'Sun elevation (day ↔ night)', -40, 90, 1, (v) => `${v}°`], ['sunAzimuth', 'Sun azimuth', 0, 359, 1, (v) => `${v}°`], ['lunarDay', 'Lunar day progress (simplified)', 0, 100, 1, (v) => `${v}%`], ['sunlight', 'Sunlight intensity', 0, 2, 0.05, (v) => `×${(+v).toFixed(2)}`], ['brightness', 'Surface brightness (exposure)', 0.3, 3, 0.05, (v) => `×${(+v).toFixed(2)}`], ['shadow', 'Shadow intensity (low = more fill light)', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`], ['stars', 'Background star brightness', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`]]],
  ['Visual effects', [['dust', 'Simulated dust activity', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`], ['density', 'Particle density', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`]]],
  ['HYPOTHETICAL atmosphere (fictional, not lunar weather)', [['atmosphere', 'Artificial atmosphere density', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`], ['wind', 'Fictional wind', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`]]]
];
const TOGGLES = [['meteors', 'Micrometeorite impact flashes (illustrative visual)'], ['headlamp', 'Astronaut headlamp'], ['lightning', 'Fictional lightning (requires hypothetical atmosphere)']];
const PRESETS = {
  'Sunlit lunar surface': { sunElevation: 30, sunAzimuth: 120, sunlight: 1, brightness: 1, shadow: 0.85, stars: 0.25, dust: 0, atmosphere: 0, wind: 0, meteors: false, headlamp: false, lightning: false },
  'Permanently shadowed crater': { sunElevation: -4, sunAzimuth: 120, sunlight: 1, brightness: 2.4, shadow: 0.98, stars: 1, dust: 0, atmosphere: 0, wind: 0, meteors: false, headlamp: true, lightning: false },
  'Lunar night': { sunElevation: -35, sunAzimuth: 270, sunlight: 1, brightness: 2.0, shadow: 0.97, stars: 1, dust: 0, atmosphere: 0, wind: 0, meteors: false, headlamp: false, lightning: false },
  'Dust simulation': { sunElevation: 15, sunAzimuth: 100, sunlight: 1.2, brightness: 1, shadow: 0.85, stars: 0.2, dust: 0.9, density: 0.8, atmosphere: 0, wind: 0, meteors: true, headlamp: false, lightning: false },
  'Experimental atmosphere': { sunElevation: 35, sunAzimuth: 150, sunlight: 1, brightness: 1, shadow: 0.6, stars: 0.5, dust: 0.4, atmosphere: 0.6, wind: 0.5, meteors: false, headlamp: false, lightning: true }
};
const controlEls = {};
let lunarDay = 8;   // slider value, UI-only helper that sets sunElevation/azimuth

export function init() {
  const root = $('#panel-env'); root.replaceChildren();
  root.append(
    el('h4', { text: 'Mode A — Scientifically informed lunar environment' }),
    ...FACTS.map(([k, v, src, loc]) => el('div', { class: 'mcard', style: 'cursor:default' }, el('div', { class: 'row between' }, el('b', { text: k }), loc ? el('span', { class: 'chip', text: 'location-dependent' }) : null), el('div', { class: 'small', text: v }), el('div', { class: 'small muted', text: `Source: ${src}` }))),
    el('h4', { text: 'Mode B — Experimental visualisation' }),
    el('div', { class: 'sim-banner', id: 'env-banner', text: 'These controls change the 3D scene for exploration and demonstration. Anything labelled hypothetical or fictional is NOT actual lunar weather.' }),
    el('div', { id: 'env-gate' }),
    el('div', { class: 'row' }, ...Object.keys(PRESETS).map((n) => el('button', { class: 'btn small', onclick: () => applyPreset(n), text: n }))),
    el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { applyPreset(null); }, text: 'Reset to reference state' })),
    el('h4', { text: 'Orbital view' }),
    sliderRow('orbitSun', 'Sun direction around the Moon (orbital view)', -180, 180, 1, (v) => `${v}°`, 40, (v) => { const a = v * Math.PI / 180; sunLight.position.set(Math.sin(a) * -6, 3, Math.cos(a) * -6); }));
  SLIDERS.forEach(([title, list]) => { root.append(el('h4', { text: title })); list.forEach((s) => root.append(sliderRow(...s))); });
  root.append(el('h4', { text: 'Toggles' }), ...TOGGLES.map(([k, label]) => el('label', { class: 'row small', style: 'margin:6px 0' }, controlEls[k] = el('input', { type: 'checkbox', checked: env[k], onchange: (e) => { env[k] = e.target.checked; applyEnv(); } }), ` ${label}`)));
  root.append(el('p', { class: 'note', text: 'Earthshine is enhanced for visibility in the night preset. Micrometeoroid flashes are illustrative: real impacts are too small and fast to look like this.' }));
  refreshGate(); on('mode', refreshGate); on('panel-opened', refreshGate);
}

function sliderRow(key, label, min, max, step, fmt, initial, custom) {
  const val = initial ?? (key === 'lunarDay' ? lunarDay : env[key]);
  const out = el('output', { text: fmt(val) });
  const input = el('input', { type: 'range', min, max, step, value: val, 'aria-label': label, oninput: (e) => {
    const v = +e.target.value; out.textContent = fmt(v);
    if (custom) return custom(v);
    if (key === 'lunarDay') { lunarDay = v; setLunarDay(v / 100); return; }
    env[key] = v; applyEnv(); syncUI();
  } });
  controlEls[key] = { input, out, fmt };
  return el('div', { class: 'lab-row' }, el('span', { text: label }), out, input);
}
function setLunarDay(p) {   // sun on the equatorial plane: elevation = asin(cos(lat) sin(2 pi p)); sunrise in the east
  const lat = (world.built ? world.site.lat : 0) * Math.PI / 180, sign = lat >= 0 ? 1 : -1;
  env.sunElevation = Math.round(Math.asin(Math.cos(lat) * Math.sin(2 * Math.PI * p)) * 180 / Math.PI);
  env.sunAzimuth = ((Math.round(90 + sign * 360 * p) % 360) + 360) % 360; applyEnv(); syncUI();
}
function syncUI() {
  for (const [, list] of SLIDERS) for (const [k, , , , , fmt] of list) { const c = controlEls[k]; if (c?.input) { c.input.value = env[k]; c.out.textContent = fmt(env[k]); } }
  for (const [k] of TOGGLES) if (controlEls[k]) controlEls[k].checked = env[k];
}
function applyPreset(name) {
  Object.assign(env, ENV_DEFAULT, name ? PRESETS[name] : {}); if (name && PRESETS[name].density == null) env.density = ENV_DEFAULT.density;
  applyEnv(); syncUI(); toast(name ? `Preset: ${name}` : 'Reference state restored');
}
function refreshGate() {
  const g = $('#env-gate'); if (!g) return;
  const on_ = state.mode === 'surface' || state.mode === 'landing';
  g.replaceChildren(on_ ? el('p', { class: 'note', text: `Live: these controls are changing the surface scene${world.built ? ` at ${world.site.name}` : ''}.` })
    : el('div', { class: 'statebox' }, el('span', { text: 'Surface effects (sun, shadows, dust, atmosphere) need a surface scene. Settings made now are applied when you land.' }), el('button', { class: 'btn small primary', onclick: () => emit('open-panel', 'surface'), text: 'Open Surface Explorer' })));
}
