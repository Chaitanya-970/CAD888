import { validateConfig } from '../src/config.js';

// TEST_PLAN U-004 - fail-fast config validation (pure function, no process spawn).

const BASE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_KEY: 'test-service-key',
  REPORT_HASH_SALT: 'test-salt',
};

describe('validateConfig (RFC-001 criterion 3)', () => {
  test('throws naming EVERY missing required variable', () => {
    expect(() => validateConfig({})).toThrow(/SUPABASE_URL, SUPABASE_SERVICE_KEY, REPORT_HASH_SALT/);
  });

  test('throws naming each single missing variable', () => {
    expect(() => validateConfig({ ...BASE_ENV, SUPABASE_URL: undefined })).toThrow(/SUPABASE_URL/);
    expect(() => validateConfig({ ...BASE_ENV, REPORT_HASH_SALT: '' })).toThrow(/REPORT_HASH_SALT/);
  });

  test('whitespace-only values count as missing', () => {
    expect(() => validateConfig({ ...BASE_ENV, SUPABASE_SERVICE_KEY: '   ' })).toThrow(
      /SUPABASE_SERVICE_KEY/
    );
  });

  test('valid env returns frozen config with defaults applied', () => {
    const cfg = validateConfig(BASE_ENV);
    expect(cfg).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseServiceKey: 'test-service-key',
      reportHashSalt: 'test-salt',
      port: 3000, // PORT omitted -> default
      corsOrigin: '*',
    });
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  test('PORT and CORS_ORIGIN are honored when provided', () => {
    const cfg = validateConfig({ ...BASE_ENV, PORT: '8080', CORS_ORIGIN: 'http://localhost:5173' });
    expect(cfg.port).toBe(8080);
    expect(cfg.corsOrigin).toBe('http://localhost:5173');
  });
});
