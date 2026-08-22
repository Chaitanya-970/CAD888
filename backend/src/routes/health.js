import { Router } from 'express';

const router = Router();

/** Liveness probe (RFC-001 criterion 2). Deep readiness comes later in RFC-007. */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

export default router;
