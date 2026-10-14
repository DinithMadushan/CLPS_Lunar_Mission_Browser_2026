"""CLPS mission logic: status derivation, duration, validation, statistics.

All functions are pure so they can be unit-tested without a database.

STATUS MODEL
------------
Each record stores a `lifecycle` (what has happened) and an `outcome` (how it went).
The user-facing `status` is DERIVED from both so a mission is never "completed"
merely because it landed:

  lifecycle     outcome            -> displayed status
  planned       pending            -> planned
  cancelled     none               -> cancelled
  launched      pending            -> launched          (in flight, no landing yet)
  launched      failure            -> failed            (launch happened, no landing)
  landed        pending            -> landed            (on surface, ops continuing)
  landed|completed  failure        -> failed
  landed|completed  partial        -> partially_successful
  completed     success            -> completed         (requires landing + documented end of ops)
  anything else / missing data     -> unknown

Allowed lifecycle transitions: planned -> launched -> landed -> completed,
planned -> cancelled, launched -> (failure: no landing). A record that violates
the evidence rules below gets status "unknown" plus a `status_warnings` entry.

Evidence rules: launched/landed/completed need `launch_actual`; landed/completed need
`landing_actual`; completed also needs `ops_end_documented`. Planned dates are free text
(`launch_target_text`) and are never used as timestamps.
"""
from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

STATUSES = ["planned", "launched", "landed", "completed", "failed", "partially_successful", "cancelled", "unknown"]
LIFECYCLES = {"planned", "launched", "landed", "completed", "cancelled"}
OUTCOMES = {"pending", "success", "partial", "failure", "none"}


def parse_ts(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def derive_status(rec: Dict[str, Any]) -> Dict[str, Any]:
    life, outcome = rec.get("lifecycle"), rec.get("outcome")
    warnings: List[str] = []
    launch, landing = parse_ts(rec.get("launch_actual")), parse_ts(rec.get("landing_actual"))
    if rec.get("launch_actual") and launch is None:
        warnings.append("launch_actual is not a valid ISO timestamp")
    if rec.get("landing_actual") and landing is None:
        warnings.append("landing_actual is not a valid ISO timestamp")
    if life not in LIFECYCLES or outcome not in OUTCOMES:
        return {"status": "unknown", "status_warnings": warnings + ["unrecognised lifecycle/outcome"]}
    if life in {"launched", "landed", "completed"} and not launch:
        warnings.append(f"lifecycle '{life}' requires a documented launch_actual")
    if life in {"landed", "completed"} and not landing:
        warnings.append(f"lifecycle '{life}' requires a documented landing_actual")
    if life == "completed" and not rec.get("ops_end_documented"):
        warnings.append("lifecycle 'completed' requires documented end of surface operations")
    if launch and landing and landing < launch:
        warnings.append("landing precedes launch")
    if life == "planned" and (launch or landing):
        warnings.append("planned mission carries an actual timestamp")
    if warnings:
        return {"status": "unknown", "status_warnings": warnings}

    if life == "cancelled":
        status = "cancelled"
    elif life == "planned":
        status = "planned"
    elif outcome == "failure":
        status = "failed"
    elif outcome == "partial":
        status = "partially_successful" if life in {"landed", "completed"} else "unknown"
    elif life == "launched":
        status = "launched"
    elif life == "landed":
        status = "landed"
    elif life == "completed" and outcome == "success":
        status = "completed"
    else:
        status = "unknown"
    if status == "unknown":
        warnings.append("lifecycle/outcome combination is not a defined state")
    return {"status": status, "status_warnings": warnings}


def compute_duration(rec: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    """Mission duration = landing timestamp - launch timestamp, using ACTUAL timestamps only."""
    now = now or datetime.now(timezone.utc)
    launch, landing = parse_ts(rec.get("launch_actual")), parse_ts(rec.get("landing_actual"))

    def pack(kind: str, delta, note: str) -> Dict[str, Any]:
        secs = int(delta.total_seconds())
        days, rem = divmod(secs, 86400)
        hours = rem // 3600
        return {"kind": kind, "seconds": secs, "days": days, "hours": hours, "text": f"{days} d {hours} h", "note": note}

    if launch and landing and landing >= launch:
        return pack("launch_to_landing", landing - launch, "Actual landing minus actual launch")
    if launch and not landing:
        if rec.get("lifecycle") == "launched" and rec.get("outcome") == "pending":
            return pack("elapsed_since_launch", now - launch, "In flight: elapsed since launch")
        return {"kind": "none", "seconds": None, "days": None, "hours": None, "text": None,
                "note": "No landing occurred, so no launch-to-landing duration exists"}
    return {"kind": "none", "seconds": None, "days": None, "hours": None, "text": None,
            "note": "No documented actual launch/landing timestamps"}


def enrich(rec: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    out = dict(rec)
    out.update(derive_status(rec))
    out["duration"] = compute_duration(rec, now)
    payloads = rec.get("payloads") or []
    out["payloads_listed"] = len(payloads)
    out["launch_year"] = (parse_ts(rec.get("launch_actual")) or datetime.min.replace(year=1)).year if rec.get("launch_actual") else None
    out["landing_year"] = parse_ts(rec["landing_actual"]).year if parse_ts(rec.get("landing_actual")) else None
    out["has_coordinates"] = rec.get("latitude") is not None and rec.get("longitude") is not None
    out["payload_categories"] = sorted({p.get("category") for p in payloads if p.get("category")})
    return out


def filter_missions(items: List[Dict[str, Any]], *, status=None, launch_year=None, landing_year=None,
                    provider=None, region=None, category=None, q=None) -> List[Dict[str, Any]]:
    def ok(m):
        if status and m["status"] != status: return False
        if launch_year and m["launch_year"] != launch_year: return False
        if landing_year and m["landing_year"] != landing_year: return False
        if provider and m.get("provider") != provider: return False
        if region and m.get("landing_region") != region: return False
        if category and category not in m["payload_categories"]: return False
        if q:
            hay = " ".join(str(m.get(k) or "") for k in ("name", "provider", "target_site_name", "lander", "task_order")).lower()
            hay += " " + " ".join(p["name"].lower() for p in m.get("payloads", []))
            if q.lower() not in hay: return False
        return True
    return [m for m in items if ok(m)]


SORT_KEYS = {
    "name": lambda m: m["name"].lower(),
    "launch_date": lambda m: m.get("launch_actual") or "",
    "landing_date": lambda m: m.get("landing_actual") or "",
    "duration": lambda m: m["duration"]["seconds"] if m["duration"]["seconds"] is not None else -1,
    "payload_count": lambda m: m.get("payload_count") if m.get("payload_count") is not None else -1,
}


def sort_missions(items, sort="launch_date", descending=False):
    # Records lacking the sort field always go last, regardless of direction.
    key = SORT_KEYS[sort]
    def missing(m):
        v = key(m)
        return v in ("", -1)
    present = sorted([m for m in items if not missing(m)], key=key, reverse=descending)
    return present + [m for m in items if missing(m)]


def statistics(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Summary statistics for an (already filtered) list of enriched missions.

    DEFINITIONS
      attempts           launched missions whose landing outcome is known (status in landed, completed,
                         failed, partially_successful). Planned, cancelled, in-flight and unknown
                         missions are EXCLUDED from every rate denominator.
      soft_landing_rate  missions with a documented landing_actual / attempts
      full_success_rate  missions with outcome 'success' / attempts (an upright, fully working landing)
      completion_rate    status 'completed' / (all missions that are not planned, cancelled or unknown)
    Rates are null when the denominator is 0.
    """
    by_status = Counter(m["status"] for m in items)
    attempts = [m for m in items if m["status"] in {"landed", "completed", "failed", "partially_successful"}]
    landed = [m for m in attempts if m.get("landing_actual")]
    full = [m for m in attempts if m.get("outcome") == "success"]
    rate_pool = [m for m in items if m["status"] not in {"planned", "cancelled", "unknown"}]

    def rate(n, d): return round(n / d, 4) if d else None

    cat = Counter()
    for m in items:
        for p in m.get("payloads", []):
            cat[p.get("category") or "Uncategorised"] += 1
    counted = [m for m in items if m.get("payload_count") is not None]
    return {
        "total_missions": len(items),
        "by_status": {s: by_status.get(s, 0) for s in STATUSES},
        "planned": by_status["planned"],
        "launched": sum(1 for m in items if m.get("launch_actual")),
        "landed": sum(1 for m in items if m.get("landing_actual")),
        "completed": by_status["completed"],
        "failed_or_partial": by_status["failed"] + by_status["partially_successful"],
        "payloads_documented": sum(m["payload_count"] for m in counted),
        "missions_with_known_payload_count": len(counted),
        "missions_unknown_payload_count": len(items) - len(counted),
        "payloads_named": sum(len(m.get("payloads", [])) for m in items),
        "by_launch_year": dict(sorted(Counter(str(m["launch_year"]) for m in items if m["launch_year"]).items())),
        "by_landing_year": dict(sorted(Counter(str(m["landing_year"]) for m in items if m["landing_year"]).items())),
        "payloads_by_category": dict(cat.most_common()),
        "by_outcome": dict(Counter(m.get("outcome") for m in items)),
        "by_landing_region": dict(Counter(m.get("landing_region") or "Unknown" for m in items)),
        "rates": {
            "attempts_with_known_outcome": len(attempts),
            "soft_landing_rate": rate(len(landed), len(attempts)),
            "full_success_rate": rate(len(full), len(attempts)),
            "completion_rate": rate(by_status["completed"], len(rate_pool)),
            "completion_denominator": len(rate_pool),
            "definitions": {
                "soft_landing_rate": "Missions with a documented landing / launched missions whose landing outcome is known. Planned, cancelled, in-flight and unknown missions are excluded.",
                "full_success_rate": "Missions with a fully successful outcome / the same denominator. Tipped-over or partly working landings do not count as full successes.",
                "completion_rate": "Missions with status 'completed' (landed AND documented end of surface operations AND fully successful) / all missions that are not planned, cancelled or unknown.",
            },
        },
    }
