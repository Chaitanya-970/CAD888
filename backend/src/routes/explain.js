/**
 * RFC-006 — Explain Context Endpoint: GET /api/explain-context.
 *
 * Query-param driven (not body) since it's a GET.
 * Validates via zod, delegates to explainContext service.
 */

import { Router } from 'express';
import { z } from 'zod';
import { buildExplainContext } from '../services/explainContext.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// ── Query param schema ───────────────────────────────────────────────

const explainQuerySchema = z.object({
  originLat: z.coerce.number().min(-90).max(90),
  originLng: z.coerce.number().min(-180).max(180),
  destLat: z.coerce.number().min(-90).max(90),
  destLng: z.coerce.number().min(-180).max(180),
  time: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
  routeIndex: z.coerce.number().int().min(0).max(2).optional().default(0),
});

// ── Endpoint ─────────────────────────────────────────────────────────

router.get('/api/explain-context', async (req, res, next) => {
  try {
    // Validate query params
    const parsed = explainQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      throw new ApiError(
        'INVALID_REQUEST',
        400,
        'Query parameter validation failed',
        details
      );
    }

    const { originLat, originLng, destLat, destLng, time, routeIndex } = parsed.data;

    const result = await buildExplainContext({
      origin: { lat: originLat, lng: originLng },
      destination: { lat: destLat, lng: destLng },
      time,
      routeIndex,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
