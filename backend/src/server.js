import express from 'express';
import pino from 'pino';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getConfig from './config.js';
import healthRouter from './routes/health.js';
import routeRouter from './routes/route.js';
import reportRouter from './routes/report.js';
import explainRouter from './routes/explain.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

/**
 * App factory - exported so supertest can drive the HTTP layer without
 * binding a port (TEST_PLAN I-003 / U-005 style tests).
 */
import helmet from 'helmet';
import cors from 'cors';
import { createGlobalLimiter } from './middleware/rateLimit.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Hardening (RFC-007)
  app.use(helmet());
  
  // Safe default: only load config if we are booting up (tests may not have env set)
  let origin = '*';
  try { origin = getConfig().corsOrigin; } catch (e) {}
  app.use(cors({ origin }));
  
  app.use(express.json({ limit: '16kb' }));
  app.use(createGlobalLimiter());

  // Minimal structured request log (pino only - RULES R-02/R-18).
  app.use((req, _res, next) => {
    req.log = logger.child({ reqId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    req.log.info({ method: req.method, path: req.path }, 'request');
    next();
  });

  app.use(healthRouter);
  app.use(routeRouter);
  app.use(reportRouter);
  app.use(explainRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export default createApp;

// --- Boot only when invoked directly (`npm run dev` / `npm start`) ----------
const __filename = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedPath && invokedPath === __filename) {
  let config;
  try {
    config = getConfig();
  } catch (err) {
    // RFC-001 criterion 3: non-zero exit, missing variable named, no stack dump.
    console.error(`[config] ${err.message}`);
    process.exit(1);
  }
  const app = createApp();
  app.listen(config.port, () => {
    logger.info(`safecall-backend listening on :${config.port}`);
  });
}
