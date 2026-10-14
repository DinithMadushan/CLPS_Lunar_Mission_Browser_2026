import { setLayerVisible } from './markers.js';
const MAP = { 'show-apollo': 'apollo', 'show-shallow': 'shallow', 'show-deep': 'deep', 'show-impact': 'impact', 'show-clps': 'clps' };
export function initLayerControls() {
  for (const [id, layer] of Object.entries(MAP)) {
    const box = document.getElementById(id);
    if (box) box.addEventListener('change', (e) => setLayerVisible(layer, e.target.checked));
  }
}
