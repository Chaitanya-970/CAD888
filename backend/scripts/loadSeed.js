import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getConfig from '../src/config.js';
import getSupabase from '../src/db/supabase.js';
import { encodeGeohash } from '../src/services/geoUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEEDS_PATH = path.join(__dirname, '..', 'src', 'db', 'seeds', 'incidents.json');

/**
 * RFC-001 seed loader (criterion 5).
 *
 * - Loads ANY incidents.json conforming to the fixture schema:
 *     segments: [{ center_lat, center_lng, lighting?, foot_traffic? }]
 *     reports:  [{ segment, severity, light_condition, note?, occurred_at, reporter_hash }]
 * - Cell ids are DERIVED from coordinates via encodeGeohash(p7), so a hand-edited
 *   dataset can never contain an invalid hash.
 * - Idempotent by fixture-scoped replace: reports whose reporter_hash appears in
 *   the fixture are deleted before insert. Production/Role-3 rows with other
 *   hashes are never touched. Re-running yields zero duplicates.
 */
async function main() {
  getConfig(); // fail fast on missing env before touching the DB

  const raw = JSON.parse(fs.readFileSync(SEEDS_PATH, 'utf8'));
  const segments = Array.isArray(raw.segments) ? raw.segments : [];
  const reports = Array.isArray(raw.reports) ? raw.reports : [];
  if (segments.length === 0) throw new Error('seed file must contain a non-empty "segments" array');

  const supabase = getSupabase();

  // 1. Upsert segments; PK derived from coordinates.
  const segmentRows = segments.map((s) => {
    if (typeof s.center_lat !== 'number' || typeof s.center_lng !== 'number') {
      throw new Error('each segment needs numeric center_lat and center_lng');
    }
    return {
      cell_geohash: encodeGeohash(s.center_lat, s.center_lng, 7),
      center_lat: s.center_lat,
      center_lng: s.center_lng,
      lighting: s.lighting ?? 50,
      foot_traffic: s.foot_traffic ?? 50,
    };
  });
  const { error: upsertErr } = await supabase
    .from('road_segments')
    .upsert(segmentRows, { onConflict: 'cell_geohash' });
  if (upsertErr) throw upsertErr;

  // 2. Map reports to derived cells.
  const reportRows = reports.map((r) => {
    const cell = segmentRows[r.segment]?.cell_geohash;
    if (!cell) throw new Error(`report references unknown segment index: ${r.segment}`);
    return {
      cell_geohash: cell,
      severity: r.severity,
      light_condition: r.light_condition,
      note: r.note ?? null,
      occurred_at: r.occurred_at,
      reporter_hash: r.reporter_hash,
    };
  });

  // 3. Fixture-scoped replace for idempotency.
  const fixtureHashes = [...new Set(reportRows.map((r) => r.reporter_hash))];
  const { error: deleteErr } = await supabase
    .from('incident_reports')
    .delete()
    .in('reporter_hash', fixtureHashes);
  if (deleteErr) throw deleteErr;

  if (reportRows.length > 0) {
    const { error: insertErr } = await supabase.from('incident_reports').insert(reportRows);
    if (insertErr) throw insertErr;
  }

  console.log(
    `[seed] upserted ${segmentRows.length} segments, inserted ${reportRows.length} reports ` +
      `(fixture-scoped replace on ${fixtureHashes.length} reporter hashes)`
  );
}

main().catch((err) => {
  console.error(`[seed] FAILED: ${err.message}`);
  process.exit(1);
});
