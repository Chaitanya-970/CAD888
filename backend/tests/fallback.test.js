/**
 * RFC-007 Test Suite — Static Fallback.
 *
 * Simulates OSRM outages (via fetch override) and asserts that the static fallback
 * serves data matching Criterion 1, 2, 3, 7.
 */

import { jest } from '@jest/globals';
import express from 'express';
import { default as request } from 'supertest';

import routeRouter from '../src/routes/route.js';
import { errorHandler, notFoundHandler, ApiError } from '../src/middleware/errorHandler.js';
import * as configModule from '../src/config.js';
import { getFallbackRoutes } from '../src/fallback/staticRoutes.js';

// ── Test app factory ─────────────────────────────────────────────────

function createTestApp(testDeps = {}) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req._testDeps = testDeps;
    req.log = { info: jest.fn(), error: jest.fn() };
    next();
  });

  app.use(routeRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Static Fallback (RFC-007)', () => {
  const VALID_BODY = {
    origin: { lat: 12.97, lng: 77.59 },
    destination: { lat: 12.98, lng: 77.60 },
    time: '2026-08-22T21:30:00+05:30', // night bucket
  };

  test('Criterion 1 & 7: OSRM failure → serves static fallback with explicit labeling', async () => {
    const app = createTestApp({
      getConfig: () => ({ staticFallbackEnabled: true }),
      fetchRoutes: async () => {
        throw new ApiError('UPSTREAM_OSRM', 502, 'Boom');
      },
      getDb: () => ({ from: jest.fn() }), // no live DB needed for fallback
    });

    const res = await request(app)
      .post('/api/route')
      .send(VALID_BODY)
      .expect(200);

    // Labeling
    expect(res.headers['x-data-source']).toBe('static-fallback');
    expect(res.body.dataSource).toBe('static-fallback');

    // Content shape
    expect(res.body).toHaveProperty('routes');
    expect(res.body.routes.length).toBeGreaterThanOrEqual(2);
    expect(res.body).toHaveProperty('generatedAt');
  });

  test('Criterion 2: night variant visibly lower-scored (band differs)', () => {
    const deps = { getConfig: () => ({ staticFallbackEnabled: true }) };
    const dayFallback = getFallbackRoutes(VALID_BODY.origin, 'day', deps);
    const nightFallback = getFallbackRoutes(VALID_BODY.origin, 'night', deps);

    expect(dayFallback).not.toBeNull();
    expect(nightFallback).not.toBeNull();

    // Check if bands differ on index 1
    const dayBand = dayFallback.routes[1].band;
    const nightBand = nightFallback.routes[1].band;
    
    expect(dayBand).not.toEqual(nightBand);
    // Explicitly based on demo-routes.json
    expect(['green', 'yellow']).toContain(dayBand);
    expect(['yellow', 'red']).toContain(nightBand);
  });

  test('Criterion 3: Recovery — no sticky fallback when OSRM responds again', async () => {
    let failThisTime = true;
    const app = createTestApp({
      getConfig: () => ({ staticFallbackEnabled: true }),
      fetchRoutes: async () => {
        if (failThisTime) {
          failThisTime = false;
          throw new ApiError('UPSTREAM_OSRM', 502, 'Boom');
        }
        return [{
          index: 0,
          distanceM: 1000,
          durationS: 900,
          coords: [[12.97, 77.59], [12.98, 77.60]]
        }];
      },
      getDb: () => ({
        from: jest.fn((table) => {
          if (table === 'segment_safety_scores') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  in: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            };
          }
          if (table === 'road_segments') {
            return {
              select: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }
          if (table === 'incident_reports') {
            return {
              select: jest.fn().mockReturnValue({
                in: jest.fn().mockReturnValue({
                  gte: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            };
          }
          return {};
        }),
      }),
    });

    // First request: OSRM fails -> fallback
    const res1 = await request(app).post('/api/route').send(VALID_BODY).expect(200);
    expect(res1.body.dataSource).toBe('static-fallback');

    // Second request: OSRM succeeds -> osrm
    const res2 = await request(app).post('/api/route').send(VALID_BODY).expect(200);
    expect(res2.body.dataSource).toBe('osrm');
    expect(res2.headers['x-data-source']).toBeUndefined();
  });

  test('Fallback disabled → 502 passed through', async () => {
    const app = createTestApp({
      getConfig: () => ({ staticFallbackEnabled: false }),
      fetchRoutes: async () => {
        throw new ApiError('UPSTREAM_OSRM', 502, 'Boom');
      },
    });

    const res = await request(app).post('/api/route').send(VALID_BODY).expect(502);
    expect(res.body.error.code).toBe('UPSTREAM_OSRM');
  });
});
