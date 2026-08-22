"""
Role 3 - quick manual test for explain_agent.py
Run with: python test_explain_agent.py
No API keys needed - uses provider="mock" for all three example signal shapes.
"""

from signal_contract import (
    SIGNAL_SCHEMA_EXAMPLE,
    SIGNAL_SCHEMA_EXAMPLE_SAFE,
    SIGNAL_SCHEMA_EXAMPLE_SINGLE_REPORT,
    validate_signals,
)
from explain_agent import explain_route, build_prompt


def run_case(name: str, signals: dict):
    print(f"\n--- {name} ---")
    validate_signals(signals)
    print("Prompt sent to LLM:")
    print(build_prompt(signals))
    result = explain_route(signals, provider="mock")
    print("Explanation:", result)
    assert isinstance(result, str) and len(result) > 0
    return result


if __name__ == "__main__":
    run_case("Multi-report, corroborated (unsafe)", SIGNAL_SCHEMA_EXAMPLE)
    run_case("No incidents (safe)", SIGNAL_SCHEMA_EXAMPLE_SAFE)
    run_case("Single uncorroborated report", SIGNAL_SCHEMA_EXAMPLE_SINGLE_REPORT)

    # Contract check: missing a required key should raise, not silently pass
    try:
        validate_signals({"segment_id": "x"})
        raise SystemExit("FAILED: validate_signals should have raised on missing keys")
    except ValueError as e:
        print("\nContract check OK - missing keys correctly rejected:", e)

    print("\nAll explain_agent tests passed.")