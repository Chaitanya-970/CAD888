import polyline from '@mapbox/polyline';
import getConfig from '../config.js';
import { ApiError } from '../middleware/errorHandler.js';
import { coordsToCells } from './geoUtils.js';

/**
 * OSRM routing client (RFC-002).
 *
 * - Builds request URLs ONLY from config-provided base URL + profile
 *   (RULES.md R-10). No API keys exist in the OSRM protocol (criterion 5).
 * - Exactly ONE retry on any failure (network error, timeout, HTTP >= 400,
 *   malformed payload), then ApiError('UPSTREAM_OSRM', 502) (criteria 3-4).
 * - Normalized route shape consumed later by RFC-004:
 *     { index, distanceM, durationS, coords: [[lat,lng],...] }
 */

const ALTERNATIVES = 3;

/**
 * Pure URL builder - exported for direct unit testing (U-010).
 * OSRM coordinate order is lng,lat.
 */
export function buildOsrmUrl(baseUrl, profile, origin, destination) {
  const coord = (p) => `${p.lng},${p.lat}`;
  const base = baseUrl.replace(/\/+$/, '');
  return (
    `${base}/route/v1/${profile}/${coord(origin)};${coord(destination)}` +
    `?alternatives=${ALTERNATIVES}&overview=full&geometries=polyline`
  );
}

/** Validate + map raw OSRM routes onto our normalized shape. */
function normalize(data) {
  if (!data || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error('malformed OSRM payload');
  }
  return data.routes.map((r, i) => ({
    index: i,
    distanceM: r.distance,
    durationS: r.duration,
    coords: polyline.decode(r.geometry), // precision-5 -> [[lat,lng],...]
  }));
}

/** Single attempt with hard timeout via AbortController. */
async function attemptOnce(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get up to 3 alternative routes between origin and destination.
 * @param {{lat:number,lng:number}} origin
 * @param {{lat:number,lng:number}} destination
 * @param {{timeoutMs?:number, fetchImpl?:Function}} [opts]
 *     timeoutMs  - per-call override of cfg.osrmTimeoutMs (used by tests)
 *     fetchImpl  - injectable fetch (production: globalThis.fetch; tests: fake)
 */
export async function getRoutes(origin, destination, { timeoutMs, fetchImpl } = {}) {
  const cfg = getConfig();
  const url = buildOsrmUrl(cfg.osrmBaseUrl, cfg.osrmProfile, origin, destination);
  const effectiveTimeout = timeoutMs ?? cfg.osrmTimeoutMs;
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);

  let lastErr;
  for (let tries = 0; tries < 2; tries++) {
    try {
      const data = await attemptOnce(url, effectiveTimeout, doFetch);
      return normalize(data);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new ApiError(
    'UPSTREAM_OSRM',
    502,
    `Routing service unavailable: ${lastErr && lastErr.message ? lastErr.message : 'unknown error'}`
  );
}

/** Ordered unique geohash-7 cell sequence for a normalized route (75m sampling). */
export function routeToCells(route) {
  return coordsToCells(route.coords, 75);
}
