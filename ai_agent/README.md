# ai_agent (Role 3)

Explainable Safety Agent for PS-17 Safe Route Mapping. Turns structured
safety signals into a grounded, plain-English explanation of why a route
segment scored the way it did.

**Updated:** after Role 2's real backend appeared on `main` (Node.js/Express,
not Python), two things changed from the original design:
1. `signal_contract.py` no longer includes an `incident_type` field - Role 2's
   real `incident_reports` table only stores severity (1-3), light_condition
   (lit/unlit/unknown), and a free-text note. The contract now matches that.
2. Since Role 2's backend is Node.js, it cannot `import` this Python module
   directly - see "For Role 2 (integration point)" below for the actual bridge.

## Files

- `signal_contract.py` - the exact input shape Role 2's backend must produce
  (`SIGNAL_SCHEMA_EXAMPLE` and friends), plus `validate_signals()`.
- `explain_agent.py` - `explain_route(signals, provider)` is the main
  Python function. `provider` is `"mock"` (no key needed), `"grok"`, or
  `"gemini"`. Also runnable as a CLI (see below) for Node.js to call.
- `test_explain_agent.py` - run `python test_explain_agent.py` to verify
  everything works with zero API keys.
- `dbscan_hotspots.py` / `test_dbscan_hotspots.py` - P3 stretch feature,
  clusters incident reports into hotspots (pure Python, standalone).
- `requirements.txt` - only needed for real Grok/Gemini calls, or DBSCAN.

## For Role 2 (integration point) - Node.js bridge

Your backend is Express/Node, this agent is Python - so instead of an
`import`, call it as a subprocess: write one JSON signals object to stdin,
read one JSON `{"explanation": "..."}` object back from stdout.

```
echo '{...signals...}' | python3 ai_agent/explain_agent.py --provider mock
```

From Node, using the built-in `child_process`:

```javascript
import { execFile } from 'node:child_process';

function explainRoute(signals, provider = 'mock') {
  return new Promise((resolve, reject) => {
    const child = execFile('python3', ['ai_agent/explain_agent.py', '--provider', provider],
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        try {
          resolve(JSON.parse(stdout).explanation);
        } catch (e) {
          reject(e);
        }
      });
    child.stdin.write(JSON.stringify(signals));
    child.stdin.end();
  });
}
```

Build one `signals` object per segment matching `signal_contract.SIGNAL_SCHEMA_EXAMPLE`
exactly - field names, types, and the `incident_summary` shape (no "type" key,
just count/severity_avg/light_condition_mode/sample_notes) - and this will work
with zero changes needed inside `ai_agent/`.

If a persistent HTTP microservice turns out to be easier for your setup
instead of subprocess calls (e.g. if per-request Python startup time becomes
a problem during the demo), tell Role 3 and we'll wrap `explain_route()` in a
minimal Flask/FastAPI server instead - the core function doesn't change either way.

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
invents an incident category that isn't backed by any real report note,
`explain_route()` automatically falls back to a rule-based sentence instead
of crashing or showing an unverified claim. This matches the project plan's
own cut-order (section 12): "Cut LLM explanation -> use a rule-based text
template." The demo should never show a blank or hallucinated explanation.