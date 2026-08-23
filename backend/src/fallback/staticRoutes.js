/**
 * RFC-007 — Static Route Fallback.
 *
 * When OSRM fails, returns pre-scored static routes for the demo to prevent
 * full system failure during live presentations.
 * Always explicitly labels the output to prevent silent mixing of live/static data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getConfig from '../config.js';
import { haversineMeters } from '../services/geoUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let staticData = null;

/** Load static routes from disk lazily. */
function getStaticData() {
  if (!staticData) {
    try {
      const p = path.join(__dirname, 'data', 'demo-routes.json');
      const raw = fs.readFileSync(p, 'utf8');
      staticData = JSON.parse(raw);
    } catch (err) {
      // If we can't load the fallback, return an empty structure so we don't crash
      staticData = { day: [], night: [], morning: [], evening: [] };
    }
  }
  return staticData;
}

/**
 * Retrieve the best matching static route set for a given origin and time bucket.
 * Matches purely by origin proximity (nearest neighbor).
 *
 * @param {object} origin {lat, lng}
 * @param {string} bucket 'morning'|'day'|'evening'|'night'
 * @param {object} [deps] Injectable test deps
 * @returns {object|null} The fallback route set, or null if fallback is disabled/empty
 */
export function getFallbackRoutes(origin, bucket, deps = {}) {
  const getCfg = deps.getConfig || getConfig;
  const cfg = getCfg();
  if (!cfg.staticFallbackEnabled) return null;

  const data = getStaticData();
  // Map morning/evening to day if missing in our minimal demo dataset
  const targetBucket = data[bucket] ? bucket : (data['day'] ? 'day' : null);
  if (!targetBucket) return null;

  const options = data[targetBucket];
  if (!options || options.length === 0) return null;

  // Find nearest by origin
  let best = options[0];
  let minDistance = Infinity;

  for (const opt of options) {
    const dist = haversineMeters(
      [origin.lat, origin.lng],
      [opt.originLat, opt.originLng]
    );
    if (dist < minDistance) {
      minDistance = dist;
      best = opt;
    }
  }

  // Ensure generatedAt is fresh so clients don't think it's stale
  return {
    routes: best.routes,
    dataSource: 'static-fallback',
    generatedAt: new Date().toISOString(),
  };
}
