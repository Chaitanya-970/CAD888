import { Router } from 'express';
import getSupabase from '../db/supabase.js';
import { getRoutes } from '../services/osrmClient.js';

const router = Router();

/** Liveness probe (RFC-001 criterion 2). Deep readiness comes later in RFC-007. */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/** Readiness probe (RFC-007). Checks Supabase and OSRM reachability. */
router.get('/ready', async (req, res) => {
  const getDb = req._testDeps?.getDb || getSupabase;
  const db = getDb();
  
  let supabaseStatus = 'ok';
  try {
    // Select 1 to test DB reachability
    const { error } = await db.from('road_segments').select('cell_geohash').limit(1);
    if (error) supabaseStatus = 'fail';
  } catch (err) {
    supabaseStatus = 'fail';
  }

  let osrmStatus = 'ok';
  try {
    const origin = { lat: 12.97, lng: 77.59 };
    const dest = { lat: 12.98, lng: 77.60 };
    if (req._testDeps?.fetchRoutes) {
      await req._testDeps.fetchRoutes(origin, dest);
    } else {
      await getRoutes(origin, dest, { timeoutMs: 1000 });
    }
  } catch (err) {
    osrmStatus = 'fail';
  }

  const code = supabaseStatus === 'ok' ? 200 : 503;
  res.status(code).json({
    supabase: supabaseStatus,
    osrm: osrmStatus
  });
});

export default router;
