/**
 * RFC-004 — Route Endpoint: POST /api/route.
 *
 * The primary API surface. Validates origin/destination/time, fetches
 * alternative routes from OSRM, scores each path's cells, and returns
 * scored routes with bands and the grounded explanationInput for Role 3.
 *
 * Latency logged: osrm_ms (upstream fetch) + route_ms (total handler).
 */

import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import { getRoutes, routeToCells } from '../services/osrmClient.js';
import { getCellScores, routeScore, bandOf, bucketOf } from '../services/scoringEngine.js';
import getSupabase from '../db/supabase.js';

const router = Router();

// Express 5 has built-in JSON parsing, but ensure it's available
router.use('/api/route', (req, _res, next) => next());

// ── Zod schema (frozen contract) ─────────────────────────────────────

const coordSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const routeRequestSchema = z.object({
  origin: coordSchema,
  destination: coordSchema,
  time: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
});

// ── Explanation input builder ────────────────────────────────────────

/**
 * Build the grounded explanationInput object for a single route.
 * Every value traces back to DB data — no fabrication.
 *
 * @param {string[]} cells
 * @param {Map<string, number>} cellScoreMap
 * @param {string} bucket
 * @param {object} [deps]
 * @param {function} [deps.getDb]
 * @returns {Promise<object>}
 */
async function buildExplanationInput(cells, cellScoreMap, bucket, deps = {}) {
  const getDb = deps.getDb || getSupabase;
  const db = getDb();

  // Count unlit cells (lighting < 50)
  let unlitCells = 0;
  const { data: segData } = await db
    .from('road_segments')
    .select('cell_geohash, lighting')
    .in('cell_geohash', cells);

  if (segData) {
    for (const row of segData) {
      if ((row.lighting ?? 50) < 50) unlitCells++;
    }
  }

  // Count reports in last 30 days across path cells
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: reportData } = await db
    .from('incident_reports')
    .select('cell_geohash')
    .in('cell_geohash', cells)
    .gte('occurred_at', thirtyDaysAgo);

  const reportsLast30d = reportData ? reportData.length : 0;

  // Worst cell score
  let worstCellScore = 100;
  for (const c of cells) {
    const s = cellScoreMap.get(c) ?? 50;
    if (s < worstCellScore) worstCellScore = s;
  }

  return {
    unlitCells,
    totalCells: cells.length,
    reportsLast30d,
    worstCellScore,
    timeBucket: bucket,
  };
}

// ── Endpoint ─────────────────────────────────────────────────────────

router.post(
  '/api/route',
  validateBody(routeRequestSchema),
  async (req, res, next) => {
    try {
      const handlerStart = Date.now();
      const { origin, destination, time } = req.body;
      const bucket = bucketOf(time);

      // Fetch routes from OSRM (with timing)
      const osrmStart = Date.now();
      let osrmRoutes;
      if (req._testDeps?.fetchRoutes) {
        osrmRoutes = await req._testDeps.fetchRoutes(origin, destination);
      } else {
        osrmRoutes = await getRoutes(origin, destination);
      }
      const osrmMs = Date.now() - osrmStart;

      // Deps for DB calls (test injection)
      const deps = req._testDeps || {};

      // Process each route: cells → scores → band → explanationInput
      const routes = await Promise.all(
        osrmRoutes.map(async (route) => {
          const cells = routeToCells(route);
          const cellScoreMap = await getCellScores(cells, bucket, deps);

          const scores = cells.map((c) => cellScoreMap.get(c) ?? 50);
          const score = routeScore(scores);
          const band = bandOf(score);

          const cellScores = cells.map((c) => ({
            cell: c,
            score: cellScoreMap.get(c) ?? 50,
          }));

          const explanationInput = await buildExplanationInput(
            cells, cellScoreMap, bucket, deps
          );

          return {
            index: route.index,
            summary: {
              distanceM: route.distanceM,
              durationS: route.durationS,
            },
            score,
            band,
            cells,
            cellScores,
            explanationInput,
          };
        })
      );

      const routeMs = Date.now() - handlerStart;

      // Criterion 7: log latencies
      if (req.log) {
        req.log.info({ route_ms: routeMs, osrm_ms: osrmMs }, 'route scored');
      }

      res.json({
        routes,
        dataSource: 'osrm',
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
