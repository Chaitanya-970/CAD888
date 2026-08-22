# ai_agent (Role 3)

Explainable Safety Agent for PS-17 Safe Route Mapping. Turns structured
safety signals into a grounded, plain-English explanation of why a route
segment scored the way it did.

## Files

- `signal_contract.py` - the exact input shape Role 2's backend must produce
  (`SIGNAL_SCHEMA_EXAMPLE` and friends), plus `validate_signals()`.
- `explain_agent.py` - `explain_route(signals, provider)` is the main
  function. `provider` is `"mock"` (no key needed), `"grok"`, or `"gemini"`.
- `test_explain_agent.py` - run `python test_explain_agent.py` to verify
  everything works with zero API keys.
- `requirements.txt` - only needed for real Grok/Gemini calls.

## For Role 2 (integration point)

After your scoring endpoint computes a route's segments, build one
`signals` dict per segment matching `signal_contract.SIGNAL_SCHEMA_EXAMPLE`,
then call:

```python
from ai_agent.explain_agent import explain_route
explanation = explain_route(signals, provider="mock")  # swap provider once keys are set
```

You do not need to touch anything inside `ai_agent/` - just produce signals
in the documented shape and call this one function.

## Setting up real API keys (once you have them)

Never hardcode keys in source files. Set them as environment variables:

```bash
export XAI_API_KEY="your-grok-key-here"      # for provider="grok"
export GEMINI_API_KEY="your-gemini-key-here" # for provider="gemini"
pip install -r requirements.txt
```

Then re-run `test_explain_agent.py` but change `provider="mock"` to
`provider="grok"` (or `"gemini"`) in the `run_case` calls to confirm the
real API responds and passes the grounding check.

## Why the fallback template exists

If a real LLM call fails (no key, network issue, rate limit) or its output
mentions something not present in the input signals, `explain_route()`
automatically falls back to a rule-based sentence instead of crashing or
showing an unverified claim. This matches the project plan's own cut-order
(section 12): "Cut LLM explanation -> use a rule-based text template." The
demo should never show a blank or hallucinated explanation.