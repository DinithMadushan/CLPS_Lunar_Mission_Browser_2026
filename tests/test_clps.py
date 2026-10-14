"""Run: python -m unittest discover -s tests -v"""
import json, sys, unittest
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import clps

BASE = {"id": "x", "name": "X", "provider": "P", "payloads": []}
def rec(**kw): return {**BASE, "launch_actual": None, "landing_actual": None, "ops_end_documented": False, "lifecycle": "planned", "outcome": "pending", **kw}

class Status(unittest.TestCase):
    def test_planned_is_planned(self): self.assertEqual(clps.derive_status(rec())["status"], "planned")
    def test_landed_is_not_completed(self):
        r = rec(lifecycle="landed", launch_actual="2025-01-01T00:00:00Z", landing_actual="2025-01-10T00:00:00Z")
        self.assertEqual(clps.derive_status(r)["status"], "landed")
    def test_completed_requires_documented_end_of_ops(self):
        r = rec(lifecycle="completed", outcome="success", launch_actual="2025-01-01T00:00:00Z", landing_actual="2025-01-10T00:00:00Z")
        s = clps.derive_status(r); self.assertEqual(s["status"], "unknown"); self.assertTrue(s["status_warnings"])
        r["ops_end_documented"] = True; self.assertEqual(clps.derive_status(r)["status"], "completed")
    def test_planned_with_actual_timestamp_is_flagged(self):
        self.assertEqual(clps.derive_status(rec(launch_actual="2025-01-01T00:00:00Z"))["status"], "unknown")
    def test_landing_before_launch_is_flagged(self):
        r = rec(lifecycle="landed", launch_actual="2025-02-01T00:00:00Z", landing_actual="2025-01-01T00:00:00Z")
        self.assertEqual(clps.derive_status(r)["status"], "unknown")
    def test_failure_without_landing_is_failed(self):
        r = rec(lifecycle="launched", outcome="failure", launch_actual="2024-01-08T07:18:00Z")
        self.assertEqual(clps.derive_status(r)["status"], "failed")
    def test_partial(self):
        r = rec(lifecycle="completed", outcome="partial", ops_end_documented=True, launch_actual="2024-02-15T06:05:37Z", landing_actual="2024-02-22T23:23:53Z")
        self.assertEqual(clps.derive_status(r)["status"], "partially_successful")

class Duration(unittest.TestCase):
    def test_launch_to_landing(self):
        d = clps.compute_duration(rec(launch_actual="2024-02-15T06:05:37Z", landing_actual="2024-02-22T23:23:53Z"))
        self.assertEqual((d["kind"], d["days"], d["hours"]), ("launch_to_landing", 7, 17))
    def test_failed_launch_has_no_duration(self):
        d = clps.compute_duration(rec(lifecycle="launched", outcome="failure", launch_actual="2024-01-08T07:18:00Z"))
        self.assertEqual(d["kind"], "none")
    def test_in_flight_shows_elapsed(self):
        now = datetime(2025, 1, 3, 6, 0, tzinfo=timezone.utc)
        d = clps.compute_duration(rec(lifecycle="launched", launch_actual="2025-01-01T00:00:00Z"), now)
        self.assertEqual((d["kind"], d["days"], d["hours"]), ("elapsed_since_launch", 2, 6))
    def test_planned_has_no_duration(self): self.assertEqual(clps.compute_duration(rec(launch_target_text="NET 2027"))["kind"], "none")

class Stats(unittest.TestCase):
    def setUp(self):
        data = json.load(open(Path(__file__).parent.parent / "data" / "clps_missions.json"))["missions"]
        self.items = [clps.enrich(m) for m in data]
    def test_bundled_records_have_no_warnings(self):
        for m in self.items: self.assertEqual(m["status_warnings"], [], m["id"])
    def test_rates_exclude_planned_and_cancelled(self):
        s = clps.statistics(self.items)["rates"]
        self.assertEqual(s["attempts_with_known_outcome"], 4)       # Peregrine, IM-1, Blue Ghost 1, IM-2
        self.assertAlmostEqual(s["soft_landing_rate"], 0.75); self.assertAlmostEqual(s["full_success_rate"], 0.25)
    def test_empty_filter_gives_null_rates(self):
        s = clps.statistics([]); self.assertIsNone(s["rates"]["soft_landing_rate"]); self.assertEqual(s["total_missions"], 0)
    def test_unknown_payload_counts_not_summed_as_zero(self):
        s = clps.statistics(self.items); self.assertGreater(s["missions_unknown_payload_count"], 0)
    def test_filter_and_sort_put_missing_last(self):
        out = clps.sort_missions(self.items, "landing_date", True); self.assertIsNotNone(out[0]["landing_actual"]); self.assertIsNone(out[-1]["landing_actual"])
        self.assertEqual([m["id"] for m in clps.filter_missions(self.items, status="completed")], ["blue-ghost-1"])

if __name__ == "__main__": unittest.main()
