/**
 * RFC-003 Test Suite — Safety Scoring Engine.
 *
 * Frozen-clock fixtures covering acceptance criteria 1–7.
 * Criteria 8–9 verified by static inspection (no HTTP imports; constants centralized).
 *
 * DB-dependent tests (criteria 6–7) use an injectable fake DB to avoid
 * requiring a live Supabase instance in CI, matching the RFC-002 pattern.
 */

import { jest } from '@jest/globals';

import {
  bucketOf,
  incidentPenalty,
  segmentScore,
  routeScore,
  bandOf,
  corroborationDamp,
  decayFactor,
  getCellScores,
  updateCellScore,
  _clearCache,
} from '../src/services/scoringEngine.js';

import {
  DECAY_LAMBDA,
  DAMPEN_UNCORROBORATED,
} from '../src/services/scoringConstants.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Make an incident report object. */
function mkReport({ severity = 3, occurredAt, hash = 'user-a' } = {}) {
  return {
    severity,
    occurred_at: occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt,
    reporter_hash: hash,
  };
}

/** A "now" frozen at 2026-08-22 23:00 UTC (night bucket). */
const NOW_NIGHT = new Date('2026-08-22T23:00:00Z');

/** A "now" frozen at 2026-08-22 14:00 UTC (day bucket). */
const NOW_DAY = new Date('2026-08-22T14:00:00Z');

// ── bucketOf ─────────────────────────────────────────────────────────

describe('bucketOf', () => {
  test.each([
    [6, 'morning'], [10, 'morning'],
    [11, 'day'], [16, 'day'],
    [17, 'evening'], [20, 'evening'],
    [21, 'night'], [23, 'night'], [0, 'night'], [5, 'night'],
  ])('hour %i → %s', (hour, expected) => {
    expect(bucketOf(hour)).toBe(expected);
  });

  test('accepts Date object', () => {
    expect(bucketOf(new Date('2026-01-01T08:00:00Z'))).toBe('morning');
    expect(bucketOf(new Date('2026-01-01T23:30:00Z'))).toBe('night');
  });
});

// ── Criterion 1: fresh severity-3 night report on unlit cell ────────

describe('Criterion 1 — time-of-day scoring', () => {
  const freshNightReport = mkReport({
    severity: 3,
    occurredAt: new Date('2026-08-22T22:00:00Z'),  // 1 hour ago in night bucket
    hash: 'user-a',
  });
  const secondReport = mkReport({
    severity: 3,
    occurredAt: new Date('2026-08-22T22:30:00Z'),
    hash: 'user-b',  // distinct hash for corroboration
  });
  const reports = [freshNightReport, secondReport];

  test('night query on unlit cell → score < 40 (red)', () => {
    const unlitCell = { lighting: 0, foot_traffic: 20 };
    const score = segmentScore(unlitCell, reports, 'night', NOW_NIGHT);
    expect(score).toBeLessThan(40);
    expect(bandOf(score)).toBe('red');
  });

  test('day query → higher score than night query (same cell, same reports)', () => {
    // Use a moderately-lit cell so the base score is high enough
    // that the penalty difference between day and night is observable
    const moderateCell = { lighting: 80, foot_traffic: 70 };
    const dayScore = segmentScore(moderateCell, reports, 'day', NOW_DAY);
    const nightScore = segmentScore(moderateCell, reports, 'night', NOW_NIGHT);
    // Day query gets timeMatch=0.25, so penalty is much smaller → higher score
    expect(dayScore).toBeGreaterThan(nightScore);
  });
});

// ── Criterion 2: time decay ─────────────────────────────────────────

describe('Criterion 2 — time decay', () => {
  test('fresh report has higher penalty than 30-day-old report', () => {
    // Use a single corroborated pair for apples-to-apples comparison
    const freshReport = mkReport({
      severity: 3,
      occurredAt: NOW_NIGHT.toISOString(),
      hash: 'user-a',
    });
    const fresh2 = mkReport({
      severity: 3,
      occurredAt: NOW_NIGHT.toISOString(),
      hash: 'user-b',
    });

    const oldDate = new Date(NOW_NIGHT.getTime() - 30 * 86_400_000);
    const oldReport = mkReport({
      severity: 3,
      occurredAt: oldDate.toISOString(),
      hash: 'user-a',
    });
    const old2 = mkReport({
      severity: 3,
      occurredAt: oldDate.toISOString(),
      hash: 'user-b',
    });

    const penaltyFresh = incidentPenalty([freshReport, fresh2], 'night', NOW_NIGHT);
    const penaltyOld = incidentPenalty([oldReport, old2], 'night', NOW_NIGHT);

    expect(penaltyFresh).toBeGreaterThan(0);
    expect(penaltyOld).toBeGreaterThan(0);
    expect(penaltyFresh).toBeGreaterThan(penaltyOld);
  });

  test('decayFactor(0) = 1, decayFactor(30) ≈ exp(-3)', () => {
    expect(decayFactor(0)).toBe(1);
    expect(decayFactor(30)).toBeCloseTo(Math.exp(-DECAY_LAMBDA * 30), 5);
  });

  test('decayFactor ratio at Δ=0 vs Δ=30 ≈ exp(3)', () => {
    const ratio = decayFactor(0) / decayFactor(30);
    expect(ratio).toBeCloseTo(Math.exp(DECAY_LAMBDA * 30), 1);
  });
});

// ── Criterion 3: corroboration ──────────────────────────────────────

describe('Criterion 3 — corroboration dampening', () => {
  const baseReport = mkReport({
    severity: 3,
    occurredAt: NOW_NIGHT.toISOString(),
    hash: 'user-a',
  });

  test('single reporter → dampened', () => {
    const damp = corroborationDamp(baseReport, [baseReport], NOW_NIGHT);
    expect(damp).toBe(DAMPEN_UNCORROBORATED);
  });

  test('two distinct hashes within 72h → full weight', () => {
    const secondReport = mkReport({
      severity: 2,
      occurredAt: new Date(NOW_NIGHT.getTime() - 3600_000).toISOString(),
      hash: 'user-b',
    });
    const damp = corroborationDamp(baseReport, [baseReport, secondReport], NOW_NIGHT);
    expect(damp).toBe(1.0);
  });

  test('duplicate hash does NOT count toward corroboration', () => {
    const dup = mkReport({
      severity: 1,
      occurredAt: new Date(NOW_NIGHT.getTime() - 3600_000).toISOString(),
      hash: 'user-a', // same hash
    });
    const damp = corroborationDamp(baseReport, [baseReport, dup], NOW_NIGHT);
    expect(damp).toBe(DAMPEN_UNCORROBORATED);
  });

  test('single report penalty < corroborated penalty', () => {
    const singleReports = [baseReport];
    const corroboratedReports = [
      baseReport,
      mkReport({ severity: 3, occurredAt: NOW_NIGHT.toISOString(), hash: 'user-b' }),
    ];

    const penaltySingle = incidentPenalty(singleReports, 'night', NOW_NIGHT);
    const penaltyFull = incidentPenalty(corroboratedReports, 'night', NOW_NIGHT);

    expect(penaltySingle).toBeLessThan(penaltyFull);
    expect(penaltySingle).toBeGreaterThan(0);
  });
});

// ── Criterion 4: min-segment floor ──────────────────────────────────

describe('Criterion 4 — min-segment floor', () => {
  test('[80,80,20] scores strictly lower than [60,60,60]', () => {
    const spiky = routeScore([80, 80, 20]);
    const flat = routeScore([60, 60, 60]);
    expect(spiky).toBeLessThan(flat);
  });

  test('floor penalty formula is correct', () => {
    // [80,80,20]: avg=60, min=20, floor = 1.0 * max(0, 50-20) = 30 → 60-30=30
    expect(routeScore([80, 80, 20])).toBe(30);
    // [60,60,60]: avg=60, min=60, floor = 1.0 * max(0, 50-60) = 0 → 60
    expect(routeScore([60, 60, 60])).toBe(60);
  });
});

// ── Criterion 5: output range and band boundaries ───────────────────

describe('Criterion 5 — output range and bands', () => {
  test('all outputs are integers in [0,100]', () => {
    const scores = [
      segmentScore({ lighting: 100, foot_traffic: 100 }, [], 'day', NOW_DAY),
      segmentScore({ lighting: 0, foot_traffic: 0 }, [], 'night', NOW_NIGHT),
      routeScore([100]),
      routeScore([0]),
      routeScore([50, 50, 50]),
    ];
    for (const s of scores) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  test('band boundaries: 70 → green, 69 → yellow, 40 → yellow, 39 → red', () => {
    expect(bandOf(70)).toBe('green');
    expect(bandOf(100)).toBe('green');
    expect(bandOf(69)).toBe('yellow');
    expect(bandOf(40)).toBe('yellow');
    expect(bandOf(39)).toBe('red');
    expect(bandOf(0)).toBe('red');
  });
});

// ── Criterion 6: getCellScores cache ────────────────────────────────

describe('Criterion 6 — getCellScores cache', () => {
  beforeEach(() => _clearCache());

  test('hits DB once for repeated calls within TTL', async () => {
    const inFn = jest.fn().mockResolvedValue({
      data: [{ cell_geohash: 'abc1234', score: 75 }],
      error: null,
    });
    const eqFn = jest.fn().mockReturnValue({ in: inFn });
    const selectFn = jest.fn().mockReturnValue({ eq: eqFn });
    const fromFn = jest.fn().mockReturnValue({ select: selectFn });

    const fakeDb = { from: fromFn };
    const getDb = () => fakeDb;

    // First call — should hit DB
    const r1 = await getCellScores(['abc1234'], 'night', { getDb });
    expect(r1.get('abc1234')).toBe(75);
    expect(fromFn).toHaveBeenCalledTimes(1);

    // Second call — should use cache
    const r2 = await getCellScores(['abc1234'], 'night', { getDb });
    expect(r2.get('abc1234')).toBe(75);
    expect(fromFn).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  test('returns default 50 for cells not in DB', async () => {
    const inFn = jest.fn().mockResolvedValue({ data: [], error: null });
    const eqFn = jest.fn().mockReturnValue({ in: inFn });
    const selectFn = jest.fn().mockReturnValue({ eq: eqFn });
    const fromFn = jest.fn().mockReturnValue({ select: selectFn });

    const fakeDb = { from: fromFn };
    const getDb = () => fakeDb;

    const result = await getCellScores(['unknown1'], 'day', { getDb });
    expect(result.get('unknown1')).toBe(50);
  });
});

// ── Criterion 7: updateCellScore persistence ────────────────────────

describe('Criterion 7 — updateCellScore', () => {
  beforeEach(() => _clearCache());

  test('computes score from DB data and upserts it', async () => {
    const upsertFn = jest.fn().mockResolvedValue({ error: null });

    const fakeDb = {
      from: jest.fn((table) => {
        if (table === 'road_segments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { lighting: 80, foot_traffic: 60 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'incident_reports') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'segment_safety_scores') {
          return { upsert: upsertFn };
        }
        return {};
      }),
    };
    const getDb = () => fakeDb;

    const score = await updateCellScore('cell123', 'day', { getDb, now: NOW_DAY });

    // With lighting=80 foot_traffic=60, no reports: 40*(80/100) + 30*(60/100) = 32+18 = 50
    expect(score).toBe(50);
    expect(upsertFn).toHaveBeenCalledTimes(1);
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        cell_geohash: 'cell123',
        time_bucket: 'day',
        score: 50,
      }),
      expect.anything()
    );
  });

  test('cache is invalidated after update', async () => {
    // Set up a fake DB that tracks call count
    let fromCallCount = 0;
    const inFn = jest.fn().mockResolvedValue({
      data: [{ cell_geohash: 'cellX', score: 30 }],
      error: null,
    });

    const fakeDb = {
      from: jest.fn((table) => {
        if (table === 'segment_safety_scores') {
          fromCallCount++;
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({ in: inFn }),
            }),
            upsert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'road_segments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { lighting: 80, foot_traffic: 60 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'incident_reports') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };
    const getDb = () => fakeDb;

    // Populate cache
    await getCellScores(['cellX'], 'day', { getDb });
    const countAfterFirst = fromCallCount;

    // Cached call — should NOT increase count for segment_safety_scores
    await getCellScores(['cellX'], 'day', { getDb });
    expect(fromCallCount).toBe(countAfterFirst); // still same

    // Update — invalidates cache
    await updateCellScore('cellX', 'day', { getDb, now: NOW_DAY });

    // Next getCellScores must hit DB again
    await getCellScores(['cellX'], 'day', { getDb });
    expect(fromCallCount).toBeGreaterThan(countAfterFirst);
  });
});
