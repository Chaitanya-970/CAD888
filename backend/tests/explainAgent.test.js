/**
 * Role 3 bridge tests — signal building, JS renderer grounding, and the
 * additive provider registration.
 */

import { jest } from '@jest/globals';

import {
  buildSignals,
  renderExplanationJs,
  worstCellOf,
  explainRoute,
} from '../src/services/explainAgent.js';
import {
  buildExplainContext,
  registerExplainProvider,
  _clearMicroCache,
} from '../src/services/explainContext.js';
import { registerSafetyAgent } from '../src/agent/register.js';
import { _clearCache } from '../src/services/scoringEngine.js';

function makeDb({ segment = null, reports = [] } = {}) {
  return {
    from: jest.fn((table) => {
      if (table === 'road_segments') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: segment ? [segment] : [], error: null }),
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: segment, error: null }),
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

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

describe('worstCellOf', () => {
  test('picks the lowest-scoring cell', () => {
    const map = new Map([['aaa', 80], ['bbb', 31], ['ccc', 55]]);
    expect(worstCellOf(['aaa', 'bbb', 'ccc'], map)).toEqual({ cell: 'bbb', score: 31 });
  });
});

describe('buildSignals', () => {
  test('matches the signal_contract.py shape', async () => {
    const db = makeDb({
      segment: { lighting: 30, foot_traffic: 25 },
      reports: [
        { severity: 2, light_condition: 'unlit', note: 'Street light out.', occurred_at: daysAgo(3), reporter_hash: 'h1' },
        { severity: 3, light_condition: 'unlit', note: 'Very dark here.', occurred_at: daysAgo(9), reporter_hash: 'h2' },
      ],
    });

    const s = await buildSignals(
      { cell: 'tdr1xyz', score: 38, bucket: 'night', routeLabel: 'Fastest' },
      { getDb: () => db }
    );

    expect(Object.keys(s).sort()).toEqual([
      'corroborated', 'foot_traffic', 'incident_summary', 'lighting',
      'route_label', 'safety_score', 'segment_id', 'time_bucket',
    ]);
    expect(s.lighting).toBe(30);
    expect(s.incident_summary[0].count).toBe(2);
    expect(s.incident_summary[0].light_condition_mode).toBe('unlit');
    expect(s.incident_summary[0].severity_avg).toBe(2.5);
    expect(s.corroborated).toBe(true); // two distinct reporter hashes
  });

  test('single reporter is not corroborated', async () => {
    const db = makeDb({
      segment: { lighting: 60, foot_traffic: 55 },
      reports: [
        { severity: 1, light_condition: 'unknown', note: 'Felt uneasy.', occurred_at: daysAgo(5), reporter_hash: 'h1' },
      ],
    });
    const s = await buildSignals({ cell: 'x', score: 64, bucket: 'evening' }, { getDb: () => db });
    expect(s.corroborated).toBe(false);
    expect(s.incident_summary[0].count).toBe(1);
  });

  test('no reports → empty incident_summary, never fabricated', async () => {
    const db = makeDb({ segment: { lighting: 85, foot_traffic: 80 }, reports: [] });
    const s = await buildSignals({ cell: 'x', score: 88, bucket: 'night' }, { getDb: () => db });
    expect(s.incident_summary).toEqual([]);
    expect(s.corroborated).toBe(false);
  });
});

describe('renderExplanationJs grounding', () => {
  const CATEGORY_WORDS = [
    'harassment', 'theft', 'stalking', 'assault', 'catcalling',
    'robbery', 'kidnapping', 'mugging', 'molestation',
  ];

  test('never invents an incident category', () => {
    const text = renderExplanationJs({
      segment_id: 'x', route_label: 'Fastest', time_bucket: 'night', safety_score: 32,
      lighting: 20, foot_traffic: 15, corroborated: true,
      incident_summary: [{ count: 3, most_recent_days_ago: 4, severity_avg: 2.3, light_condition_mode: 'unlit', sample_notes: [] }],
    }).toLowerCase();
    for (const w of CATEGORY_WORDS) expect(text).not.toContain(w);
  });

  test('claims no incidents when there are none', () => {
    const text = renderExplanationJs({
      segment_id: 'x', route_label: 'Safest', time_bucket: 'night', safety_score: 88,
      lighting: 85, foot_traffic: 80, corroborated: false, incident_summary: [],
    }).toLowerCase();
    expect(text).not.toContain('report');
    expect(text).toContain('well lit');
  });

  test('uncorroborated report is phrased as single and unconfirmed', () => {
    const text = renderExplanationJs({
      segment_id: 'x', route_label: 'Balanced', time_bucket: 'evening', safety_score: 64,
      lighting: 50, foot_traffic: 55, corroborated: false,
      incident_summary: [{ count: 1, most_recent_days_ago: 5, severity_avg: 1, light_condition_mode: 'unknown', sample_notes: [] }],
    }).toLowerCase();
    expect(text).toContain('unconfirmed');
    expect(text).not.toContain('repeated');
  });
});

describe('explainRoute', () => {
  test('returns an explanation in js mode', async () => {
    const db = makeDb({ segment: { lighting: 30, foot_traffic: 20 }, reports: [] });
    const out = await explainRoute({ cell: 'x', score: 41, bucket: 'night' }, { getDb: () => db });
    expect(out.mode).toBe('js');
    expect(typeof out.explanation).toBe('string');
    expect(out.explanation.length).toBeGreaterThan(10);
  });
});

describe('http mode', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.EXPLAIN_AGENT_MODE;
    delete process.env.EXPLAIN_AGENT_URL;
  });

  test('uses the deployed agent when it answers', async () => {
    process.env.EXPLAIN_AGENT_MODE = 'http';
    process.env.EXPLAIN_AGENT_URL = 'https://agent.example/api';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ explanation: 'Remote agent says this block is dark.' }),
    });

    const db = makeDb({ segment: { lighting: 30, foot_traffic: 20 }, reports: [] });
    const out = await explainRoute({ cell: 'x', score: 41, bucket: 'night' }, { getDb: () => db });

    expect(out.explanation).toBe('Remote agent says this block is dark.');
    expect(out.mode).toBe('http');
  });

  test('falls back to the local renderer when the agent is down', async () => {
    process.env.EXPLAIN_AGENT_MODE = 'http';
    process.env.EXPLAIN_AGENT_URL = 'https://agent.example/api';
    global.fetch = jest.fn().mockRejectedValue(new Error('cold start timeout'));

    const db = makeDb({ segment: { lighting: 30, foot_traffic: 20 }, reports: [] });
    const out = await explainRoute({ cell: 'x', score: 41, bucket: 'night' }, { getDb: () => db });

    expect(out.mode).toBe('http-fallback-js');
    expect(out.explanation.length).toBeGreaterThan(10);
  });
});

describe('agent registration is additive', () => {
  afterEach(() => {
    registerExplainProvider(null);
    delete process.env.EXPLAIN_AGENT_ENABLED;
    _clearMicroCache();
    _clearCache();
  });

  test('adds explanation without altering the base contract', async () => {
    process.env.EXPLAIN_AGENT_ENABLED = 'true';
    expect(registerSafetyAgent()).toBe(true);

    const db = makeDb({ segment: { lighting: 25, foot_traffic: 30 }, reports: [] });
    const result = await buildExplainContext(
      {
        origin: { lat: 12.97, lng: 77.59 },
        destination: { lat: 12.98, lng: 77.6 },
        time: new Date('2026-08-22T23:00:00Z'),
        routeIndex: 0,
      },
      {
        getDb: () => db,
        fetchRoutes: async () => [
          { index: 0, distanceM: 1000, durationS: 800, coords: [[12.97, 77.59], [12.98, 77.6]] },
        ],
      }
    );

    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('band');
    expect(result).toHaveProperty('factors');
    expect(result).toHaveProperty('disclaimer');
    expect(result).toHaveProperty('explanation');
    expect(result.explanationSource).toBe('js');
  });

  test('is a no-op when disabled', () => {
    process.env.EXPLAIN_AGENT_ENABLED = 'false';
    expect(registerSafetyAgent()).toBe(false);
  });
});
