// RFC-002 tests (TEST_PLAN U-006..U-010).
//
// MOCKING STRATEGY NOTE (documented deviation from the RFC's "nock fixtures"):
// nock cannot intercept Node 20's native fetch (undici). The client therefore
// accepts an injectable `fetchImpl` (production path: globalThis.fetch), and
// these tests supply a fake fetch double - zero network, zero extra
// dependencies (RULES.md R-02). The behavior asserted is identical to the
// RFC's intent: normalization shape, ordered cells, exactly-one-retry,
// UPSTREAM_OSRM(502) mapping, key-free URLs.

import { buildOsrmUrl, getRoutes, routeToCells } from '../src/services/osrmClient.js';
import { coordsToCells } from '../src/services/geoUtils.js';
import polyline from '@mapbox/polyline';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
process.env.REPORT_HASH_SALT = process.env.REPORT_HASH_SALT || 'test-salt';

const ORIGIN = { lat: 12.97, lng: 77.59 };
const DEST = { lat: 12.98, lng: 77.6 };

/** Build an OSRM-shaped response body from plain coordinate paths. */
function osrmBody(routeCoordsList) {
  return {
    code: 'Ok',
    routes: routeCoordsList.map((coords, i) => ({
      distance: 1000 + i * 250,
      duration: 600 + i * 120,
      geometry: polyline.encode(coords),
    })),
  };
}

/** Minimal Response double. */
function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Fake fetch that records every call. */
function recordingFetch(responderFactory) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return responderFactory(calls.length);
  };
  return { fn, calls };
}

describe('osrmClient (RFC-002)', () => {
  describe('buildOsrmUrl (U-010)', () => {
    test('builds key-free OSRM URL with lng,lat order and strips trailing slash', () => {
      const url = buildOsrmUrl('https://x.example.com/', 'foot', ORIGIN, DEST);
      expect(url).toBe(
        'https://x.example.com/route/v1/foot/77.59,12.97;77.6,12.98' +
          '?alternatives=3&overview=full&geometries=polyline'
      );
    });

    test('contains no API key material and honors profile substitution', () => {
      const url = buildOsrmUrl('https://x.example.com', 'driving', ORIGIN, DEST);
      expect(url).toContain('/route/v1/driving/');
      expect(/key|token|api[_-]?key/i.test(url)).toBe(false);
    });
  });

  describe('getRoutes happy paths (U-006)', () => {
    const routeA = [
      [12.97, 77.59],
      [12.975, 77.595],
      [12.98, 77.6],
    ];
    const routeB = [
      [12.97, 77.59],
      [12.978, 77.592],
      [12.98, 77.6],
    ];

    test('normalizes 2 alternatives with decoded coordinate arrays', async () => {
      const { fn, calls } = recordingFetch(() => jsonResponse(osrmBody([routeA, routeB])));
      const routes = await getRoutes(ORIGIN, DEST, { fetchImpl: fn, timeoutMs: 200 });

      expect(routes).toHaveLength(2);
      expect(routes.map((r) => r.index)).toEqual([0, 1]);
      expect(routes[0].distanceM).toBe(1000);
      expect(routes[1].durationS).toBe(720);
      expect(routes[0].coords).toEqual(routeA);
      expect(routes[1].coords).toEqual(routeB);

      // URL came from default config base/profile.
      expect(calls[0].url).toContain('https://router.project-osrm.org/route/v1/foot/');
    });

    test('falls back cleanly when OSRM returns only one route', async () => {
      const { fn } = recordingFetch(() => jsonResponse(osrmBody([routeA])));
      const routes = await getRoutes(ORIGIN, DEST, { fetchImpl: fn, timeoutMs: 200 });
      expect(routes).toHaveLength(1);
      expect(routes[0].coords).toEqual(routeA);
    });
  });

  describe('routeToCells (U-007)', () => {
    test('returns unique, order-preserving geohash-7 cells', () => {
      // Dense zig-zag inside one cell + a longer leg crossing others.
      const coords = [];
      for (let i = 0; i <= 60; i++) {
        coords.push([12.9716 + (i % 2) * 0.00004, 77.5946 + i * 0.00001]);
      }
      for (let i = 0; i <= 100; i++) coords.push([12.98 + i * 0.00009, 77.6]);
      const route = { index: 0, distanceM: 1100, durationS: 800, coords };

      const cells = routeToCells(route);
      expect(new Set(cells).size).toBe(cells.length);
      expect(cells).toEqual(coordsToCells(coords, 75));
    });
  });

  describe('failure handling - exactly one retry then UPSTREAM_OSRM(502) (U-008)', () => {
    test('network errors: retried once, then ApiError UPSTREAM_OSRM', async () => {
      let calls = 0;
      const fn = async () => {
        calls++;
        throw new Error('ECONNREFUSED');
      };
      await expect(getRoutes(ORIGIN, DEST, { fetchImpl: fn, timeoutMs: 200 })).rejects.toMatchObject({
        code: 'UPSTREAM_OSRM',
        status: 502,
      });
      expect(calls).toBe(2); // initial attempt + exactly 1 retry
    });

    test('HTTP 500 responses: retried once, then ApiError UPSTREAM_OSRM', async () => {
      let calls = 0;
      const fn = async () => {
        calls++;
        return jsonResponse({ code: 'InternalError' }, 500);
      };
      await expect(getRoutes(ORIGIN, DEST, { fetchImpl: fn, timeoutMs: 200 })).rejects.toMatchObject({
        code: 'UPSTREAM_OSRM',
        status: 502,
      });
      expect(calls).toBe(2);
    });

    test('timeout aborts the request and maps to UPSTREAM_OSRM after retry', async () => {
      let calls = 0;
      const hangingFetch = (_url, opts = {}) =>
        new Promise((_resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('never resolves')), 5000);
          if (opts.signal) {
            opts.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
          calls++; // reached the point of being in-flight
        });

      await expect(
        getRoutes(ORIGIN, DEST, { fetchImpl: hangingFetch, timeoutMs: 40 })
      ).rejects.toMatchObject({ code: 'UPSTREAM_OSRM', status: 502 });
      expect(calls).toBe(2);
    });
  });

  describe('malformed payloads -> UPSTREAM_OSRM without crashing (U-009)', () => {
    test('empty object body', async () => {
      const { fn } = recordingFetch(() => jsonResponse({}));
      await expect(getRoutes(ORIGIN, DEST, { fetchImpl: fn, timeoutMs: 200 })).rejects.toMatchObject({
        code: 'UPSTREAM_OSRM',
      });
    });

    test('routes array present but empty', async () => {
      const { fn } = recordingFetch(() => jsonResponse({ code: 'Ok', routes: [] }));
      await expect(getRoutes(ORIGIN, DEST, { fetchImpl: fn, timeoutMs: 200 })).rejects.toMatchObject({
        code: 'UPSTREAM_OSRM',
      });
    });

    test('non-JSON response body', async () => {
      const fn = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON');
        },
      });
      await expect(getRoutes(ORIGIN, DEST, { fetchImpl: fn, timeoutMs: 200 })).rejects.toMatchObject({
        code: 'UPSTREAM_OSRM',
      });
    });
  });
});
