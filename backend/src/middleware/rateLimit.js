/**
 * RFC-005 — Sliding-window rate limiter middleware.
 *
 * In-memory, keyed by a caller-supplied key function.
 * Default: max 3 requests per hour per key.
 * Emits RATE_LIMITED(429) when exceeded.
 *
 * Also exported: createGlobalLimiter for RFC-007.
 */

import { ApiError } from './errorHandler.js';

/**
 * Create a sliding-window rate limiter middleware.
 *
 * @param {object} opts
 * @param {(req: import('express').Request) => string} opts.keyFn - extracts the rate-limit key from the request
 * @param {number} [opts.maxRequests=3] - max requests per window
 * @param {number} [opts.windowMs=3600000] - window duration in ms (default 1 hour)
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({ keyFn, maxRequests = 3, windowMs = 3_600_000 } = {}) {
  /** @type {Map<string, number[]>} key → sorted array of timestamps */
  const windows = new Map();

  // Periodic cleanup to prevent memory leaks (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of windows) {
      const filtered = timestamps.filter((t) => t > cutoff);
      if (filtered.length === 0) {
        windows.delete(key);
      } else {
        windows.set(key, filtered);
      }
    }
  }, 5 * 60_000);

  // Allow Node to exit even if the interval is still running
  if (cleanupInterval.unref) cleanupInterval.unref();

  /** The actual middleware. */
  return (req, _res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const cutoff = now - windowMs;

    // Get or create the sliding window for this key
    let timestamps = windows.get(key) || [];
    // Evict expired entries
    timestamps = timestamps.filter((t) => t > cutoff);

    if (timestamps.length >= maxRequests) {
      throw new ApiError(
        'RATE_LIMITED',
        429,
        `Rate limit exceeded: max ${maxRequests} requests per ${Math.round(windowMs / 60_000)} minutes`
      );
    }

    timestamps.push(now);
    windows.set(key, timestamps);
    next();
  };
}

/** Exposed for testing: lets tests reset state between runs. */
export function _createFreshLimiter(opts) {
  return createRateLimiter(opts);
}

/** Global IP-based rate limiter (RFC-007). Default 120 req / 15 mins. */
export function createGlobalLimiter() {
  return createRateLimiter({
    keyFn: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
    maxRequests: 120,
    windowMs: 15 * 60_000, // 15 mins
  });
}
