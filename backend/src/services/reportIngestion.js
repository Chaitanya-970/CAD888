/**
 * RFC-005 — Report Ingestion Service.
 *
 * Steps: anonymize → snap to cell → check cell exists → persist → rescore.
 * No raw IP ever stored (criterion 4). O(1) incremental rescore via
 * scoringEngine.updateCellScore (no full-graph rebuild).
 */

import { createHash } from 'node:crypto';
import getConfig from '../config.js';
import getSupabase from '../db/supabase.js';
import { encodeGeohash } from './geoUtils.js';
import { bucketOf, getCellScores, updateCellScore, _clearCache } from './scoringEngine.js';

/**
 * Hash an IP with the rotating deploy salt.
 * Never store or log the raw IP — only this hash goes to the DB.
 *
 * @param {string} ip
 * @param {object} [deps]
 * @param {string} [deps.salt]
 * @returns {string}
 */
export function anonymize(ip, deps = {}) {
  const salt = deps.salt || getConfig().reportHashSalt;
  return createHash('sha256').update(salt + ip).digest('hex');
}

/**
 * Snap lat/lng to a geohash-7 cell.
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
export function snapToCell(lat, lng) {
  return encodeGeohash(lat, lng, 7);
}

/**
 * Check that a cell exists in road_segments. Reject off-map spam.
 *
 * @param {string} cell
 * @param {object} [deps]
 * @param {function} [deps.getDb]
 * @returns {Promise<object>} the road_segments row
 * @throws {Error} with code NOT_FOUND if cell is not in the table
 */
export async function verifyCell(cell, deps = {}) {
  const getDb = deps.getDb || getSupabase;
  const db = getDb();
  const { data, error } = await db
    .from('road_segments')
    .select('cell_geohash, lighting, foot_traffic')
    .eq('cell_geohash', cell)
    .single();

  if (error || !data) {
    const err = new Error(`Cell ${cell} not found in road_segments`);
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return data;
}

/**
 * Count distinct reporter hashes for a cell within the corroboration window,
 * including the new report's hash.
 *
 * @param {string} cell
 * @param {string} reporterHash
 * @param {Date} occurredAt
 * @param {object} [deps]
 * @param {function} [deps.getDb]
 * @returns {Promise<boolean>} true if corroborated (>= 2 distinct hashes)
 */
export async function checkCorroboration(cell, reporterHash, occurredAt, deps = {}) {
  const getDb = deps.getDb || getSupabase;
  const db = getDb();
  const windowStart = new Date(occurredAt.getTime() - 72 * 3_600_000).toISOString();
  const windowEnd = new Date(occurredAt.getTime() + 72 * 3_600_000).toISOString();

  const { data, error } = await db
    .from('incident_reports')
    .select('reporter_hash')
    .eq('cell_geohash', cell)
    .gte('occurred_at', windowStart)
    .lte('occurred_at', windowEnd);

  if (error) throw error;

  const hashes = new Set((data || []).map((r) => r.reporter_hash));
  hashes.add(reporterHash); // include the new report being submitted
  return hashes.size >= 2;
}

/**
 * Full ingestion pipeline: anonymize → snap → verify → persist → rescore.
 *
 * @param {object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {number} params.severity
 * @param {string} params.lightCondition
 * @param {string} [params.note]
 * @param {Date} params.occurredAt
 * @param {string} params.ip - raw IP (never stored, only hashed)
 * @param {object} [deps] - injectable dependencies for testing
 * @param {function} [deps.getDb]
 * @param {string} [deps.salt]
 * @returns {Promise<object>} { reportId, cellGeohash, scoreBefore, scoreAfter, corroborated }
 */
export async function ingestReport(params, deps = {}) {
  const getDb = deps.getDb || getSupabase;
  const { lat, lng, severity, lightCondition, note, occurredAt, ip } = params;

  // Step 1: Anonymize
  const reporterHash = anonymize(ip, deps);

  // Step 2: Snap to geohash cell
  const cellGeohash = snapToCell(lat, lng);

  // Step 3: Verify cell exists in road_segments
  await verifyCell(cellGeohash, deps);

  // Step 4: Determine time bucket and get score BEFORE
  const bucket = bucketOf(occurredAt);
  const scoresBefore = await getCellScores([cellGeohash], bucket, deps);
  const scoreBefore = scoresBefore.get(cellGeohash) ?? 50;

  // Step 5: Persist the report
  const db = getDb();
  const { data: inserted, error: insertErr } = await db
    .from('incident_reports')
    .insert({
      cell_geohash: cellGeohash,
      severity,
      light_condition: lightCondition,
      note: note || null,
      occurred_at: occurredAt.toISOString(),
      reporter_hash: reporterHash,
    })
    .select('id')
    .single();

  if (insertErr) throw insertErr;

  // Step 6: Check corroboration (after insert so the new report is included)
  const corroborated = await checkCorroboration(cellGeohash, reporterHash, occurredAt, deps);

  // Step 7: Incrementally rescore the affected cell
  const scoreAfter = await updateCellScore(cellGeohash, bucket, deps);

  return {
    reportId: inserted.id,
    cellGeohash,
    scoreBefore,
    scoreAfter,
    corroborated,
  };
}
