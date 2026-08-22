import {
  encodeGeohash,
  decodeGeohash,
  samplePath,
  coordsToCells,
  haversineMeters,
} from '../src/services/geoUtils.js';

// TEST_PLAN U-001..U-003 (+ U-007-style ordering guarantees).

describe('geoUtils (RFC-001)', () => {
  describe('encodeGeohash / decodeGeohash round-trip (U-001)', () => {
    const points = [
      [12.9716, 77.5946],
      [12.9352, 77.6245],
      [40.7128, -74.006],
      [-33.8688, 151.2093],
      [0.5, 0.5],
    ];

    test.each(points.map((p) => [p[0], p[1]]))(
      'round-trips (%f, %f) within half-diagonal of a p7 cell (<=110m)',
      (lat, lng) => {
        const hash = encodeGeohash(lat, lng, 7);
        expect(typeof hash).toBe('string');
        expect(hash).toHaveLength(7);
        const decoded = decodeGeohash(hash);
        const drift = haversineMeters([lat, lng], [decoded.lat, decoded.lng]);
        // decode() returns the CELL CENTER. A p7 cell is ~152m x 152m, so the
        // worst-case point->center distance is the half-diagonal ~108m.
        // (Spec corrected 2026-08-22: original "~19m" bound was a derivation
        // error in the RFC, not a library fault - see RFC-001 criterion 6.)
        expect(drift).toBeLessThanOrEqual(110);
      }
    );
  });

  describe('samplePath (U-002)', () => {
    test('emits >=13 points for a 1km straight line at 75m step', () => {
      // ~1000m of latitude at Bengaluru (0.009 deg lat ~= 1000m).
      const line = [];
      for (let i = 0; i <= 100; i++) line.push([12.97 + i * 0.00009, 77.59]);
      const sampled = samplePath(line, 75);
      expect(sampled.length).toBeGreaterThanOrEqual(13);
      expect(sampled[0]).toEqual([12.97, 77.59]);
    });

    test('returns [] for empty input and single point for tiny paths', () => {
      expect(samplePath([], 75)).toEqual([]);
      expect(samplePath([[12.97, 77.59]], 75)).toHaveLength(1);
    });
  });

  describe('coordsToCells (U-003)', () => {
    test('returns unique cells in first-occurrence order', () => {
      // Dense zig-zag inside one cell forces duplicate encodings.
      const wobble = [];
      for (let i = 0; i <= 60; i++) {
        wobble.push([12.9716 + (i % 2) * 0.00004, 77.5946 + i * 0.00001]);
      }
      const cells = coordsToCells(wobble, 75);
      expect(new Set(cells).size).toBe(cells.length); // unique
      // Order preserved: re-encoding sampled points reproduces the sequence.
      const resampled = samplePath(wobble, 75)
        .map(([lat, lng]) => encodeGeohash(lat, lng, 7));
      const expectedOrder = [...new Set(resampled)];
      expect(cells).toEqual(expectedOrder);
    });

    test('a 1km line crosses multiple distinct cells', () => {
      const line = [];
      for (let i = 0; i <= 100; i++) line.push([12.97 + i * 0.00009, 77.59]);
      const cells = coordsToCells(line, 75);
      expect(cells.length).toBeGreaterThan(1);
    });
  });
});
