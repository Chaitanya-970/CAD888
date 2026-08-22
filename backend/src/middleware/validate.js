/**
 * RFC-005 — Validation middleware factory (shared by RFC-004/005/006).
 *
 * Takes a Zod schema, parses req.body, and emits INVALID_REQUEST(400)
 * with structured field-level details on failure.
 */

import { ApiError } from './errorHandler.js';

/**
 * Express middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (coerced/defaulted) value.
 * On failure, throws ApiError('INVALID_REQUEST', 400) with field details.
 *
 * @param {import('zod').ZodSchema} schema
 * @returns {import('express').RequestHandler}
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      throw new ApiError(
        'INVALID_REQUEST',
        400,
        'Request body validation failed',
        details
      );
    }
    req.body = result.data;
    next();
  };
}
