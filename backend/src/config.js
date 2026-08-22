import 'dotenv/config';

/** Env vars that MUST be present for the service to boot (RFC-001 criterion 3). */
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'REPORT_HASH_SALT'];

/**
 * Pure validation - exported so tests can assert fail-fast behavior without
 * spawning a process (TEST_PLAN U-004). No side effects here by design
 * (RULES.md R-07 purity at the module boundary).
 *
 * @param {Record<string, string|undefined>} env
 * @returns {Readonly<{supabaseUrl:string, supabaseServiceKey:string, reportHashSalt:string, port:number, corsOrigin:string}>}
 */
export function validateConfig(env) {
  const missing = REQUIRED.filter((key) => !env[key] || String(env[key]).trim() === '');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return Object.freeze({
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY,
    reportHashSalt: env.REPORT_HASH_SALT,
    port: Number(env.PORT || 3000),
    corsOrigin: env.CORS_ORIGIN || '*',
  });
}

let cached;

/**
 * Lazily validated, memoized config. Called at server boot (server.js) so a
 * bad environment exits non-zero BEFORE listening; safe to import anywhere.
 */
export default function getConfig() {
  if (!cached) cached = validateConfig(process.env);
  return cached;
}
