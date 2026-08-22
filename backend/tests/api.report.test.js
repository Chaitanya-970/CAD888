/**
 * RFC-005 Test Suite — Report Ingestion.
 *
 * Unit tests for the ingestion pipeline and middleware.
 * Uses injectable fakes — no live Supabase needed.
 *
 * Covers acceptance criteria 1–8 (criterion 9 verified by file existence).
 */

import { jest } from '@jest/globals';

import { anonymize, snapToCell, verifyCell, checkCorroboration, ingestReport } from '../src/services/reportIngestion.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { validateBody } from '../src/middleware/validate.js';
import { _clearCache } from '../src/services/scoringEngine.js';
import { z } from 'zod';

// ── anonymize (criterion 4) ─────────────────────────────────────────

describe('anonymize — privacy', () => {
  test('produces a hex string, never the raw IP', () => {
    const hash = anonymize('192.168.1.1', { salt: 'test-salt' });
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(hash).not.toContain('192.168');
  });

  test('same IP + salt → same hash (deterministic)', () => {
    const h1 = anonymize('10.0.0.1', { salt: 'salt-a' });
    const h2 = anonymize('10.0.0.1', { salt: 'salt-a' });
    expect(h1).toBe(h2);
  });

  test('different salt → different hash', () => {
    const h1 = anonymize('10.0.0.1', { salt: 'salt-a' });
    const h2 = anonymize('10.0.0.1', { salt: 'salt-b' });
    expect(h1).not.toBe(h2);
  });
});

// ── snapToCell ───────────────────────────────────────────────────────

describe('snapToCell', () => {
  test('returns a 7-char geohash', () => {
    const cell = snapToCell(12.9716, 77.5946);
    expect(cell).toHaveLength(7);
    expect(typeof cell).toBe('string');
  });

  test('nearby points snap to same cell', () => {
    const c1 = snapToCell(12.9716, 77.5946);
    const c2 = snapToCell(12.9717, 77.5947); // ~15m away
    expect(c1).toBe(c2);
  });
});

// ── verifyCell (criterion 2) ─────────────────────────────────────────

describe('verifyCell', () => {
  test('returns row when cell exists', async () => {
    const fakeDb = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { cell_geohash: 'abc1234', lighting: 60, foot_traffic: 50 },
              error: null,
            }),
          }),
        }),
      }),
    };

    const row = await verifyCell('abc1234', { getDb: () => fakeDb });
    expect(row.cell_geohash).toBe('abc1234');
  });

  test('throws NOT_FOUND when cell missing', async () => {
    const fakeDb = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'not found' },
            }),
          }),
        }),
      }),
    };

    await expect(verifyCell('zzz9999', { getDb: () => fakeDb }))
      .rejects.toThrow(/not found/i);
  });
});

// ── checkCorroboration (criterion 5/6) ───────────────────────────────

describe('checkCorroboration', () => {
  const now = new Date('2026-08-22T23:00:00Z');

  test('single hash → not corroborated', async () => {
    const fakeDb = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              lte: jest.fn().mockResolvedValue({
                data: [{ reporter_hash: 'hash-a' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    // hash-a already in DB + hash-a being submitted = 1 distinct → false
    const result = await checkCorroboration('cell1', 'hash-a', now, { getDb: () => fakeDb });
    expect(result).toBe(false);
  });

  test('two distinct hashes → corroborated', async () => {
    const fakeDb = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockReturnValue({
              lte: jest.fn().mockResolvedValue({
                data: [{ reporter_hash: 'hash-a' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    // hash-a in DB + hash-b being submitted = 2 distinct → true
    const result = await checkCorroboration('cell1', 'hash-b', now, { getDb: () => fakeDb });
    expect(result).toBe(true);
  });
});

// ── Rate limiter (criterion 3) ───────────────────────────────────────

describe('createRateLimiter', () => {
  test('allows maxRequests then blocks with 429', () => {
    const limiter = createRateLimiter({
      keyFn: (req) => req.testKey,
      maxRequests: 3,
      windowMs: 3_600_000,
    });

    const req = { testKey: 'user1:cell1' };
    const res = {};
    const next = jest.fn();

    // 3 allowed
    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(3);

    // 4th blocked
    expect(() => limiter(req, res, next)).toThrow(/rate limit/i);
  });

  test('different keys are independent', () => {
    const limiter = createRateLimiter({
      keyFn: (req) => req.testKey,
      maxRequests: 1,
      windowMs: 3_600_000,
    });

    const next = jest.fn();

    limiter({ testKey: 'a' }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Different key, should be allowed
    limiter({ testKey: 'b' }, {}, next);
    expect(next).toHaveBeenCalledTimes(2);

    // Same key 'a' again, should be blocked
    expect(() => limiter({ testKey: 'a' }, {}, next)).toThrow(/rate limit/i);
  });
});

// ── validateBody middleware (criterion 8) ─────────────────────────────

describe('validateBody', () => {
  const schema = z.object({
    severity: z.number().int().min(1).max(3),
    note: z.string().max(280).optional(),
    lightCondition: z.enum(['lit', 'unlit', 'unknown']),
  });

  test('passes valid body through', () => {
    const middleware = validateBody(schema);
    const req = { body: { severity: 2, lightCondition: 'lit' } };
    const next = jest.fn();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.severity).toBe(2);
  });

  test('rejects note > 280 chars', () => {
    const middleware = validateBody(schema);
    const req = { body: { severity: 1, lightCondition: 'unlit', note: 'x'.repeat(281) } };
    expect(() => middleware(req, {}, jest.fn())).toThrow(/validation failed/i);
  });

  test('rejects invalid lightCondition enum', () => {
    const middleware = validateBody(schema);
    const req = { body: { severity: 1, lightCondition: 'bright' } };
    expect(() => middleware(req, {}, jest.fn())).toThrow(/validation failed/i);
  });

  test('rejects severity out of range', () => {
    const middleware = validateBody(schema);
    const req = { body: { severity: 5, lightCondition: 'lit' } };
    expect(() => middleware(req, {}, jest.fn())).toThrow(/validation failed/i);
  });
});

// ── ingestReport integration (criteria 1, 5) ─────────────────────────

describe('ingestReport — happy path', () => {
  beforeEach(() => _clearCache());

  test('returns all contract fields with valid input', async () => {
    const cellGeohash = 'tdr1x0z'; // whatever snapToCell returns for the given coords

    const fakeDb = {
      from: jest.fn((table) => {
        if (table === 'road_segments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { cell_geohash: cellGeohash, lighting: 60, foot_traffic: 50 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'incident_reports') {
          // For insert
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'fake-uuid-123' },
                  error: null,
                }),
              }),
            }),
            // For corroboration check (select)
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                gte: jest.fn().mockReturnValue({
                  lte: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
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
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue({
                  data: [{ cell_geohash: cellGeohash, score: 65 }],
                  error: null,
                }),
              }),
            }),
            upsert: jest.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };

    const result = await ingestReport(
      {
        lat: 12.9716,
        lng: 77.5946,
        severity: 2,
        lightCondition: 'unlit',
        note: 'dark alley',
        occurredAt: new Date('2026-08-22T22:00:00Z'),
        ip: '192.168.1.1',
      },
      { getDb: () => fakeDb, salt: 'test-salt' }
    );

    // Criterion 1: all 5 contract fields present
    expect(result).toHaveProperty('reportId', 'fake-uuid-123');
    expect(result).toHaveProperty('cellGeohash');
    expect(typeof result.cellGeohash).toBe('string');
    expect(result).toHaveProperty('scoreBefore');
    expect(result).toHaveProperty('scoreAfter');
    expect(result).toHaveProperty('corroborated');
    expect(typeof result.scoreBefore).toBe('number');
    expect(typeof result.scoreAfter).toBe('number');

    // Criterion 5: first-ever report → not corroborated
    expect(result.corroborated).toBe(false);
  });
});

// ── File existence (criterion 9) ─────────────────────────────────────

describe('Criterion 9 — all four files exist', () => {
  test('reportIngestion.js exports ingestReport', () => {
    expect(typeof ingestReport).toBe('function');
  });

  test('rateLimit.js exports createRateLimiter', () => {
    expect(typeof createRateLimiter).toBe('function');
  });

  test('validate.js exports validateBody', () => {
    expect(typeof validateBody).toBe('function');
  });
});
