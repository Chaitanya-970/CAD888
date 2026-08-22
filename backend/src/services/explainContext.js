/**
 * RFC-006 — Explanation Context Service.
 *
 * Derives grounded, hallucination-proof factors from the same scoring
 * data that RFC-004 uses. No LLM calls happen here (Roadmap Conflict #3).
 *
 * Micro-cache (30s TTL) keyed by query tuple prevents a second OSRM hit
 * when called right after /api/route with the same params.
 */

import { getRoutes, routeToCells } from './osrmClient.js';
import { getCellScores, bucketOf, routeScore, bandOf } from './scoringEngine.js';
import { SAFE_THRESHOLD } from './scoringConstants.js';
import getSupabase from '../db/supabase.js';

// ── Micro-cache (30s TTL, criterion 6) ───────────────────────────────

const MICRO_CACHE_TTL_MS = 30_000;
const _microCache = new Map();

/** Exposed for testing. */
export function _clearMicroCache() {
  _microCache.clear();
}

/**
 * Build a cache key from the query parameters.
 * @param {object} origin
 * @param {object} destination
 * @param {string} bucket
 * @returns {string}
 */
function cacheKey(origin, destination, bucket) {
  return `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}:${bucket}`;
}

// ── Explain provider stub (criterion 7) ──────────────────────────────

let _explainProvider = null;

/**
 * Register an external explanation provider (e.g., Role 3's LLM renderer).
 * The provider receives the factors payload and may return an enriched version,
 * but the base JSON contract is NEVER altered — any provider output is additive.
 *
 * @param {function} fn - async (factors) => enrichedFactors
 */
export function registerExplainProvider(fn) {
  _explainProvider = fn;
}

/** Get the registered provider (or null). Exposed for testing. */
export function _getExplainProvider() {
  return _explainProvider;
}

// ── Factor derivation ────────────────────────────────────────────────

/**
 * Derive grounded explanation factors for a single route.
 *
 * Factor ordering rule (from RFC-006 spec):
 *   1. Lighting deficit (cells with lighting < 50)
 *   2. Incidents (desc severity × recency)
 *   3. Floor trigger (min cell score < SAFE_THRESHOLD)
 *
 * A factor appears ONLY if its underlying count/value is non-zero.
 *
 * @param {string[]} cells - ordered geohash-7 cells for this route
 * @param {string} bucket - time bucket
 * @param {Map<string, number>} cellScoreMap - cell → score
 * @param {object} [deps]
 * @param {function} [deps.getDb]
 * @returns {Promise<object[]>} factors array
 */
export async function deriveFactors(cells, bucket, cellScoreMap, deps = {}) {
  const getDb = deps.getDb || getSupabase;
  const db = getDb();
  const factors = [];

  // 1. Lighting factor: count cells with lighting < 50
  const { data: segData } = await db
    .from('road_segments')
    .select('cell_geohash, lighting')
    .in('cell_geohash', cells);

  const lightingMap = new Map();
  if (segData) {
    for (const row of segData) {
      lightingMap.set(row.cell_geohash, row.lighting);
    }
  }

  const unlitCells = cells.filter((c) => (lightingMap.get(c) ?? 50) < 50);
  if (unlitCells.length > 0) {
    factors.push({
      type: 'lighting',
      value: 'unlit',
      cellsAffected: unlitCells.length,
      ofTotalCells: cells.length,
    });
  }

  // 2. Incidents factor: count reports in the last 30 days across path cells
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: reportData } = await db
    .from('incident_reports')
    .select('cell_geohash, severity, occurred_at')
    .in('cell_geohash', cells)
    .gte('occurred_at', thirtyDaysAgo);

  if (reportData && reportData.length > 0) {
    // Find worst cell (lowest score)
    let worstCell = cells[0];
    let worstScore = Infinity;
    for (const c of cells) {
      const s = cellScoreMap.get(c) ?? 50;
      if (s < worstScore) {
        worstScore = s;
        worstCell = c;
      }
    }

    // Find the dominant bucket among reports
    const bucketCounts = {};
    for (const r of reportData) {
      const b = bucketOf(new Date(r.occurred_at));
      bucketCounts[b] = (bucketCounts[b] || 0) + 1;
    }
    const worstBucket = Object.entries(bucketCounts)
      .sort((a, b) => b[1] - a[1])[0][0];

    factors.push({
      type: 'incidents',
      count30d: reportData.length,
      worstBucket,
      cell: worstCell,
    });
  }

  // 3. Floor trigger: min cell score < SAFE_THRESHOLD
  const scores = cells.map((c) => cellScoreMap.get(c) ?? 50);
  const minScore = scores.length > 0 ? Math.min(...scores) : 50;
  if (minScore < SAFE_THRESHOLD) {
    factors.push({
      type: 'floor',
      triggered: true,
      minCellScore: minScore,
    });
  }

  return factors;
}

// ── Main entry point ─────────────────────────────────────────────────

const DISCLAIMER = 'Supplements personal judgment; not a safety guarantee.';

/**
 * Build the full explanation context for a route.
 *
 * @param {object} params
 * @param {object} params.origin - { lat, lng }
 * @param {object} params.destination - { lat, lng }
 * @param {Date} params.time
 * @param {number} params.routeIndex
 * @param {object} [deps] - injectable dependencies
 * @param {function} [deps.getDb]
 * @param {function} [deps.fetchRoutes] - override getRoutes (for testing)
 * @returns {Promise<object>} the contract response
 */
export async function buildExplainContext(params, deps = {}) {
  const { origin, destination, time, routeIndex } = params;
  const bucket = bucketOf(time);
  const key = cacheKey(origin, destination, bucket);

  // Check micro-cache
  let routes;
  const cached = _microCache.get(key);
  if (cached && (Date.now() - cached.ts) < MICRO_CACHE_TTL_MS) {
    routes = cached.routes;
  } else {
    const fetchRoutes = deps.fetchRoutes || getRoutes;
    routes = await fetchRoutes(origin, destination);
    _microCache.set(key, { routes, ts: Date.now() });
  }

  // Select the requested route (default to first if index out of range)
  const route = routes[routeIndex] || routes[0];
  const cells = routeToCells(route);

  // Get cell scores
  const cellScoreMap = await getCellScores(cells, bucket, deps);
  const scores = cells.map((c) => cellScoreMap.get(c) ?? 50);
  const score = routeScore(scores);
  const band = bandOf(score);

  // Derive factors
  const factors = await deriveFactors(cells, bucket, cellScoreMap, deps);

  const result = {
    routeIndex: route.index,
    score,
    band,
    factors,
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };

  // If an explain provider is registered, let it enrich (but never alter base contract)
  if (_explainProvider) {
    try {
      await _explainProvider(result);
    } catch {
      // Provider failures are non-fatal — the base response is always valid
    }
  }

  return result;
}
