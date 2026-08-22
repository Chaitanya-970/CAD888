import { createClient } from '@supabase/supabase-js';
import getConfig from '../config.js';

let client;

/** Lazy Supabase singleton (RFC-001 file map: src/db/supabase.js). */
export default function getSupabase() {
  if (!client) {
    const cfg = getConfig();
    client = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}
