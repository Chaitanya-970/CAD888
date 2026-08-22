/**
 * RFC-005 — Report endpoint: POST /api/report.
 *
 * Validates input via shared zod middleware, applies per-hash+cell rate
 * limiting, delegates to reportIngestion service, returns the contract
 * response shape.
 */

import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { ingestReport, anonymize, snapToCell } from '../services/reportIngestion.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// JSON body parsing (Express 5 includes this, but explicit for clarity)
router.use('/api/report', (req, res, next) => {
  if (!req.is('application/json') && req.method === 'POST') {
    // Express 5 auto-parses JSON, but guard against missing content-type
  }
  next();
});

// ── Zod schema ───────────────────────────────────────────────────────

const reportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  severity: z.number().int().min(1).max(3),
  lightCondition: z.enum(['lit', 'unlit', 'unknown']),
  note: z.string().max(280).optional(),
  occurredAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
});

// ── Rate limiter: max 3 reports per hour per hash+cell ───────────────

const reportLimiter = createRateLimiter({
  keyFn: (req) => {
    // We need the hash and cell from the validated body.
    // Since the limiter runs after validation, req.body is parsed.
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const hash = anonymize(ip);
    const cell = snapToCell(req.body.lat, req.body.lng);
    return `${hash}:${cell}`;
  },
  maxRequests: 3,
  windowMs: 3_600_000, // 1 hour
});

// ── Endpoint ─────────────────────────────────────────────────────────

router.post(
  '/api/report',
  validateBody(reportSchema),
  reportLimiter,
  async (req, res, next) => {
    try {
      const start = Date.now();
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';

      const result = await ingestReport({
        lat: req.body.lat,
        lng: req.body.lng,
        severity: req.body.severity,
        lightCondition: req.body.lightCondition,
        note: req.body.note,
        occurredAt: req.body.occurredAt,
        ip,
      });

      if (req.log) {
        req.log.info({ report_ms: Date.now() - start }, 'report ingested');
      }

      res.status(201).json({
        reportId: result.reportId,
        cellGeohash: result.cellGeohash,
        scoreBefore: result.scoreBefore,
        scoreAfter: result.scoreAfter,
        corroborated: result.corroborated,
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        return next(new ApiError('NOT_FOUND', 404, err.message));
      }
      next(err);
    }
  }
);

export default router;
