async function getJSON(url) {
  let res;
  try { res = await fetch(url); } catch (e) { throw new Error(`Network error reaching ${url}. Is the backend running?`); }
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json()).detail; } catch { /* non-JSON error body */ }
    throw new Error(`${url} returned ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}
const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== '' && v != null) p.set(k, v); const s = p.toString(); return s ? `?${s}` : ''; };

export const fetchLandingSites = () => getJSON('/api/landing-sites');
export const fetchMoonquakes = () => getJSON('/api/moonquakes');
export const fetchMissions = (f) => getJSON('/api/missions' + qs(f));
export const fetchMissionMeta = () => getJSON('/api/missions/meta');
export const fetchStatistics = (f) => getJSON('/api/statistics' + qs(f));
export const fetchBodies = () => getJSON('/api/solar-system/bodies');
export const fetchMission = (id) => getJSON(`/api/missions/${encodeURIComponent(id)}`);
