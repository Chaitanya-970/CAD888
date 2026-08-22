"""
Role 3 - Explainable Safety Agent
PS-17 Safe Route Mapping, plan section 5 (P2 tier) and section 14 integration point.

WHAT: Turns structured safety signals for one route/segment into a 1-2
      sentence plain-English explanation, e.g.
      "This route passes an unlit stretch flagged 3 times for poor lighting,
      most recently 12 days ago."

WHY:  Plan section 7 - "Explainable, non-stigmatizing safety routing" is the
      whole differentiator. A bare number (score: 38) means nothing to a
      user in the moment; a grounded sentence does. Plan section 14 requires
      this to be "grounded strictly in DB signals - no hallucinated incident
      claims" - that's why this file has a grounding check built in, not
      just a prompt asking nicely.

HOW IT WORKS:
  1. build_prompt(signals) turns the structured dict into a strict prompt
     that only allows the model to use facts present in the input.
  2. explain_route(signals, provider=...) calls the chosen LLM provider
     (mock / grok / gemini) and returns the explanation string.
  3. _grounding_check() does a lightweight post-hoc scan: if the model's
     output mentions an incident type that was NOT in the input, we reject
     it and fall back to a safe rule-based template instead (plan section
     12's own cut-order fallback #5) rather than ever showing an unverified
     claim to a user.

PROVIDERS:
  - "mock"  - no API call, deterministic, for testing without any key.
  - "grok"  - x.ai API, used for local testing per your setup.
  - "gemini"- Google Gemini API, used for the live demo per your setup.
  Both real providers are optional imports - if you haven't installed the
  SDK or set the API key yet, calling them raises a clear error instead of
  crashing on import, so mock/testing still works.
"""

import os
import re

from signal_contract import validate_signals


SYSTEM_PROMPT = """You are a route-safety explanation assistant for a walking-safety app.

STRICT RULES - follow exactly:
1. You will be given a JSON object describing ONE route segment's safety signals.
2. Write EXACTLY 1-2 sentences explaining why this segment scored the way it did.
3. You may ONLY reference facts present in the JSON you were given. Do not invent
   incident types, counts, dates, or details not present in the input.
4. If incident_summary is empty, do not claim any incidents happened - describe
   the segment based on lighting/foot_traffic/time_bucket only.
5. If corroborated is false, do NOT describe a pattern or repeated problem -
   phrase it as a single, unconfirmed report, or omit it if it would overstate risk.
6. Never mention exact GPS coordinates, personal identities, or anything not in the input.
7. Keep the tone calm and factual, not alarmist. This is a safety tool, not a warning siren.
8. Output ONLY the explanation sentence(s). No preamble, no JSON, no extra commentary."""


def build_prompt(signals: dict) -> str:
    """Builds the user-turn prompt from a validated signals dict."""
    validate_signals(signals)

    lines = [
        f"route_label: {signals['route_label']}",
        f"time_bucket: {signals['time_bucket']}",
        f"safety_score: {signals['safety_score']} (0-100, higher = safer)",
        f"lighting: {signals['lighting']}",
        f"foot_traffic: {signals['foot_traffic']}",
        f"corroborated: {signals['corroborated']}",
    ]
    if signals["incident_summary"]:
        lines.append("incident_summary:")
        for item in signals["incident_summary"]:
            lines.append(
                f"  - type={item['type']}, count={item['count']}, "
                f"most_recent_days_ago={item['most_recent_days_ago']}, "
                f"severity_avg={item['severity_avg']}"
            )
    else:
        lines.append("incident_summary: (none)")

    return "Explain this route segment's safety score using only these facts:\n" + "\n".join(lines)


def _known_incident_types(signals: dict) -> set:
    return {item["type"].replace("_", " ") for item in signals["incident_summary"]}


def _grounding_check(explanation: str, signals: dict) -> bool:
    """Very lightweight safety net: flags an explanation that mentions an
    incident-type phrase not present in the input signals. Not a substitute
    for the prompt rules, just a second line of defense before showing text
    to a user - matches the plan's "must not hallucinate" requirement."""
    all_types = {
        "poor lighting", "harassment", "unsafe group loitering", "stalking",
        "catcalling", "isolated no foot traffic", "theft",
    }
    mentioned = {t for t in all_types if t in explanation.lower()}
    known = _known_incident_types(signals)
    hallucinated = mentioned - known
    return len(hallucinated) == 0


def _fallback_template(signals: dict) -> str:
    """Rule-based fallback, used if grounding check fails or no provider is
    configured. This mirrors plan section 12's own cut-order fallback #5:
    'Cut LLM explanation -> use a rule-based text template.' Having this
    means the demo NEVER shows a blank explanation or a hallucinated one."""
    n = len(signals["incident_summary"])
    if n == 0:
        return (
            f"This segment is {signals['lighting'].replace('_', ' ')} with "
            f"{signals['foot_traffic']} foot traffic during {signals['time_bucket']}, "
            f"and has no reported incidents."
        )
    if not signals["corroborated"]:
        item = signals["incident_summary"][0]
        return (
            f"A single unconfirmed report ({item['type'].replace('_', ' ')}) was logged near "
            f"this segment {item['most_recent_days_ago']} days ago; not yet corroborated."
        )
    top = max(signals["incident_summary"], key=lambda i: i["count"])
    return (
        f"Avoided due to {top['count']} reports of {top['type'].replace('_', ' ')} near this "
        f"segment, most recently {top['most_recent_days_ago']} days ago."
    )


def _call_mock(signals: dict) -> str:
    """Deterministic stand-in for an LLM call - no network, no key needed.
    Useful for unit testing build_prompt()/grounding logic in isolation."""
    return _fallback_template(signals)


def _call_grok(signals: dict) -> str:
    """Calls x.ai's Grok API. Requires XAI_API_KEY env var and the `openai`
    package (Grok's API is OpenAI-SDK-compatible, so we reuse that client)."""
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
    """Calls Google's Gemini API. Requires GEMINI_API_KEY env var and the
    `google-genai` package."""
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
    """Main entry point Role 2's backend calls after scoring a route.

    Args:
      signals: dict matching signal_contract.SIGNAL_SCHEMA_EXAMPLE exactly.
      provider: "mock" | "grok" | "gemini"

    Returns:
      A 1-2 sentence grounded explanation string. Never raises for a
      provider/network failure - falls back to the rule-based template so
      the demo always shows *something* sensible (plan section 12 cut order).
    """
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