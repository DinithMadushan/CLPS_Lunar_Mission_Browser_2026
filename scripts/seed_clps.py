"""Load data/clps_missions.json into Supabase. Run LOCALLY with a privileged key:
    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python scripts/seed_clps.py
The service key is read from the shell environment only. Never put it in .env.example,
the frontend, or the web server process."""
import json, os, sys
from pathlib import Path
from supabase import create_client

url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
if not url or not key:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY in your shell (not in a committed file).")
db = create_client(url, key)
data = json.loads((Path(__file__).parent.parent / "data" / "clps_missions.json").read_text(encoding="utf-8"))
cols = ["id","name","provider","task_order","lander","launch_vehicle","launch_actual","landing_actual","ops_end_documented",
        "launch_target_text","landing_target_text","lifecycle","outcome","outcome_note","target_site_name","landing_region",
        "latitude","longitude","coordinate_kind","coordinate_note","payload_count","payload_scope","payloads_listed_complete",
        "source_url","source_label","last_checked","confidence"]
for m in data["missions"]:
    db.table("clps_missions").upsert({c: m.get(c) for c in cols}).execute()
    db.table("clps_payloads").delete().eq("mission_id", m["id"]).execute()
    if m.get("payloads"):
        db.table("clps_payloads").insert([{**p, "mission_id": m["id"]} for p in m["payloads"]]).execute()
print(f"Seeded {len(data['missions'])} missions")
