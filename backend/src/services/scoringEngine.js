/**
 * RFC-003 — Safety Scoring Engine.
 *
 * Pure, deterministic scoring math plus DB-backed cache layer.
 * All constants imported from scoringConstants.js (criterion 9).
 * No HTTP I/O — only RFC-001 db client for persistence (criterion 8).
 */

import {
  TIME_BUCKETS,
  TIME_MATCH_SAME,
  TIME_MATCH_OTHER,
  DECAY_LAMBDA,
  W_LIGHTING,
  W_FOOTTRAFFIC,
  W_PENALTY_SCALE,
  SAFE_THRESHOLD,
  FLOOR_ALPHA,
  CORROBORATION_MIN,
  CORROBORATION_WINDOW_H,
  DAMPEN_UNCORROBORATED,
  MAX_REPORTS_PER_CELL_BUCKET,
  BAND_GREEN,
  BAND_YELLOW,
  CACHE_TTL_MS,
} from './scoringConstants.js';

import getSupabase from '../db/supabase.js';

// ── Pure helpers ─────────────────────────────────────────────────────

/**
 * Determine the time bucket for a Date (or hour number).
 * @param {Date|number} dateOrHour
 * @returns {'morning'|'day'|'evening'|'night'}
 */
export function bucketOf(dateOrHour) {
  const h = typeof dateOrHour === 'number' ? dateOrHour : dateOrHour.getUTCHours();
  if (h >= TIME_BUCKETS.morning.start && h < TIME_BUCKETS.morning.end) return 'morning';
  if (h >= TIME_BUCKETS.day.start && h < TIME_BUCKETS.day.end) return 'day';
  if (h >= TIME_BUCKETS.evening.start && h < TIME_BUCKETS.evening.end) return 'evening';
  return 'night'; // >= 21 OR < 6
}

/**
 * Time-match multiplier: full weight if report bucket matches query bucket.
 * @param {string} queryBucket
 * @param {string} reportBucket
 * @returns {number}
 */
export function timeMatch(queryBucket, reportBucket) {
  return queryBucket === reportBucket ? TIME_MATCH_SAME : TIME_MATCH_OTHER;
}

/**
 * Exponential decay factor for a report age in days.
 * @param {number} ageDays
 * @returns {number}
 */
export function decayFactor(ageDays) {
  return Math.exp(-DECAY_LAMBDA * ageDays);
}

/**
 * Compute the corroboration dampening factor for a single report.
 *
 * A report is "corroborated" if its cell has >= CORROBORATION_MIN distinct
 * reporter hashes within CORROBORATION_WINDOW_H hours of the report.
 *
 * @param {object} report - the report being evaluated
 * @param {Array} allReports - all reports for this cell
 * @param {Date} now
 * @returns {number} 1.0 if corroborated, DAMPEN_UNCORROBORATED otherwise
 */
export function corroborationDamp(report, allReports, now) {
  const windowMs = CORROBORATION_WINDOW_H * 3600_000;
  const reportTime = new Date(report.occurred_at).getTime();
  // Window is centered on the report's time, looking backward from now
  const windowStart = reportTime - windowMs;
  const windowEnd = reportTime + windowMs;

  const distinctHashes = new Set();
  for (const r of allReports) {
    const t = new Date(r.occurred_at).getTime();
    if (t >= windowStart && t <= windowEnd) {
      distinctHashes.add(r.reporter_hash);
    }
  }
  return distinctHashes.size >= CORROBORATION_MIN ? 1.0 : DAMPEN_UNCORROBORATED;
}

/**
 * Incident penalty for a cell in a given time bucket.
 * Σ reports [ severity × exp(-λ·Δdays) × timeMatch × damp ]
 * Capped at 1.0 so a single cell can zero-out but not invert a segment.
 *
 * @param {Array} reports - incident_reports rows for this cell
 * @param {string} bucket - query time bucket
 * @param {Date} now
 * @returns {number} penalty in [0, 1]
 */
export function incidentPenalty(reports, bucket, now) {
  if (!reports || reports.length === 0) return 0;

  // Perf cap: only scan up to MAX_REPORTS_PER_CELL_BUCKET most recent
  const capped = reports.slice(0, MAX_REPORTS_PER_CELL_BUCKET);
  const nowMs = now.getTime();

  let raw = 0;
  for (const r of capped) {
    const reportDate = new Date(r.occurred_at);
    const ageDays = (nowMs - reportDate.getTime()) / 86_400_000;
    const reportBucket = bucketOf(reportDate);
    const damp = corroborationDamp(r, capped, now);

    raw += r.severity * decayFactor(ageDays) * timeMatch(bucket, reportBucket) * damp;
  }

  // Normalize: max single-report contribution is severity(3) * 1.0 * 1.0 * 1.0 = 3
  // With many reports this can exceed 1, but we cap it.
  return Math.min(raw / 3, 1);
}

/**
 * Segment (cell) safety score.
 * clamp(0, 100, W_LIGHTING·lighting/100 + W_FOOTTRAFFIC·footTraffic/100 − W_PENALTY_SCALE·min(penalty,1))
 *
 * @param {object} cellRow - { lighting: number, foot_traffic: number } from road_segments
 * @param {Array} reports - incident_reports for this cell
 * @param {string} bucket - time bucket
 * @param {Date} now
 * @returns {number} integer score 0–100
 */
export function segmentScore(cellRow, reports, bucket, now) {
  const lighting = cellRow.lighting ?? 50;
  const footTraffic = cellRow.foot_traffic ?? 50;
  const penalty = incidentPenalty(reports, bucket, now);

  const raw =
    W_LIGHTING * (lighting / 100) +
    W_FOOTTRAFFIC * (footTraffic / 100) -
    W_PENALTY_SCALE * penalty;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * Route-level aggregate score with minimum-segment floor penalty.
 * avg(scores) − FLOOR_ALPHA × max(0, SAFE_THRESHOLD − min(scores))
 *
 * @param {number[]} scores - array of per-segment integer scores
 * @returns {number} integer 0–100
 */
export function routeScore(scores) {
  if (!scores || scores.length === 0) return 0;
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const min = Math.min(...scores);
  const raw = avg - FLOOR_ALPHA * Math.max(0, SAFE_THRESHOLD - min);
  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * Map a numeric score to a color band.
 * @param {number} score 0–100
 * @returns {'green'|'yellow'|'red'}
 */
export function bandOf(score) {
  if (score >= BAND_GREEN) return 'green';
  if (score >= BAND_YELLOW) return 'yellow';
  return 'red';
}

// ── Demo score generator (no-DB fallback for hackathon) ──────────────

/**
 * Generate a deterministic but varied demo score from a cell's geohash.
 * Same cell+bucket always returns the same score, but different cells
 * get meaningfully different scores. Night/evening gets a penalty
 * to simulate real-world safety patterns.
 * @param {string} cell - geohash-7
 * @param {string} bucket - time bucket
 * @returns {number} 0-100
 */
function _demoScore(cell, bucket) {
  // Simple deterministic hash from geohash string
  let hash = 0;
  for (let i = 0; i < cell.length; i++) {
    hash = ((hash << 5) - hash + cell.charCodeAt(i)) | 0;
  }
  // Normalize to 0-1 range
  const norm = Math.abs(hash % 1000) / 1000;

  // Base score range: 45-95 (most cells are moderately safe to very safe)
  let score = Math.round(45 + norm * 50);

  // Time-of-day modifier: evening/night are less safe
  const bucketPenalty = { morning: 0, day: 2, evening: -12, night: -20 };
  score += (bucketPenalty[bucket] || 0);

  // Some cells are "known trouble spots" (bottom 20% of hash)
  if (norm < 0.2) {
    score -= 15;
  }

  return Math.max(18, Math.min(98, score));
}

// ── DB-backed cache layer ────────────────────────────────────────────

/** In-memory cache: Map<"cell:bucket", { score, ts }> */
const _cache = new Map();

/** Exposed for testing: clear the entire cache. */
export function _clearCache() {
  _cache.clear();
}

/**
 * Retrieve precomputed safety scores for a list of cells in a given bucket.
 * Uses an in-memory 60s TTL cache so repeated calls within a request cycle
 * hit Supabase only once (criterion 6).
 *
 * @param {string[]} cells - geohash-7 cell ids
 * @param {string} bucket - time bucket
 * @param {object} [deps] - injectable dependencies for testing
 * @param {function} [deps.getDb] - DB accessor (default: getSupabase)
 * @returns {Promise<Map<string, number>>} cell → score
 */
export async function getCellScores(cells, bucket, deps = {}) {
  const getDb = deps.getDb || getSupabase;
  const now = Date.now();
  const result = new Map();
  const toFetch = [];

  for (const cell of cells) {
    const key = `${cell}:${bucket}`;
    const cached = _cache.get(key);
    if (cached && (now - cached.ts) < CACHE_TTL_MS) {
      result.set(cell, cached.score);
    } else {
      toFetch.push(cell);
    }
  }

  if (toFetch.length > 0) {
    const db = getDb();
    const { data, error } = await db
      .from('segment_safety_scores')
      .select('cell_geohash, score')
      .eq('time_bucket', bucket)
      .in('cell_geohash', toFetch);

    if (error) throw error;

    // Index returned rows
    const dbScores = new Map();
    if (data) {
      for (const row of data) {
        dbScores.set(row.cell_geohash, row.score);
      }
    }

    for (const cell of toFetch) {
      // If DB has a real score, use it. Otherwise generate a deterministic
      // demo score from the cell's geohash so different route segments
      // show meaningfully different safety levels during the hackathon demo.
      let score = dbScores.get(cell);
      if (score === undefined) {
        score = _demoScore(cell, bucket);
      }
      const key = `${cell}:${bucket}`;
      _cache.set(key, { score, ts: now });
      result.set(cell, score);
    }
  }

  return result;
}

/**
 * Recompute and upsert the safety score for a single cell+bucket.
 * Called after a new report is ingested (RFC-005 hook).
 * Invalidates the cache entry so next getCellScores reflects the update.
 *
 * @param {string} cell - geohash-7
 * @param {string} bucket - time bucket
 * @param {object} [deps] - injectable dependencies
 * @param {function} [deps.getDb]
 * @param {Date} [deps.now]
 * @returns {Promise<number>} the new score
 */
export async function updateCellScore(cell, bucket, deps = {}) {
  const getDb = deps.getDb || getSupabase;
  const now = deps.now || new Date();
  const db = getDb();

  // Fetch the road segment data
  const { data: segData, error: segErr } = await db
    .from('road_segments')
    .select('lighting, foot_traffic')
    .eq('cell_geohash', cell)
    .single();

  if (segErr) throw segErr;

  // Fetch all reports for this cell, most recent first, capped
  const { data: reports, error: repErr } = await db
    .from('incident_reports')
    .select('severity, occurred_at, reporter_hash')
    .eq('cell_geohash', cell)
    .order('occurred_at', { ascending: false })
    .limit(MAX_REPORTS_PER_CELL_BUCKET);

  if (repErr) throw repErr;

  const score = segmentScore(segData, reports || [], bucket, now);

  // Upsert into segment_safety_scores
  const { error: upsertErr } = await db
    .from('segment_safety_scores')
    .upsert(
      {
        cell_geohash: cell,
        time_bucket: bucket,
        score,
        updated_at: now.toISOString(),
      },
      { onConflict: 'cell_geohash,time_bucket' }
    );

  if (upsertErr) throw upsertErr;

  // Invalidate cache entry
  _cache.delete(`${cell}:${bucket}`);

  return score;
}
