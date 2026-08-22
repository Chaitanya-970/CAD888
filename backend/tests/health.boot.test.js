import request from 'supertest';

// TEST_PLAN I-003 (/health), U-005 (error shape), plus boot-wiring checks for
// server.js and the Supabase singleton.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
process.env.REPORT_HASH_SALT = process.env.REPORT_HASH_SALT || 'test-salt';
process.env.PORT = process.env.PORT || '0';

const { createApp } = await import('../src/server.js');
const { errorHandler, ApiError, notFoundHandler } = await import(
  '../src/middleware/errorHandler.js'
);
const getSupabase = (await import('../src/db/supabase.js')).default;

/** Minimal mock response capturing status/json for direct middleware calls. */
function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

describe('boot & HTTP layer (RFC-001)', () => {
  test('GET /health returns 200 {status:"ok"} (I-003 / criterion 2)', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  test('unknown route -> 404 JSON in project error dialect', async () => {
    const res = await request(createApp()).get('/definitely/not/a/route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.stringContaining('/definitely/not/a/route') },
    });
  });

  test('notFoundHandler unit: emits NOT_FOUND dialect (U-005 family)', () => {
    const res = mockRes();
    notFoundHandler({ method: 'POST', originalUrl: '/x' }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('errorHandler maps ApiError to its own code/status (U-005)', () => {
    const res = mockRes();
    errorHandler(new ApiError('RATE_LIMITED', 429, 'slow down'), {}, res, () => {});
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: { code: 'RATE_LIMITED', message: 'slow down' } });
  });

  test('errorHandler hides internals on unknown errors -> INTERNAL 500, no stack (criterion 8)', () => {
    const res = mockRes();
    const secret = new Error('DB password is hunter2 at 10.0.0.1');
    errorHandler(secret, {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|10\.0\.0\.1/);
    expect(JSON.stringify(res.body)).not.toMatch(/at /); // no stack frames
  });

  test('getSupabase returns a memoized singleton', () => {
    expect(getSupabase()).toBe(getSupabase());
  });
});
