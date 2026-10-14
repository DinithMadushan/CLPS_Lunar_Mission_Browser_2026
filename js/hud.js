import { el, $ } from './ui.js';

let built = false, refs = {};
export function buildHud(handlers) {
  if (built) return refs; built = true;
  const hud = $('#hud');
  refs.info = el('div', { class: 'tl' });
  refs.banner = el('div', { class: 'banner' });
  refs.compass = el('canvas', { class: 'sun', width: 184, height: 184, 'aria-label': 'Sun direction indicator' });
  refs.buttons = el('div', { class: 'tr' },
    refs.lander = el('button', { class: 'btn', onclick: handlers.toLander, text: 'Return to lander (R)' }),
    refs.view = el('button', { class: 'btn', onclick: handlers.toggleView, text: 'View: first person (V)' }),
    refs.astro = el('button', { class: 'btn', onclick: handlers.toggleScale, text: 'Scale astronaut: off' }),
    refs.orbit = el('button', { class: 'btn primary', onclick: handlers.toOrbit, text: 'Return to orbit' }));
  refs.guide = el('div', { class: 'bl' }, el('div', {}, el('kbd', { text: 'W A S D' }), ' / ', el('kbd', { text: '← ↑ ↓ →' }), ' move  ·  ', el('kbd', { text: 'Shift' }), ' run  ·  ', el('kbd', { text: 'Space' }), ' jump'),
    el('div', {}, 'Mouse: look (click the view to capture the mouse, Esc to release)  ·  ', el('kbd', { text: 'R' }), ' lander  ·  ', el('kbd', { text: 'V' }), ' view'));
  refs.center = el('div', { class: 'center' }, refs.skip = el('button', { class: 'btn', onclick: handlers.skip, text: 'Skip descent' }));
  hud.append(refs.info, refs.banner, refs.buttons, refs.guide, refs.compass, refs.center);
  refs.lock = el('div', { id: 'lockhint', class: 'banner' , text: 'Click the view to look around' }); refs.lock.style.cssText = 'display:none;top:auto;bottom:130px';
  hud.append(refs.lock);
  return refs;
}
export const hudShow = (v) => { $('#hud').hidden = !v; };
export function hudInfo(rows) {
  refs.info.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span', { class: 'muted', text: `${k}: ` }), el('b', { text: v }))));
}
let bt;
export function hudBanner(text, ms = 0) { refs.banner.textContent = text; refs.banner.classList.add('show'); clearTimeout(bt); if (ms) bt = setTimeout(() => refs.banner.classList.remove('show'), ms); }
export const hudBannerOff = () => refs.banner.classList.remove('show');
export function hudMode(phase) {   // which controls make sense in each phase
  refs.guide.style.display = phase === 'walk' ? '' : 'none';
  refs.center.style.display = phase === 'descent' ? '' : 'none';
  ['lander', 'view', 'astro'].forEach((k) => { refs[k].style.display = phase === 'walk' ? '' : 'none'; });
  refs.orbit.style.display = phase === 'approach' ? 'none' : '';
}
export function drawCompass(sunAz, sunEl, headingDeg, earthAz, earthEl) {
  const c = refs.compass, g = c.getContext('2d'), W = 184, cx = 92, R = 76;
  g.clearRect(0, 0, W, W); g.strokeStyle = 'rgba(150,190,255,.35)'; g.fillStyle = '#9fb3d1'; g.font = '14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.beginPath(); g.arc(cx, cx, R, 0, 6.2832); g.stroke(); g.beginPath(); g.arc(cx, cx, R * 0.5, 0, 6.2832); g.stroke();
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, a]) => { const r = (a - 90) * Math.PI / 180; g.fillText(t, cx + Math.cos(r) * (R + 0) * 0.86, cx + Math.sin(r) * R * 0.86); });
  const pt = (az, el) => { const r = (az - 90) * Math.PI / 180, d = R * (1 - Math.max(el, -15) / 90 * 0.9) * 0.62; return [cx + Math.cos(r) * Math.min(d, R - 6), cx + Math.sin(r) * Math.min(d, R - 6)]; };
  const hr = (headingDeg - 90) * Math.PI / 180; g.fillStyle = 'rgba(95,212,255,.25)'; g.beginPath(); g.moveTo(cx, cx); g.arc(cx, cx, R, hr - 0.55, hr + 0.55); g.closePath(); g.fill();
  if (earthEl != null && earthEl > 0) { const [ex, ey] = pt(earthAz, earthEl); g.fillStyle = '#4f9bff'; g.beginPath(); g.arc(ex, ey, 5, 0, 6.2832); g.fill(); }
  const [sx, sy] = pt(sunAz, sunEl); g.fillStyle = sunEl > 0 ? '#ffd76a' : '#6b5a2c'; g.shadowColor = '#ffd76a'; g.shadowBlur = sunEl > 0 ? 12 : 0; g.beginPath(); g.arc(sx, sy, 7, 0, 6.2832); g.fill(); g.shadowBlur = 0;
}
