/**
 * Registers the Role 3 Explainable Safety Agent as the explanation provider
 * for GET /api/explain-context.
 *
 * Imported once from server.js. Enabled with EXPLAIN_AGENT_ENABLED=true so the
 * agent can be switched off without touching code (e.g. if a demo host has no
 * Python and you also want the JS renderer silenced).
 *
 * The provider is additive by contract: it only ever sets `explanation` and
 * `explanationSource` on the response. It never modifies score, band, factors,
 * or disclaimer, and any failure inside it is swallowed upstream.
 */

import { registerExplainProvider } from '../services/explainContext.js';
import { explainRoute, worstCellOf } from '../services/explainAgent.js';

const LABELS = ['Fastest', 'Balanced', 'Safest'];

export function registerSafetyAgent() {
  if (process.env.EXPLAIN_AGENT_ENABLED !== 'true') return false;

  registerExplainProvider(async (result, internals = {}) => {
    const { cells = [], cellScoreMap = new Map(), bucket = 'day', deps = {} } = internals;
    if (cells.length === 0) return;

    const { cell } = worstCellOf(cells, cellScoreMap);

    const out = await explainRoute(
      {
        cell,
        score: result.score,
        bucket,
        routeLabel: LABELS[result.routeIndex] || `Route ${result.routeIndex + 1}`,
      },
      deps
    );

    if (out) {
      result.explanation = out.explanation;
      result.explanationSource = out.mode; // "js" | "python"
    }
  });

  return true;
}

export default registerSafetyAgent;
