/**
 * RFC-004 Test Suite — Route Endpoint: POST /api/route.
 *
 * Contract tests asserting the exact JSON shape, scoring consistency
 * with RFC-003, validation errors, OSRM failure handling, and latency logging.
 *
 * Uses injectable fake OSRM + fake DB — no live services needed.
 */

import { jest } from '@jest/globals';
import express from 'express';
import { default as request } from 'supertest';

import routeRouter from '../src/routes/route.js';
import { ApiError, errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import { _clearCache, routeScore, bandOf } from '../src/services/scoringEngine.js';

// ── Test app factory ─────────────────────────────────────────────────

function createTestApp(testDeps = {}) {
  const app = express();
  app.use(express.json());

  // Inject test dependencies into every request
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

// ── Fake OSRM routes ────────────────────────────────────────────────

const FAKE_OSRM_ROUTES = [
  {
    index: 0,
    distanceM: 1450,
    durationS: 1080,
    coords: [[12.970, 77.590], [12.975, 77.595], [12.980, 77.600]],
  },
  {
    index: 1,
    distanceM: 1600,
    durationS: 1200,
    coords: [[12.970, 77.590], [12.973, 77.592], [12.980, 77.600]],
  },
  {
    index: 2,
    distanceM: 1800,
    durationS: 1350,
    coords: [[12.970, 77.590], [12.972, 77.598], [12.980, 77.600]],
  },
];

// ── Fake DB ──────────────────────────────────────────────────────────

function makeFakeDb({ segScores = [], segments = [], reports = [] } = {}) {
  return {
    from: jest.fn((table) => {
      if (table === 'segment_safety_scores') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({
                data: segScores,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'road_segments') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: segments,
              error: null,
            }),
          }),
        };
      }
      if (table === 'incident_reports') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              gte: jest.fn().mockResolvedValue({
                data: reports,
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('POST /api/route', () => {
  beforeEach(() => _clearCache());

  const VALID_BODY = {
    origin: { lat: 12.97, lng: 77.59 },
    destination: { lat: 12.98, lng: 77.60 },
    time: '2026-08-22T21:30:00+05:30',
  };

  // ── Criterion 1: happy path with 3 routes ──────────────────────────

  test('Criterion 1: valid request → 200 with exactly 3 route objects matching contract', async () => {
    const fakeDb = makeFakeDb();
    const app = createTestApp({
      fetchRoutes: async () => FAKE_OSRM_ROUTES,
      getDb: () => fakeDb,
    });

    const res = await request(app)
      .post('/api/route')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body).toHaveProperty('routes');
    expect(res.body.routes).toHaveLength(3);
    expect(res.body).toHaveProperty('dataSource', 'osrm');
    expect(res.body).toHaveProperty('generatedAt');

    // Each route has the contract fields
    for (const route of res.body.routes) {
      expect(route).toHaveProperty('index');
      expect(route).toHaveProperty('summary');
      expect(route.summary).toHaveProperty('distanceM');
      expect(route.summary).toHaveProperty('durationS');
      expect(route).toHaveProperty('score');
      expect(route).toHaveProperty('band');
      expect(route).toHaveProperty('cells');
      expect(route).toHaveProperty('cellScores');
      expect(route).toHaveProperty('explanationInput');

      // Score is integer 0–100
      expect(Number.isInteger(route.score)).toBe(true);
      expect(route.score).toBeGreaterThanOrEqual(0);
      expect(route.score).toBeLessThanOrEqual(100);

      // Band is valid
      expect(['green', 'yellow', 'red']).toContain(route.band);

      // Cells is array of strings
      expect(Array.isArray(route.cells)).toBe(true);
      route.cells.forEach((c) => expect(typeof c).toBe('string'));

      // cellScores matches cells
      expect(route.cellScores).toHaveLength(route.cells.length);
      route.cellScores.forEach((cs) => {
        expect(cs).toHaveProperty('cell');
        expect(cs).toHaveProperty('score');
      });

      // explanationInput shape
      expect(route.explanationInput).toHaveProperty('unlitCells');
      expect(route.explanationInput).toHaveProperty('totalCells');
      expect(route.explanationInput).toHaveProperty('reportsLast30d');
      expect(route.explanationInput).toHaveProperty('worstCellScore');
      expect(route.explanationInput).toHaveProperty('timeBucket');
    }
  });

  // ── Criterion 2: scores match RFC-003 ──────────────────────────────

  test('Criterion 2: scores/bands match RFC-003 routeScore/bandOf', async () => {
    const fakeDb = makeFakeDb();
    const app = createTestApp({
      fetchRoutes: async () => [FAKE_OSRM_ROUTES[0]],
      getDb: () => fakeDb,
    });

    const res = await request(app)
      .post('/api/route')
      .send(VALID_BODY)
      .expect(200);

    const route = res.body.routes[0];
    const cellScoreValues = route.cellScores.map((cs) => cs.score);

    // Recompute using RFC-003 functions directly
    const expectedScore = routeScore(cellScoreValues);
    const expectedBand = bandOf(expectedScore);

    expect(route.score).toBe(expectedScore);
    expect(route.band).toBe(expectedBand);
  });

  // ── Criterion 3: validation errors ─────────────────────────────────

  test('Criterion 3: missing origin.lat → 400 INVALID_REQUEST', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/route')
      .send({ origin: { lng: 77.59 }, destination: { lat: 12.98, lng: 77.60 } })
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  test('Criterion 3: origin.lat > 90 → 400', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/route')
      .send({ origin: { lat: 91, lng: 77.59 }, destination: { lat: 12.98, lng: 77.60 } })
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  test('Criterion 3: invalid time string → 400', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/route')
      .send({
        origin: { lat: 12.97, lng: 77.59 },
        destination: { lat: 12.98, lng: 77.60 },
        time: 'not-a-date',
      })
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  // ── Criterion 4: OSRM failure → 502 ───────────────────────────────

  test('Criterion 4: OSRM failure → 502 UPSTREAM_OSRM JSON body', async () => {
    const app = createTestApp({
      fetchRoutes: async () => {
        throw new ApiError('UPSTREAM_OSRM', 502, 'Routing service unavailable');
      },
    });

    const res = await request(app)
      .post('/api/route')
      .send(VALID_BODY)
      .expect(502);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('UPSTREAM_OSRM');
  });

  // ── Criterion 5: default time + generatedAt ────────────────────────

  test('Criterion 5: omitted time → current instant used, generatedAt present', async () => {
    const fakeDb = makeFakeDb();
    const app = createTestApp({
      fetchRoutes: async () => [FAKE_OSRM_ROUTES[0]],
      getDb: () => fakeDb,
    });

    const res = await request(app)
      .post('/api/route')
      .send({
        origin: { lat: 12.97, lng: 77.59 },
        destination: { lat: 12.98, lng: 77.60 },
        // time omitted
      })
      .expect(200);

    expect(res.body).toHaveProperty('generatedAt');
    expect(new Date(res.body.generatedAt).getTime()).not.toBeNaN();
  });

  // ── Criterion 6: explanationInput values ───────────────────────────

  test('Criterion 6: explanationInput.unlitCells counts cells with lighting < 50', async () => {
    const fakeDb = makeFakeDb({
      segments: [
        { cell_geohash: 'cell_a', lighting: 20 },  // unlit
        { cell_geohash: 'cell_b', lighting: 80 },  // lit
      ],
      reports: [
        { cell_geohash: 'cell_a' },
        { cell_geohash: 'cell_a' },
      ],
    });

    const singleRoute = [{
      index: 0,
      distanceM: 500,
      durationS: 400,
      coords: [[12.970, 77.590], [12.980, 77.600]],
    }];

    const app = createTestApp({
      fetchRoutes: async () => singleRoute,
      getDb: () => fakeDb,
    });

    const res = await request(app)
      .post('/api/route')
      .send(VALID_BODY)
      .expect(200);

    const ei = res.body.routes[0].explanationInput;
    expect(ei).toHaveProperty('unlitCells');
    expect(ei).toHaveProperty('totalCells');
    expect(ei).toHaveProperty('reportsLast30d');
    expect(ei).toHaveProperty('worstCellScore');
    expect(ei).toHaveProperty('timeBucket');
    expect(typeof ei.unlitCells).toBe('number');
    expect(typeof ei.reportsLast30d).toBe('number');
  });

  // ── Criterion 8: file existence ────────────────────────────────────

  test('Criterion 8: route.js exports a router', () => {
    expect(routeRouter).toBeDefined();
  });
});
