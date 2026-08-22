"""
Role 3 - Signal contract for the Explainable Safety Agent
PS-17 Safe Route Mapping

*** UPDATED after seeing Role 2's real backend (RFC-001 migration + loader) ***
The original version of this contract assumed an "incident_type" category
(poor_lighting, harassment, etc.), based on the plan document alone.
Role 2's actual `incident_reports` table (backend/src/db/migrations/001_init.sql)
does NOT store a type - only severity (1-3), light_condition (lit/unlit/unknown),
and a free-text note (<=280 chars). This file now matches that reality.

WHAT: Defines the exact shape of the input Role 2's scoring engine must hand
      to explain_route() in explain_agent.py, and provides mock signal
      payloads so Role 3 can build/test the agent before Role 2's real
      scoring endpoint exists.

WHY:  Plan section 14 says the explanation agent "must not hallucinate
      claims" and must be "grounded strictly in DB signals." The only way to
      guarantee that is to give the LLM a narrow, structured input matching
      what the DB can actually produce - not what an earlier design assumed.

INTEGRATION CONTRACT (share this with Role 2):
  Role 2's backend, after scoring a route, must call:
      explain_agent.explain_route(signals: dict) -> str
  where `signals` matches the shape in SIGNAL_SCHEMA_EXAMPLE exactly.
  Extra keys are ignored; missing required keys raise a clear error.
"""

REQUIRED_KEYS = {
    "segment_id",       # str - the cell_geohash (precision 7) from road_segments
    "route_label",        # str - e.g. "Fastest", "Safest", "Balanced"
    "time_bucket",         # str - "morning" | "day" | "evening" | "night"
    "safety_score",         # number 0-100, higher = safer
    "lighting",               # int 0-100 - from road_segments.lighting
    "foot_traffic",            # int 0-100 - from road_segments.foot_traffic
    "incident_summary",         # list[dict] - see shape below, can be empty list
    "corroborated",               # bool - true only if >=2 independent reports
}

# Each entry in incident_summary - matches what Role 2's incident_reports
# table can actually produce: severity + light_condition + notes, no "type".
INCIDENT_SUMMARY_ITEM_EXAMPLE = {
    "count": 3,                          # how many reports near this segment
    "most_recent_days_ago": 12,            # freshness
    "severity_avg": 2.3,                     # average severity, 1-3 scale
    "light_condition_mode": "unlit",           # most common light_condition among these reports
    "sample_notes": ["Street light not working here.", "Felt unsafe walking alone."],
    # up to 2-3 short free-text notes, verbatim from real reports, so the LLM
    # can reference actual reported detail without inventing a category label.
}

SIGNAL_SCHEMA_EXAMPLE = {
    "segment_id": "tuf9x8k",  # example geohash-7 cell id
    "route_label": "Fastest",
    "time_bucket": "night",
    "safety_score": 38,
    "lighting": 30,
    "foot_traffic": 25,
    "incident_summary": [
        {
            "count": 3,
            "most_recent_days_ago": 12,
            "severity_avg": 2.3,
            "light_condition_mode": "unlit",
            "sample_notes": ["Street light not working here.", "Felt unsafe walking alone."],
        },
    ],
    "corroborated": True,
}

SIGNAL_SCHEMA_EXAMPLE_SAFE = {
    "segment_id": "tuf9x91",
    "route_label": "Safest",
    "time_bucket": "night",
    "safety_score": 88,
    "lighting": 85,
    "foot_traffic": 80,
    "incident_summary": [],
    "corroborated": False,
}

SIGNAL_SCHEMA_EXAMPLE_SINGLE_REPORT = {
    "segment_id": "tuf9x77",
    "route_label": "Balanced",
    "time_bucket": "evening",
    "safety_score": 64,
    "lighting": 50,
    "foot_traffic": 55,
    "incident_summary": [
        {
            "count": 1,
            "most_recent_days_ago": 5,
            "severity_avg": 1.0,
            "light_condition_mode": "unknown",
            "sample_notes": ["Group of men loitering, made comments."],
        },
    ],
    "corroborated": False,
}


def validate_signals(signals: dict) -> None:
    """Raise a clear error if signals is missing required keys."""
    missing = REQUIRED_KEYS - signals.keys()
    if missing:
        raise ValueError(
            f"signals dict is missing required keys: {sorted(missing)}. "
            f"See ai_agent/signal_contract.py for the full contract."
        )