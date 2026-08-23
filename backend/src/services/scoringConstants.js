/**
 * RFC-003 — Every constant the scoring engine uses, in one place.
 * Nothing here is hard-coded inside scoringEngine.js (criterion 9).
 */

/** Time bucket definitions: [name, startHour, endHour).
 *  Night wraps midnight: 21–06 means hour >= 21 OR hour < 6. */
export const TIME_BUCKETS = Object.freeze({
  morning: { start: 6, end: 11 },
  day:     { start: 11, end: 17 },
  evening: { start: 17, end: 21 },
  night:   { start: 21, end: 6 },   // wraps midnight
});

/** Match multiplier when report's bucket equals the query bucket. */
export const TIME_MATCH_SAME = 1.0;

/** Match multiplier when report's bucket differs from query bucket. */
export const TIME_MATCH_OTHER = 0.25;

/** Exponential decay rate per day: exp(-DECAY_LAMBDA * Δdays). */
export const DECAY_LAMBDA = 0.1;

/** Weight of the lighting component (0–100 → 0–W). */
export const W_LIGHTING = 40;

/** Weight of the foot-traffic component (0–100 → 0–W). */
export const W_FOOTTRAFFIC = 30;

/** Penalty scaling weight: incident penalty capped at 1 then * this. */
export const W_PENALTY_SCALE = 30;

/** Score at or above this is "safe enough"; below triggers the floor penalty. */
export const SAFE_THRESHOLD = 50;

/** How heavily the min-segment floor drags the route score down. */
export const FLOOR_ALPHA = 1.0;

/** Minimum distinct reporter_hash values inside the corroboration window
 *  for a report to receive full weight. */
export const CORROBORATION_MIN = 2;

/** Hours within which distinct reporters must appear for corroboration. */
export const CORROBORATION_WINDOW_H = 72;

/** Multiplier applied to uncorroborated reports (< CORROBORATION_MIN hashes). */
export const DAMPEN_UNCORROBORATED = 0.3;

/** Max reports scanned per cell+bucket combo (perf cap). */
export const MAX_REPORTS_PER_CELL_BUCKET = 100;

/** Band boundaries — green ≥ 70, yellow 40–69, red < 40. */
export const BAND_GREEN = 70;
export const BAND_YELLOW = 40;

/** In-memory cache TTL for getCellScores, in milliseconds. */
export const CACHE_TTL_MS = 60_000;
