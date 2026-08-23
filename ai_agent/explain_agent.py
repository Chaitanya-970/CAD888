"""
Role 3 - Explainable Safety Agent
PS-17 Safe Route Mapping, plan section 5 (P2 tier) and section 14 integration point.

*** UPDATED after seeing Role 2's real backend schema ***
Role 2's incident_reports table has no "incident_type" category - only
severity (1-3), light_condition (lit/unlit/unknown), and a free-text note.
This version of the agent works from severity/light_condition/verbatim
report notes instead of a type label, and the grounding check is adjusted
to match: it flags the explanation if it invents a specific incident
category (e.g. "harassment", "theft") that isn't actually backed by any
real report note in the input.

WHAT: Turns structured safety signals for one route/segment into a 1-2
      sentence plain-English explanation.

WHY:  Plan section 7 - "Explainable, non-stigmatizing safety routing" is the
      differentiator. Plan section 14 requires this to be "grounded strictly
      in DB signals - no hallucinated incident claims."

PROVIDERS: "mock" (no key) / "grok" (x.ai, testing) / "gemini" (Google, demo).
"""

import os

from signal_contract import validate_signals


SYSTEM_PROMPT = """You are a route-safety explanation assistant for a walking-safety app.

STRICT RULES - follow exactly:
1. You will be given a JSON object describing ONE route segment's safety signals.
2. Write EXACTLY 1-2 sentences explaining why this segment scored the way it did.
3. You may ONLY reference facts present in the JSON you were given. The data does
   NOT include an incident "category" (no "harassment", "theft", etc. labels exist) -
   only severity numbers, light_condition, and short free-text notes. Do not invent
   a category label. You MAY quote or lightly paraphrase a sample_note if it helps,
   but never state a specific claim (like a crime type) that isn't in a note.
4. If incident_summary is empty, do not claim any incidents happened - describe
   the segment based on lighting/foot_traffic/time_bucket only.
5. If corroborated is false, do NOT describe a pattern or repeated problem -
   phrase it as a single, unconfirmed report, or omit it if it would overstate risk.
6. Never mention exact GPS coordinates, personal identities, or anything not in the input.
7. Keep the tone calm and factual, not alarmist.
8. Output ONLY the explanation sentence(s). No preamble, no JSON, no extra commentary."""


_CATEGORY_WORDS = {
    "harassment", "theft", "stalking", "assault", "catcalling",
    "robbery", "kidnapping", "mugging", "molestation",
}


def build_prompt(signals: dict) -> str:
    validate_signals(signals)

    lines = [
        f"route_label: {signals['route_label']}",
        f"time_bucket: {signals['time_bucket']}",
        f"safety_score: {signals['safety_score']} (0-100, higher = safer)",
        f"lighting: {signals['lighting']}/100",
        f"foot_traffic: {signals['foot_traffic']}/100",
        f"corroborated: {signals['corroborated']}",
    ]
    if signals["incident_summary"]:
        lines.append("incident_summary:")
        for item in signals["incident_summary"]:
            notes = "; ".join(item["sample_notes"]) if item["sample_notes"] else "(no notes provided)"
            lines.append(
                f"  - count={item['count']}, most_recent_days_ago={item['most_recent_days_ago']}, "
                f"severity_avg={item['severity_avg']}, light_condition_mode={item['light_condition_mode']}, "
                f"sample_notes=[{notes}]"
            )
    else:
        lines.append("incident_summary: (none)")

    return "Explain this route segment's safety score using only these facts:\n" + "\n".join(lines)


def _grounding_check(explanation: str, signals: dict) -> bool:
    """Flags an explanation that names a specific incident category
    (harassment, theft, ...) not literally backed by any sample_note in the
    input - since the real DB has no category field, any such claim would
    be an invented detail, not grounded data."""
    all_notes_text = " ".join(
        note for item in signals["incident_summary"] for note in item["sample_notes"]
    ).lower()
    explanation_lower = explanation.lower()

    for word in _CATEGORY_WORDS:
        if word in explanation_lower and word not in all_notes_text:
            return False
    return True


def _fallback_template(signals: dict) -> str:
    """Rule-based fallback (plan section 12 cut-order #5), rewritten for the
    real severity/light_condition/notes shape instead of incident_type."""
    n = len(signals["incident_summary"])
    if n == 0:
        return (
            f"This segment has lighting rated {signals['lighting']}/100 and foot traffic rated "
            f"{signals['foot_traffic']}/100 during {signals['time_bucket']}, with no reported incidents."
        )
    if not signals["corroborated"]:
        item = signals["incident_summary"][0]
        return (
            f"A single unconfirmed report was logged near this segment "
            f"{item['most_recent_days_ago']} days ago ({item['light_condition_mode']} lighting noted); "
            f"not yet corroborated."
        )
    top = max(signals["incident_summary"], key=lambda i: i["count"])
    return (
        f"Avoided due to {top['count']} reports near this segment (avg severity "
        f"{top['severity_avg']}/3, {top['light_condition_mode']} lighting), most recently "
        f"{top['most_recent_days_ago']} days ago."
    )


def _call_mock(signals: dict) -> str:
    return _fallback_template(signals)


def _call_grok(signals: dict) -> str:
    api_key = os.environ.get("XAI_API_KEY")
    if not api_key:
        raise RuntimeError("XAI_API_KEY environment variable not set.")
    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError("Run: pip install openai") from e

    client = OpenAI(api_key=api_key, base_url="https://api.x.ai/v1")
    resp = client.chat.completions.create(
        model="grok-4-fast-non-reasoning",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_prompt(signals)},
        ],
        temperature=0.3,
        max_tokens=120,
    )
    return resp.choices[0].message.content.strip()


def _call_gemini(signals: dict) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable not set.")
    try:
        from google import genai
    except ImportError as e:
        raise RuntimeError("Run: pip install google-genai") from e

    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"{SYSTEM_PROMPT}\n\n{build_prompt(signals)}",
    )
    return resp.text.strip()


_PROVIDERS = {"mock": _call_mock, "grok": _call_grok, "gemini": _call_gemini}


def explain_route(signals: dict, provider: str = "mock") -> str:
    validate_signals(signals)
    if provider not in _PROVIDERS:
        raise ValueError(f"Unknown provider '{provider}'. Choose from {list(_PROVIDERS)}.")

    if provider == "mock":
        return _call_mock(signals)

    try:
        explanation = _PROVIDERS[provider](signals)
    except Exception as e:  # noqa: BLE001 - deliberate broad catch for demo resilience
        print(f"[explain_agent] {provider} call failed ({e}); using fallback template.")
        return _fallback_template(signals)

    if not _grounding_check(explanation, signals):
        print(f"[explain_agent] {provider} output failed grounding check; using fallback template.")
        return _fallback_template(signals)

    return explanation



    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description="Explain a route segment's safety score.")
    parser.add_argument("--provider", default="mock", choices=list(_PROVIDERS))
    args = parser.parse_args()

    try:
        signals_in = json.loads(sys.stdin.read())
        explanation_out = explain_route(signals_in, provider=args.provider)
        print(json.dumps({"explanation": explanation_out}))
    except Exception as e:  # noqa: BLE001 - CLI boundary: always emit valid JSON, never a raw traceback
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)