"""
Role 3 - Seed dataset v2, matching Role 2's REAL backend schema
PS-17 Safe Route Mapping

WHY THIS FILE EXISTS (read this first):
  generate_seed_data.py (v1) was built against the project plan document,
  before Role 2's backend existed. Now that Role 2 has pushed real code
  (backend/scripts/loadSeed.js + backend/src/db/migrations/001_init.sql),
  it turns out their actual loader expects a different shape than the plan
  implied:
    - reports are grouped under "segments" (by index), not flat with their
      own lat/lng each
    - severity is 1-3, not 1-5
    - light_condition is "lit" | "unlit" | "unknown", not "dark"/"dim"/"well_lit"
    - each report needs an anonymized "reporter_hash", not a "report_id"
    - there is NO "incident_type" field anywhere in their schema - the DB
      only stores severity + light_condition + a free-text note

  This script regenerates seed data in the EXACT shape Role 2's loadSeed.js
  expects, so it can be dropped straight into
  backend/src/db/seeds/incidents.json and run through their real loader
  with zero changes needed on their side.

  Their own file comment already anticipated this handoff:
  "Role 3's final 15-20 report dataset replaces this file later; same
  schema, same loader."

OUTPUT SHAPE (verified against backend/scripts/loadSeed.js):
  {
    "segments": [
      {"center_lat": float, "center_lng": float, "lighting": 0-100, "foot_traffic": 0-100}
    ],
    "reports": [
      {"segment": int (index into segments), "severity": 1-3,
       "light_condition": "lit"|"unlit"|"unknown", "note": str (<=280 chars),
       "occurred_at": ISO8601 string, "reporter_hash": str}
    ]
  }
"""

import hashlib
import json
import random
from datetime import datetime, timedelta

random.seed(42)

# Same 10 real Bhubaneswar landmarks as v1, now as "segments" with explicit
# lighting/foot_traffic scores (0-100) instead of qualitative labels - these
# feed segment_safety_scores directly via Role 2's loader.
SEGMENTS = [
    {"name": "Master Canteen Square",  "center_lat": 20.2700, "center_lng": 85.8410, "lighting": 70, "foot_traffic": 80},
    {"name": "Rajmahal Square",        "center_lat": 20.2680, "center_lng": 85.8330, "lighting": 55, "foot_traffic": 65},
    {"name": "Kalpana Square",         "center_lat": 20.2760, "center_lng": 85.8480, "lighting": 75, "foot_traffic": 85},
    {"name": "Patia",                  "center_lat": 20.3560, "center_lng": 85.8190, "lighting": 60, "foot_traffic": 70},
    {"name": "Jaydev Vihar",           "center_lat": 20.2980, "center_lng": 85.8090, "lighting": 45, "foot_traffic": 40},
    {"name": "Saheed Nagar",           "center_lat": 20.2930, "center_lng": 85.8420, "lighting": 65, "foot_traffic": 60},
    {"name": "Vani Vihar",             "center_lat": 20.2960, "center_lng": 85.8340, "lighting": 50, "foot_traffic": 55},
    {"name": "Khandagiri",             "center_lat": 20.2590, "center_lng": 85.7780, "lighting": 30, "foot_traffic": 25},
    {"name": "Chandrasekharpur",       "center_lat": 20.3350, "center_lng": 85.8180, "lighting": 40, "foot_traffic": 35},
    {"name": "Nayapalli",              "center_lat": 20.2940, "center_lng": 85.8180, "lighting": 55, "foot_traffic": 50},
]

NOTES = [
    "Street light not working here.",
    "Felt unsafe walking alone.",
    "Group of men loitering, made comments.",
    "No shops open, very quiet stretch.",
    "Someone followed me for a block.",
    "Bag snatching reported nearby.",
    "",
    "",
]

LIGHT_CONDITIONS = ["lit", "unlit", "unknown"]


def fake_reporter_hash(seed_value: str) -> str:
    """Deterministic fake anonymized hash, matching the shape a real
    salted-hash reporter id would have (hex string). Not a real user -
    this is synthetic seed data, clearly scoped so Role 2's loader can
    safely delete+replace only these rows on re-run (fixture-scoped
    idempotent replace, per their loadSeed.js comment)."""
    return hashlib.sha256(f"seed-demo-{seed_value}".encode()).hexdigest()[:16]


def generate(n_reports: int = 20):
    now = datetime(2026, 8, 22, 12, 0, 0)
    reports = []

    for i in range(1, n_reports + 1):
        seg_index = random.randrange(len(SEGMENTS))
        days_ago = random.randint(1, 180)
        hour = random.choice([7, 9, 13, 15, 18, 19, 20, 21, 22, 23, 0, 1])
        ts = (now - timedelta(days=days_ago)).replace(hour=hour, minute=random.randint(0, 59))

        # night/evening incidents skew more severe, matching v1's logic
        if hour >= 17 or hour <= 5:
            severity = random.choice([2, 3, 3])
            light = random.choice(["unlit", "unknown", "unknown"])
        else:
            severity = random.choice([1, 1, 2])
            light = random.choice(["lit", "unknown"])

        reports.append({
            "segment": seg_index,
            "severity": severity,
            "light_condition": light,
            "note": random.choice(NOTES),
            "occurred_at": ts.strftime("%Y-%m-%dT%H:%M:%S"),
            "reporter_hash": fake_reporter_hash(f"{i:03d}"),
        })

    # 2 corroboration pairs: same segment, close in time, so Role 2's
    # scoring can be tested against a "confirmed pattern" case too.
    for pair_i, seg_index in enumerate([0, 3]):
        for j in range(2):
            idx = 100 + pair_i * 2 + j
            ts = now - timedelta(days=5 + j, hours=random.randint(0, 5))
            reports.append({
                "segment": seg_index,
                "severity": 3,
                "light_condition": "unlit",
                "note": "Corroborating report - same issue reported again." if j == 1 else "Felt unsafe here at night.",
                "occurred_at": ts.strftime("%Y-%m-%dT%H:%M:%S"),
                "reporter_hash": fake_reporter_hash(f"corrob-{idx}"),
            })

    return reports


def validate(fixture: dict):
    """Mirrors the checks Role 2's loadSeed.js itself performs, so we catch
    a bad fixture here instead of at their loader's runtime."""
    segments = fixture["segments"]
    reports = fixture["reports"]
    assert len(segments) > 0, "segments array must be non-empty"
    for s in segments:
        assert isinstance(s["center_lat"], float) and isinstance(s["center_lng"], float)
        assert 0 <= s["lighting"] <= 100
        assert 0 <= s["foot_traffic"] <= 100
    for r in reports:
        assert 0 <= r["segment"] < len(segments), f"segment index {r['segment']} out of range"
        assert 1 <= r["severity"] <= 3, f"severity {r['severity']} out of 1-3 range"
        assert r["light_condition"] in LIGHT_CONDITIONS
        assert len(r["note"]) <= 280
        assert r["reporter_hash"]
    reporter_hashes = [r["reporter_hash"] for r in reports]
    assert len(reporter_hashes) == len(set(reporter_hashes)), "duplicate reporter_hash found"
    print(f"Validation OK: {len(segments)} segments, {len(reports)} reports.")


if __name__ == "__main__":
    fixture = {
        "segments": [
            {"center_lat": s["center_lat"], "center_lng": s["center_lng"],
             "lighting": s["lighting"], "foot_traffic": s["foot_traffic"]}
            for s in SEGMENTS
        ],
        "reports": generate(20),
    }
    validate(fixture)

    with open("seed_incidents_v2.json", "w") as f:
        json.dump(fixture, f, indent=2)
    print(f"Wrote seed_incidents_v2.json - {len(fixture['reports'])} reports across {len(fixture['segments'])} segments.")