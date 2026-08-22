import ngeohash from 'ngeohash';
import polyline from '@mapbox/polyline';

const EARTH_RADIUS_M = 6371000;

/**
 * Pure geospatial utilities - ZERO I/O by rule (RULES.md R-07).
 * Everything later RFCs (002/003/005) import for path->cell mapping lives here.
 */

/** Encode lat/lng to a geohash cell id. Default precision 7 (~150m cells). */
export function encodeGeohash(lat, lng, precision = 7) {
  return ngeohash.encode(lat, lng, precision);
}

/** Decode a geohash cell to its center point {lat, lng}. */
export function decodeGeohash(hash) {
  const decoded = ngeohash.decode(hash);
  return { lat: decoded.latitude, lng: decoded.longitude };
}

/** Decode an encoded polyline string into [[lat, lng], ...] (RFC-002 consumes). */
export function decodePolyline(str, precision = 5) {
  return polyline.decode(str, precision);
}

/** Great-circle distance in meters between two [lat, lng] points. */
export function haversineMeters([lat1, lng1], [lat2, lng2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Walk a coordinate path and emit a point roughly every `stepMeters`
 * (interpolated linearly on lat/lng - valid at this scale).
 * Always includes the first point; RFC-001 criterion 7: 1km line @75m -> >=13 points.
 *
 * @param {Array<[number, number]>} coords [[lat, lng], ...]
 * @param {number} stepMeters
 * @returns {Array<[number, number]>}
 */
export function samplePath(coords, stepMeters = 75) {
  if (!Array.isArray(coords) || coords.length === 0) return [];
  const out = [[coords[0][0], coords[0][1]]];
  let sinceLast = 0;
  for (let i = 1; i < coords.length; i++) {
    let [lat1, lng1] = out[out.length - 1];
    const [lat2, lng2] = coords[i];
    let remaining = haversineMeters([lat1, lng1], [lat2, lng2]);
    while (sinceLast + remaining >= stepMeters) {
      const t = (stepMeters - sinceLast) / remaining;
      lat1 = lat1 + (lat2 - lat1) * t;
      lng1 = lng1 + (lng2 - lng1) * t;
      out.push([lat1, lng1]);
      remaining = haversineMeters([lat1, lng1], [lat2, lng2]);
      sinceLast = 0;
    }
    sinceLast += remaining;
  }
  return out;
}

/**
 * Convert a coordinate path to the ordered sequence of unique geohash-7 cells
 * it passes through (RFC-001 criterion 6). Order preservation matters:
 * RFC-004 returns cells as an ordered route summary.
 *
 * @param {Array<[number, number]>} coords
 * @param {number} stepMeters
 * @returns {string[]}
 */
export function coordsToCells(coords, stepMeters = 75) {
  const seen = new Set();
  const cells = [];
  for (const [lat, lng] of samplePath(coords, stepMeters)) {
    const cell = encodeGeohash(lat, lng, 7);
    if (!seen.has(cell)) {
      seen.add(cell);
      cells.push(cell);
    }
  }
  return cells;
}
