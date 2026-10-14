"""Moonquake Map 2.0 / CLPS Lunar Mission Browser - FastAPI backend.

Data sources, in order:
  1. Supabase (tables: landing_sites, moonquakes, clps_missions, clps_payloads) using the
     PUBLISHABLE/anon key only. Privileged keys never belong in this process or in the browser.
  2. Bundled files in ./data and ./cleaned_moonquakes_master.csv, used when Supabase is not
     configured or the table does not exist. Every response says which source was used.
"""
import csv
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import clps

load_dotenv()
BASE = Path(__file__).parent
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()

supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as exc:  # bad URL/key or missing package: run on bundled data
        print(f"[warn] Supabase disabled: {exc}")
else:
    print("[warn] SUPABASE_URL/SUPABASE_KEY not set - serving bundled data only")

app = FastAPI(title="CLPS Lunar Mission Browser & Moon Explorer API", version="2.0.0",
              description="Moonquake data, CLPS missions, statistics and Solar System reference data.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["GET"], allow_headers=["*"])

_cache: Dict[str, Any] = {}
TTL = 300


def cached(key: str, loader):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < TTL:
        return hit[1]
    value = loader()
    _cache[key] = (time.time(), value)
    return value


def load_json(name: str):
    with open(BASE / "data" / name, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- models
class LandingSite(BaseModel):
    mission: str
    latitude: float
    longitude: float
    instrument: Optional[str] = None


class Moonquake(BaseModel):
    event_timestamp: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    magnitude: Optional[float] = None
    depth_km: Optional[float] = None
    event_type: Optional[str] = "Unknown"


# ---------------------------------------------------------------- Apollo + moonquakes (existing API, preserved)
@app.get("/api/landing-sites", response_model=List[LandingSite])
def get_landing_sites():
    if supabase:
        try:
            return supabase.table("landing_sites").select("mission, latitude, longitude, instrument").execute().data
        except Exception as exc:
            print(f"[warn] landing_sites from Supabase failed, using bundled: {exc}")
    return load_json("apollo_sites.json")


def _csv_quakes() -> List[dict]:
    def num(v):
        return float(v) if v not in (None, "") else None
    with open(BASE / "cleaned_moonquakes_master.csv", encoding="utf-8", newline="") as f:
        return [{"event_timestamp": r["event_timestamp"] or None, "latitude": num(r["latitude"]),
                 "longitude": num(r["longitude"]), "magnitude": num(r["magnitude"]),
                 "depth_km": num(r["depth_km"]), "event_type": r["event_type"] or "Unknown"}
                for r in csv.DictReader(f)]


@app.get("/api/moonquakes", response_model=List[Moonquake])
def get_moonquakes(limit: Optional[int] = Query(None, ge=1, le=5000), offset: int = Query(0, ge=0)):
    def load():
        if supabase:
            try:
                return supabase.table("moonquakes").select(
                    "event_timestamp, latitude, longitude, magnitude, depth_km, event_type").execute().data
            except Exception as exc:
                print(f"[warn] moonquakes from Supabase failed, using bundled CSV: {exc}")
        return _csv_quakes()
    rows = cached("moonquakes", load)
    return rows[offset:offset + limit] if limit else rows[offset:]


# ---------------------------------------------------------------- CLPS missions
def _missions_raw():
    def load():
        if supabase:
            try:
                ms = supabase.table("clps_missions").select("*").execute().data
                if ms:
                    ps = supabase.table("clps_payloads").select("*").execute().data or []
                    for m in ms:
                        m["payloads"] = [p for p in ps if p.get("mission_id") == m["id"]]
                    return ms, "supabase"
            except Exception as exc:
                print(f"[warn] clps tables unavailable ({exc}); using bundled dataset")
        return load_json("clps_missions.json")["missions"], "bundled"
    return cached("clps_raw", load)


def _enriched():
    raw, source = _missions_raw()
    return [clps.enrich(m) for m in raw], source


def _filters(status, launch_year, landing_year, provider, region, category, q):
    if status and status not in clps.STATUSES:
        raise HTTPException(400, f"Unknown status '{status}'. Valid: {', '.join(clps.STATUSES)}")
    return dict(status=status, launch_year=launch_year, landing_year=landing_year,
                provider=provider, region=region, category=category, q=q)


@app.get("/api/missions")
def list_missions(status: Optional[str] = None, launch_year: Optional[int] = None,
                  landing_year: Optional[int] = None, provider: Optional[str] = None,
                  region: Optional[str] = None, category: Optional[str] = None, q: Optional[str] = None,
                  sort: str = "launch_date", desc: bool = False):
    if sort not in clps.SORT_KEYS:
        raise HTTPException(400, f"Unknown sort '{sort}'. Valid: {', '.join(clps.SORT_KEYS)}")
    items, source = _enriched()
    items = clps.filter_missions(items, **_filters(status, launch_year, landing_year, provider, region, category, q))
    items = clps.sort_missions(items, sort, desc)
    return {"source": source, "count": len(items), "items": items}


@app.get("/api/missions/meta")
def mission_meta():
    items, source = _enriched()
    return {"source": source, "statuses": clps.STATUSES,
            "providers": sorted({m["provider"] for m in items if m.get("provider")}),
            "regions": sorted({m["landing_region"] for m in items if m.get("landing_region")}),
            "categories": sorted({c for m in items for c in m["payload_categories"]}),
            "launch_years": sorted({m["launch_year"] for m in items if m["launch_year"]}),
            "landing_years": sorted({m["landing_year"] for m in items if m["landing_year"]})}


def _get_mission(mission_id: str):
    items, source = _enriched()
    for m in items:
        if m["id"] == mission_id:
            return m, source
    raise HTTPException(404, f"Mission '{mission_id}' not found")


@app.get("/api/missions/{mission_id}")
def get_mission(mission_id: str):
    m, source = _get_mission(mission_id)
    return {"source": source, "mission": m}


@app.get("/api/missions/{mission_id}/payloads")
def get_payloads(mission_id: str):
    m, source = _get_mission(mission_id)
    return {"source": source, "mission_id": mission_id, "payload_count": m.get("payload_count"),
            "payload_scope": m.get("payload_scope"), "listed_complete": m.get("payloads_listed_complete"),
            "payloads": m.get("payloads", [])}


@app.get("/api/statistics")
def get_statistics(status: Optional[str] = None, launch_year: Optional[int] = None,
                   landing_year: Optional[int] = None, provider: Optional[str] = None,
                   region: Optional[str] = None, category: Optional[str] = None, q: Optional[str] = None):
    items, source = _enriched()
    items = clps.filter_missions(items, **_filters(status, launch_year, landing_year, provider, region, category, q))
    return {"source": source, "statistics": clps.statistics(items)}


# ---------------------------------------------------------------- Solar System
@app.get("/api/solar-system/bodies")
def solar_bodies():
    return cached("solar", lambda: load_json("solar_system.json"))


@app.get("/api/health")
def health():
    return {"status": "ok", "supabase_configured": supabase is not None}


# ---------------------------------------------------------------- static frontend
for mount in ("models", "js", "css", "vendor", "data"):
    if (BASE / mount).is_dir() and mount != "data":
        app.mount(f"/{mount}", StaticFiles(directory=BASE / mount), name=mount)


@app.get("/")
def serve_frontend():
    return FileResponse(BASE / "index.html")
