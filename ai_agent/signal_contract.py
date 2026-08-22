"""
Role 3 - Signal contract for the Explainable Safety Agent
PS-17 Safe Route Mapping

WHAT: Defines the exact shape of the input Role 2's scoring engine must hand
      to explain_route() in explain_agent.py, and provides mock signal
      payloads so Role 3 can build/test the agent before Role 2's real
      scoring endpoint exists (plan section 6, "If backend/API is not ready,
      use compatible mocks").

WHY:  Plan section 14 says the explanation agent "must not hallucinate
      claims" and must be "grounded strictly in DB signals." The only way to
      guarantee that is to give the LLM a narrow, structured input and never
      let it see anything else. This file is the single source of truth for
      that input shape - Role 2 just needs to build a scoring endpoint that
      outputs objects matching SIGNAL_SCHEMA_EXAMPLE below.

INTEGRATION CONTRACT (share this with Role 2):
  Role 2's backend, after scoring a route, must call:
      explain_agent.explain_route(signals: dict) -> str
  where `signals` matches the shape in SIGNAL_SCHEMA_EXAMPLE exactly
  (same keys, same types). Extra keys are ignored; missing required keys
  raise a clear error rather than silently producing a bad explanation.
"""

# The exact fields the explanation agent is allowed to see and use.
REQUIRED_KEYS = {
    "segment_id",       # str - which road segment/geohash cell this is about
    "route_label",       # str - e.g. "Fastest", "Safest", "Balanced"
    "time_bucket",        # str - "morning" | "day" | "evening" | "night"
    "safety_score",        # number 0-100, higher = safer (plan section 3 formula output)
    "lighting",              # str - "well_lit" | "dim" | "dark"
    "foot_traffic",           # str - "low" | "medium" | "high"
    "incident_summary",        # list[dict] - see shape below, can be empty list
    "corroborated",              # bool - true only if >=2 independent reports (plan section 4.4)
}

# Each entry in incident_summary must look like this:
INCIDENT_SUMMARY_ITEM_EXAMPLE = {
    "type": "poor_lighting",        # matches incident_type values from seed_incidents.json
    "count": 3,                       # how many reports of this type near this segment
    "most_recent_days_ago": 12,         # freshness, for the agent to reference plainly
    "severity_avg": 3.5,                  # average severity 1-5 across those reports
}

# One full example signals object - this is what Role 2's endpoint should return.
SIGNAL_SCHEMA_EXAMPLE = {
    "segment_id": "seg-042",
    "route_label": "Fastest",
    "time_bucket": "night",
    "safety_score": 38,
    "lighting": "dark",
    "foot_traffic": "low",
    "incident_summary": [
        {"type": "poor_lighting", "count": 3, "most_recent_days_ago": 12, "severity_avg": 3.5},
        {"type": "harassment", "count": 1, "most_recent_days_ago": 40, "severity_avg": 4.0},
    ],
    "corroborated": True,
}

# A second mock example: a SAFE, well-lit segment with no incidents at all -
# tests that the agent doesn't invent problems when there aren't any.
SIGNAL_SCHEMA_EXAMPLE_SAFE = {
    "segment_id": "seg-108",
    "route_label": "Safest",
    "time_bucket": "night",
    "safety_score": 88,
    "lighting": "well_lit",
    "foot_traffic": "high",
    "incident_summary": [],
    "corroborated": False,
}

# A third mock example: single, uncorroborated report - should NOT be
# described as a pattern (plan section 4.4 corroboration guard).
SIGNAL_SCHEMA_EXAMPLE_SINGLE_REPORT = {
    "segment_id": "seg-071",
    "route_label": "Balanced",
    "time_bucket": "evening",
    "safety_score": 64,
    "lighting": "dim",
    "foot_traffic": "medium",
    "incident_summary": [
        {"type": "catcalling", "count": 1, "most_recent_days_ago": 5, "severity_avg": 2.0},
    ],
    "corroborated": False,
}


def validate_signals(signals: dict) -> None:
    """Raise a clear error if signals is missing required keys.
    Role 2's real endpoint output should always pass this; if it doesn't,
    that's a contract mismatch to fix on their side, not something the
    agent should silently paper over."""
    missing = REQUIRED_KEYS - signals.keys()
    if missing:
        raise ValueError(
            f"signals dict is missing required keys: {sorted(missing)}. "
            f"See ai_agent/signal_contract.py for the full contract."
        )