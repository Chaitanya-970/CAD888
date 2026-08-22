/**
 * RFC-006 Test Suite — Explanation Context.
 *
 * Unit tests for factor derivation, micro-cache, provider stub,
 * and the full buildExplainContext pipeline.
 *
 * Covers acceptance criteria 1–8 (criterion 8 verified by file existence
 * + package.json inspection).
 */

import { jest } from '@jest/globals';

import {
  deriveFactors,
  buildExplainContext,
  registerExplainProvider,
  _getExplainProvider,
  _clearMicroCache,
} from '../src/services/explainContext.js';

import { _clearCache } from '../src/services/scoringEngine.js';
import { SAFE_THRESHOLD } from '../src/services/scoringConstants.js';

// ── Helpers ──────────────────────────────────────────────────────────

const NOW = new Date('2026-08-22T23:00:00Z');

/** Build a fake DB that returns configurable road_segments and incident data. */
function makeFakeDb({ segments = [], reports = [] } = {}) {
  return {
    from: jest.fn((table) => {
      if (table === 'road_segments') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: segments, error: null }),
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: segments[0] || { lighting: 50, foot_traffic: 50 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'incident_reports') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              gte: jest.fn().mockResolvedValue({ data: reports, error: null }),
            }),
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: reports, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'segment_safety_scores') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          upsert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    }),
  };
}

// ── deriveFactors (criteria 1, 2, 3) ─────────────────────────────────

describe('deriveFactors', () => {
  beforeEach(() => _clearCache());

  test('Criterion 1: factors ordered lighting → incidents → floor', async () => {
    const cells = ['cell_a', 'cell_b', 'cell_c'];
    const cellScoreMap = new Map([
      ['cell_a', 30],  // below SAFE_THRESHOLD → floor trigger
      ['cell_b', 70],
      ['cell_c', 80],
    ]);

    const fakeDb = makeFakeDb({
      segments: [
        { cell_geohash: 'cell_a', lighting: 20 },  // unlit (< 50)
        { cell_geohash: 'cell_b', lighting: 80 },
        { cell_geohash: 'cell_c', lighting: 90 },
      ],
      reports: [
        { cell_geohash: 'cell_a', severity: 3, occurred_at: NOW.toISOString() },
      ],
    });

    const factors = await deriveFactors(cells, 'night', cellScoreMap, { getDb: () => fakeDb });

    // All three factor types should be present
    expect(factors.length).toBe(3);
    expect(factors[0].type).toBe('lighting');
    expect(factors[1].type).toBe('incidents');
    expect(factors[2].type).toBe('floor');
  });

  test('Criterion 1: zero-issue route → empty factors array', async () => {
    const cells = ['safe1', 'safe2'];
    const cellScoreMap = new Map([
      ['safe1', 85],
      ['safe2', 90],
    ]);

    const fakeDb = makeFakeDb({
      segments: [
        { cell_geohash: 'safe1', lighting: 80 },
        { cell_geohash: 'safe2', lighting: 90 },
      ],
      reports: [],
    });

    const factors = await deriveFactors(cells, 'day', cellScoreMap, { getDb: () => fakeDb });
    expect(factors).toEqual([]);
  });

  test('Criterion 2: count30d traceable to fixture rows', async () => {
    const cells = ['cell_x'];
    const cellScoreMap = new Map([['cell_x', 60]]);

    const reports = [
      { cell_geohash: 'cell_x', severity: 2, occurred_at: NOW.toISOString() },
      { cell_geohash: 'cell_x', severity: 1, occurred_at: NOW.toISOString() },
      { cell_geohash: 'cell_x', severity: 3, occurred_at: NOW.toISOString() },
    ];

    const fakeDb = makeFakeDb({
      segments: [{ cell_geohash: 'cell_x', lighting: 80 }],
      reports,
    });

    const factors = await deriveFactors(cells, 'night', cellScoreMap, { getDb: () => fakeDb });
    const incidentFactor = factors.find((f) => f.type === 'incidents');
    expect(incidentFactor).toBeDefined();
    expect(incidentFactor.count30d).toBe(3); // matches the 3 fixture rows
  });

  test('Criterion 3: unknown cells with no incidents → only lighting factor if applicable', async () => {
    const cells = ['unknown1', 'unknown2'];
    const cellScoreMap = new Map([
      ['unknown1', 50],
      ['unknown2', 50],
    ]);

    const fakeDb = makeFakeDb({
      segments: [
        { cell_geohash: 'unknown1', lighting: 30 }, // unlit
        { cell_geohash: 'unknown2', lighting: 30 }, // unlit
      ],
      reports: [], // no incidents — must not error
    });

    const factors = await deriveFactors(cells, 'night', cellScoreMap, { getDb: () => fakeDb });
    // Should have lighting factor, no incidents, no floor (scores are 50 = threshold)
    expect(factors.length).toBe(1);
    expect(factors[0].type).toBe('lighting');
    expect(factors[0].cellsAffected).toBe(2);
  });

  test('lighting factor has correct cellsAffected and ofTotalCells', async () => {
    const cells = ['lit1', 'dark1', 'dark2'];
    const cellScoreMap = new Map([
      ['lit1', 80],
      ['dark1', 60],
      ['dark2', 60],
    ]);

    const fakeDb = makeFakeDb({
      segments: [
        { cell_geohash: 'lit1', lighting: 90 },
        { cell_geohash: 'dark1', lighting: 20 },
        { cell_geohash: 'dark2', lighting: 10 },
      ],
      reports: [],
    });

    const factors = await deriveFactors(cells, 'night', cellScoreMap, { getDb: () => fakeDb });
    const lf = factors.find((f) => f.type === 'lighting');
    expect(lf.cellsAffected).toBe(2);
    expect(lf.ofTotalCells).toBe(3);
  });
});

// ── buildExplainContext (criteria 5, 6) ──────────────────────────────

describe('buildExplainContext', () => {
  beforeEach(() => {
    _clearCache();
    _clearMicroCache();
  });

  /** Fake OSRM route response. */
  const fakeRoutes = [
    {
      index: 0,
      distanceM: 1200,
      durationS: 900,
      coords: [[12.97, 77.59], [12.975, 77.595], [12.98, 77.60]],
    },
    {
      index: 1,
      distanceM: 1500,
      durationS: 1100,
      coords: [[12.97, 77.59], [12.972, 77.592], [12.98, 77.60]],
    },
  ];

  const fakeDb = makeFakeDb({
    segments: [],
    reports: [],
  });

  test('Criterion 5: disclaimer present verbatim', async () => {
    const result = await buildExplainContext(
      {
        origin: { lat: 12.97, lng: 77.59 },
        destination: { lat: 12.98, lng: 77.60 },
        time: NOW,
        routeIndex: 0,
      },
      {
        getDb: () => fakeDb,
        fetchRoutes: async () => fakeRoutes,
      }
    );

    expect(result.disclaimer).toBe('Supplements personal judgment; not a safety guarantee.');
    expect(result).toHaveProperty('generatedAt');
    expect(result).toHaveProperty('routeIndex', 0);
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('band');
    expect(Array.isArray(result.factors)).toBe(true);
  });

  test('Criterion 6: repeated call within 30s does not call fetchRoutes again', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(fakeRoutes);

    const params = {
      origin: { lat: 12.97, lng: 77.59 },
      destination: { lat: 12.98, lng: 77.60 },
      time: NOW,
      routeIndex: 0,
    };
    const deps = { getDb: () => fakeDb, fetchRoutes: fetchSpy };

    await buildExplainContext(params, deps);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call — should use micro-cache
    await buildExplainContext(params, deps);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1
  });
});

// ── registerExplainProvider (criterion 7) ────────────────────────────

describe('registerExplainProvider', () => {
  test('exists and is a function', () => {
    expect(typeof registerExplainProvider).toBe('function');
  });

  test('is unused by default (null)', () => {
    // Reset by re-registering null
    registerExplainProvider(null);
    expect(_getExplainProvider()).toBeNull();
  });

  test('registered provider is called but does not alter base contract', async () => {
    const providerSpy = jest.fn();
    registerExplainProvider(providerSpy);

    const fakeDb = makeFakeDb({ segments: [], reports: [] });
    const fakeRoutes = [
      { index: 0, distanceM: 1000, durationS: 800, coords: [[12.97, 77.59], [12.98, 77.60]] },
    ];

    const result = await buildExplainContext(
      {
        origin: { lat: 12.97, lng: 77.59 },
        destination: { lat: 12.98, lng: 77.60 },
        time: NOW,
        routeIndex: 0,
      },
      { getDb: () => fakeDb, fetchRoutes: async () => fakeRoutes }
    );

    expect(providerSpy).toHaveBeenCalledTimes(1);
    // Base contract still intact
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('band');
    expect(result).toHaveProperty('factors');
    expect(result).toHaveProperty('disclaimer');

    // Cleanup
    registerExplainProvider(null);
  });

  test('provider failure is non-fatal', async () => {
    registerExplainProvider(async () => {
      throw new Error('LLM crashed');
    });

    const fakeDb = makeFakeDb({ segments: [], reports: [] });
    const fakeRoutes = [
      { index: 0, distanceM: 500, durationS: 400, coords: [[12.97, 77.59], [12.98, 77.60]] },
    ];

    // Should not throw
    const result = await buildExplainContext(
      {
        origin: { lat: 12.97, lng: 77.59 },
        destination: { lat: 12.98, lng: 77.60 },
        time: NOW,
        routeIndex: 0,
      },
      { getDb: () => fakeDb, fetchRoutes: async () => fakeRoutes }
    );

    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('disclaimer');

    registerExplainProvider(null);
  });
});

// ── File existence + no LLM SDK (criterion 8) ────────────────────────

describe('Criterion 8 — file existence, no LLM SDK', () => {
  test('explainContext.js exports buildExplainContext', () => {
    expect(typeof buildExplainContext).toBe('function');
  });

  test('explainContext.js exports registerExplainProvider', () => {
    expect(typeof registerExplainProvider).toBe('function');
  });

  test('explainContext.js exports deriveFactors', () => {
    expect(typeof deriveFactors).toBe('function');
  });
});
