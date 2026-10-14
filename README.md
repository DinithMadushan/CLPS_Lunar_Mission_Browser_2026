# CLPS Lunar Mission Browser & Moon Explorer (Moonquake Map 2.0)

Interactive 3D Moon: Apollo/moonquake data, NASA CLPS missions, a simulated landing and surface walk,
gravity and environment labs, and a Solar System explorer.
Stack: Three.js (bundled locally in `vendor/`), FastAPI, optional Supabase.

## Run
```bash
pip install -r requirements.txt
cp .env.example .env          # optional: fill in SUPABASE_URL / SUPABASE_KEY (publishable key only)
uvicorn main:app --reload --port 8000
# open http://localhost:8000
```
Without Supabase credentials the backend serves the bundled data (`data/`, `cleaned_moonquakes_master.csv`)
and the UI shows a "bundled" chip so you always know the source.

## Database (optional)
1. Run `db/migrations/001_clps.sql` in the Supabase SQL editor (creates `clps_missions`, `clps_payloads`, read-only RLS policies).
2. Seed locally: `SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python scripts/seed_clps.py`
   (the service key is read from your shell only and is never used by the web server or the browser).
3. Existing `landing_sites` and `moonquakes` tables are unchanged.

**Credentials:** the original `.env.example` contained a real project URL and publishable key; it now holds placeholders.
If that file was ever public, confirm Row Level Security on every table and rotate the key in Supabase (Settings → API).

## API
`/api/landing-sites`, `/api/moonquakes?limit=&offset=`, `/api/missions` (filters: status, launch_year, landing_year, provider, region, category, q; sort, desc),
`/api/missions/meta`, `/api/missions/{id}`, `/api/missions/{id}/payloads`, `/api/statistics` (same filters), `/api/solar-system/bodies`, `/api/health`.
Errors: 400 invalid filter/sort, 404 unknown mission.

## Mission status rules (see `clps.py`)
Each record stores `lifecycle` (planned, launched, landed, completed, cancelled) and `outcome` (pending, success, partial, failure, none);
the displayed status is derived from both. Landing never implies completion: *completed* needs a landing, a documented end of surface
operations and a fully successful outcome. Planned dates are free text and never used as timestamps. Evidence violations yield
"unknown" with a warning. Duration = actual landing − actual launch (elapsed time only while in flight; none for failed launches).
`cancelled` is an addition to the requested states because a cancelled task order is neither failed nor planned.
Success rates: soft-landing and full-success rates use launched missions with a known landing outcome as the denominator; completion rate
uses all missions that are not planned/cancelled/unknown. Planned missions are never failures.

## Features
CLPS browser (cards/table, search, filters, sorting, detail panel, sources), statistics dashboard with filter-aware charts, moonquake map
(layers, FOCUS EVENT), click-to-land sequence (orbital approach → powered descent with plume and dust → touchdown → ground level),
walkable surface (WASD/arrows, mouse look with pointer lock or drag fallback, jump, run, third-person astronaut, return to lander/orbit),
Gravity Lab, Environment Lab (Mode A sourced facts / Mode B experimental controls and presets), Solar System explorer (Sun, 8 planets, Moon),
breadcrumb navigation, collapsible context panel.

## What is simulated (always labelled in the UI)
Surface terrain is procedural (seeded per site), not real topography. The lander is generic; the astronaut is a scale reference only
(CLPS missions are uncrewed). Earth's texture is stylised. Landing always shows a nominal touchdown regardless of the real outcome.
Atmosphere, wind and lightning are fictional demonstrations. Solar System layout uses compressed visualisation scales, not true distances.

## Data caveats
Landing coordinates and times for IM-1, Blue Ghost 1 and IM-2 were checked against NASA sources on 2026-10-12. Planned missions carry
target text only; coordinates for some are estimated region centres (hollow markers). Peregrine's launch time and a few payload names were
not re-fetched; payload lists for several missions are incomplete (`payloads_listed_complete=false`). Planetary values are static NASA
fact-sheet numbers not re-fetched. Moon model orientation: lon 0 faces −Z (`js/geo.js`).

## Tests
`python -m unittest discover -s tests -v` (status, duration, statistics rules). Browser behaviour was tested manually with headless Chromium
(software rendering); see the project summary for what was and was not verified.

## Not done / needs external assets
Real terrain tiles (LOLA/LROC DEMs) for true site topography; a real Earth texture; per-mission lander models; reviewed payload lists;
automated browser tests; pointer-lock behaviour on real hardware; performance tuning on low-end GPUs; Supabase run against a live project.

## Credits
Three.js (MIT, `vendor/three/LICENSE`). Moon model: `models/moon.glb` (original project asset). `models/space_1999_1975.glb` is unused;
if you use it, attribute its CC-BY author.
