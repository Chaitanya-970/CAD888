/**
 * Project-wide error convention (RFC-001 "Error Codes"):
 *   INVALID_REQUEST(400) | RATE_LIMITED(429) | UPSTREAM_OSRM(502)
 *   NOT_FOUND(404)       | INTERNAL(500)
 * Every error exits the API as { error: { code, message } } - nothing else.
 */
export class ApiError extends Error {
  /**
   * @param {string} code one of the five codes above
   * @param {number} status matching HTTP status
   * @param {string} message safe-for-client message (no internals)
   * @param {unknown} [details] optional structured, non-sensitive context
   */
  constructor(code, status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** 404 catch-all so unknown routes speak the same JSON dialect. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

/**
 * Final Express error middleware (RFC-001 criterion 8):
 * ApiError -> its own status/code; anything else -> INTERNAL(500),
 * never leaking stack traces or internal messages.
 */
// eslint-disable-next-line no-unused-vars -- Express requires 4-arg signature
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    const payload = { code: err.code, message: err.message };
    if (err.details !== undefined) payload.details = err.details;
    return res.status(err.status).json({ error: payload });
  }
  if (req.log) req.log.error({ err }, 'unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
