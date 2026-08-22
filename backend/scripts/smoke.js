import { createApp } from '../src/server.js';
import * as http from 'node:http';

async function main() {
  console.log('--- RFC-007 Smoke Test Rehearsal ---');
  let passCount = 0;
  let failCount = 0;

  function report(name, ok, msg) {
    if (ok) {
      console.log(`[PASS] ${name}`);
      passCount++;
    } else {
      console.log(`[FAIL] ${name} — ${msg}`);
      failCount++;
    }
  }

  // Bind server locally
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Server listening on ${baseUrl}\n`);

  try {
    // 1. GET /ready
    const resReady = await fetch(`${baseUrl}/ready`);
    const readyData = await resReady.json();
    report('/ready endpoint', resReady.ok && readyData.supabase === 'ok', JSON.stringify(readyData));

    // 2. Route (Day)
    const routePayload = {
      origin: { lat: 20.27, lng: 85.841 },
      destination: { lat: 20.28, lng: 85.85 },
      time: '2026-08-22T12:00:00+05:30' // day
    };
    
    // NOTE: In CI/smoke without real OSRM, we expect a 502 UPSTREAM_OSRM,
    // which triggers our static fallback (Criterion 1 & 7) because STATIC_FALLBACK_ENABLED=true.
    // If real OSRM is up, it returns 200 with osrm data.
    const resRoute = await fetch(`${baseUrl}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(routePayload)
    });
    const routeData = await resRoute.json();
    const isFallback = resRoute.headers.get('x-data-source') === 'static-fallback';
    report(
      'POST /api/route (Day)',
      resRoute.ok && routeData.routes?.length > 0,
      `Status: ${resRoute.status}, Fallback: ${isFallback}`
    );

    // 3. Explain Context
    const explainUrl = `${baseUrl}/api/explain-context?originLat=20.27&originLng=85.841&destLat=20.28&destLng=85.85&routeIndex=0`;
    const resExplain = await fetch(explainUrl);
    const explainData = await resExplain.json();
    report(
      'GET /api/explain-context',
      resExplain.ok && Array.isArray(explainData.factors),
      `Status: ${resExplain.status}`
    );

    // 4. Report -> Rescore
    const resReport = await fetch(`${baseUrl}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: 20.27,
        lng: 85.841,
        severity: 3,
        lightCondition: 'unlit'
      })
    });
    // This could be 429 if we run smoke test rapidly, or 201
    report(
      'POST /api/report',
      resReport.status === 201 || resReport.status === 429,
      `Status: ${resReport.status}`
    );

  } finally {
    server.close();
  }

  console.log(`\nSummary: ${passCount} PASS, ${failCount} FAIL`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
