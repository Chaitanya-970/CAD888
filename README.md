# SafeRoute — Safety-Aware Walking Routes (PS-16)

> **Hackathon:** CSCverse · **Problem Statement 16** — *Safe Route Mapping: Crowdsourced Security Signals*
>
> Maps get you there **fast** — not **safely**. Women and marginalized groups constantly weigh how safe a route *feels* at a given hour (lighting, foot traffic, past incidents), but that knowledge lives only in WhatsApp groups and word of mouth. **SafeRoute** systematizes it: an anonymous crowdsourced safety layer over OpenStreetMap that returns color-coded, explainable walking routes — without ever publishing a stigmatizing public "danger map".

---

## Table of Contents
1. [How It Works](#how-it-works)
2. [Repository Layout](#repository-layout)
3. [Quick Start](#quick-start)
4. [API Reference](#api-reference)
5. [The Safety Score](#the-safety-score)
6. [Resilience & Privacy](#resilience--privacy)
7. [Testing](#testing)
8. [Demo Script (60–90s)](#demo-script)
9. [Design Decisions & Honest Limitations](#design-decisions--honest-limitations)
10. [Project Governance Docs](#project-governance-docs)

---

## How It Works

```
 React + Leaflet          Express API                Supabase (Postgres+PostGIS)
 frontend  ──POST /api/route──►  1. OSRM → 2-3 alt paths   road_segments
 (map, time slider,       │  2. path → geohash-7 cells     incident_reports
  report UI, "Why?")      │  3. score cells per bucket     segment_safety_scores
                          │  4. routeScore + band
 user report ──POST /api/report──► snap→corroborate→O(1) rescore
                          │
 Role 3 agent ◄─GET /api/explain-context─ grounded signals → LLM "Why?" text
 (Python, subprocess bridge)
```

Three independently deployable pieces:

| Piece | Stack | Owner | What it does |
|---|---|---|---|
| [`backend/`](backend) | Node 20 · Express 5 · Supabase · zod · pino | Role 2 | Routing client (OSRM), safety scoring engine, anonymous report ingestion, explanation-context API, static-route fallback |
| [`frontend/`](frontend) | React 19 · Vite · TypeScript · Leaflet · Tailwind | Role 1 | Full-screen map with click-to-set points, Fast/Safe/Balanced route cards, day-night time slider, 2-tap report modal, "Why?" panel, share-live-route modal, typed API client (`src/api.ts`) |
| [`ai_agent/`](ai_agent) | Python 3 (zero required deps for mock mode) | Role 3 | Explainable Safety Agent (LLM via provider: `mock`/`grok`/`gemini`), DBSCAN hotspot clustering (stretch) |

## Repository Layout

```
backend/
  src/
    server.js                 # app assembly; boots only when run directly
    config.js                 # fail-fast env validation (pure, testable)
    routes/                   # route.js · report.js · explain.js · health.js
    services/                 # osrmClient · scoringEngine · scoringConstants
                              # geoUtils · reportIngestion · explainContext
    middleware/               # validate (zod) · rateLimit · errorHandler
    db/                       # supabase client · migrations/001_init.sql · seeds/
    fallback/staticRoutes.js  # labeled static routes when OSRM dies
  scripts/loadSeed.js         # idempotent fixture loader
  scripts/smoke.js            # end-to-end rehearsal gate
  tests/                      # 9 suites / 105 tests
frontend/                     # Vite + React + Leaflet app (Role 1)
ai_agent/                     # Python explanation agent + DBSCAN (Role 3)
plans/, RFCs/, RULES.md, TEST_PLAN.md   # governance docs (local only, gitignored)
```

## Quick Start

### Prerequisites
- Node.js ≥ 20
- A free [Supabase](https://supabase.com) project (database host)

### 1. Backend

```powershell
cd backend
npm install
Copy-Item .env.example .env      # then fill in the values below
```

`.env` values:

| Var | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Project Settings → API → **Project URL** |
| `SUPABASE_SERVICE_KEY` | Same page → the **`service_role` secret** key (⚠️ never the anon/publishable key; never commit) |
| `REPORT_HASH_SALT` | Any random string you invent |
| `PORT` / `CORS_ORIGIN` | Defaults `3000` / `http://localhost:5173` are fine |
| `OSRM_BASE_URL` / `OSRM_PROFILE` / `OSRM_TIMEOUT_MS` | Optional. Defaults hit the public OSRM demo server. For real pedestrian routing run local Docker OSRM with the **foot** profile (runbook in [`RFCs/RFC-007`](RFCs/RFC-007-resilience-deployment.md)) |

Create the tables: Supabase Dashboard → **SQL Editor** → paste all of
[`backend/src/db/migrations/001_init.sql`](backend/src/db/migrations/001_init.sql) → **Run**.

Seed demo data (idempotent — safe to re-run):

```powershell
npm run seed     # → upserted N segments, inserted N reports
```

Start it:

```powershell
npm run dev      # → safecall-backend listening on :3000
curl http://localhost:3000/health
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev      # → http://localhost:5173  (CORS already allowlisted)
```

> **Point it at your local backend:** the API client (`src/api.ts`) reads `VITE_API_URL`
> and falls back to the deployed Vercel URL when unset. For local development create
> `frontend/.env` containing `VITE_API_URL=http://localhost:3000` — otherwise the app
> will call the cloud deployment instead of your machine.

### 3. AI Explanation Agent (optional — mock mode needs no keys)

```powershell
echo '{"segments":[...]}' | python ai_agent/explain_agent.py --provider mock
```

See [`ai_agent/README.md`](ai_agent/README.md) for the stdin/stdout JSON bridge and real-provider setup.

### 4. Full test suite

```powershell
cd backend
npm test         # 9 suites / 105 tests — no network needed (OSRM is faked)
npm run smoke    # end-to-end rehearsal gate
```

## API Reference

Base URL: `http://localhost:3000` · All errors: `{ "error": { "code", "message" } }`
Codes: `INVALID_REQUEST`(400) · `RATE_LIMITED`(429) · `UPSTREAM_OSRM`(502) · `NOT_FOUND`(404) · `INTERNAL`(500)

### `POST /api/route` — scored route options

```jsonc
// Request
{ "origin": { "lat": 12.9716, "lng": 77.5946 },
  "destination": { "lat": 12.98, "lng": 77.6 },
  "time": "2026-08-22T21:30:00+05:30" }        // optional, default = now

// Response 200
{ "routes": [ {
    "index": 0,
    "summary": { "distanceM": 1450, "durationS": 1080 },
    "geometry": [[12.9716, 77.5946]],          // [[lat,lng],...] polyline for map rendering
    "score": 62, "band": "yellow",             // green ≥70 · yellow 40–69 · red <40
    "cells": ["tdr1xyz"],                      // ordered geohash-7 path
    "cellScores": [{ "cell": "tdr1xyz", "score": 58 }],
    "explanationInput": { "unlitCells": 2, "totalCells": 14,
                          "reportsLast30d": 3, "worstCellScore": 22,
                          "timeBucket": "night" }
  } ],
  "dataSource": "osrm",                        // or "static-fallback"
  "generatedAt": "2026-08-22T16:00:00Z" }
```

### `POST /api/report` — anonymous 2-tap incident report

```jsonc
// Request (no account, no exact GPS stored)
{ "lat": 12.9716, "lng": 77.5946, "severity": 2,        // 1|2|3
  "lightCondition": "unlit",                             // lit|unlit|unknown
  "note": "Dark stretch under the flyover",              // optional ≤280 chars
  "occurredAt": "2026-08-22T21:05:00+05:30" }            // optional, default now

// Response 201
{ "reportId": "<uuid>", "cellGeohash": "tdr1qvv",
  "scoreBefore": 71, "scoreAfter": 64, "corroborated": false }
```
Limits: 3 reports/hour per anonymized reporter+cell. A single report can never flip a route — scores shift fully only after ≥2 independent reporters within 72h.

### `GET /api/explain-context` — grounded signals for the LLM "Why?"

```
/api/explain-context?originLat=..&originLng=..&destLat=..&destLng=..&time=ISO&routeIndex=0
→ { "score", "band", "factors": [...], "disclaimer", "generatedAt" }
```
Every factor traces to database values; silence means "no issue found" — which is what keeps the LLM honest.

### `GET /health` — liveness · `{ "status": "ok", "uptime": ... }`

## The Safety Score

Per ~150m geohash cell, per time bucket (`morning 6–11 · day 11–17 · evening 17–21 · night 21–6`):

```
IncidentPenalty(t) = Σ reports [ severity × exp(-0.1·Δdays) × timeMatch(t) × damp ]
SegmentScore(t)    = clamp(0,100, 40·lighting + 30·footTraffic − 30·min(penalty,1))
RouteScore         = avg(segments) − 1.0 × max(0, 50 − min(segments))   ← min-segment floor
```

- **Time-decay**: last week's incident counts heavily; six months ago barely at all.
- **Time-match**: a 2pm query isn't punished by an 11pm report (weight 0.25).
- **Corroboration guard**: one lone reporter moves the needle only 30%; two independent reporters within 72h apply full weight.
- **Min-segment floor**: one dangerous block drags the whole route down disproportionately — a plain average would hide it.

Why rule-based and not ML? Cold-start honesty: with sparse seeded data a trained model would fake precision. This formula is transparent, works with zero history, and every score is explainable — which is the product.

## Resilience & Privacy

- **Static fallback**: if OSRM fails mid-demo, `/api/route` serves pre-generated routes labeled `dataSource:"static-fallback"` + `X-Data-Source` header. Never unlabeled.
- **Privacy by construction**: reports store a salted hash of the IP (rotated per deploy) and a ~150m cell id — never raw IPs, device IDs, or exact GPS.
- **No public danger map**: scores exist only inside personalized route comparisons, per the PS's anti-stigmatization requirement.
- **Known quirk**: the public OSRM demo server doesn't serve the pedestrian profile, so out-of-the-box live calls may return the labeled fallback. For full routing, run local Docker OSRM with the foot profile (runbook in RFC-007) — this is also the demo-day plan.

## Testing

```powershell
cd backend && npm test
```
**9 suites · 105 tests · green.** Coverage highlights: scoring math is pinned by a dedicated spec suite (decay ratios, corroboration dampening, min-segment floor, band boundaries); contract tests assert the exact JSON shapes; failure paths (OSRM down/malformed/timeouts with retry-count assertions); privacy greps (no PII columns); fallback labeling; rate-limit abuse. No test touches the internet.

## Demo Script

1. *(10s)* "Maps get you there fast — not safely. Women already share this knowledge in WhatsApp groups. We systematized it."
2. *(15s)* Enter destination → two routes appear: Fast (12 min) vs Safe (15 min, higher score).
3. *(15s)* Tap **Why?** → *"Route A passes an unlit block flagged 3 times after 8pm."*
4. *(15s)* Drag the time slider 2pm → 9pm → watch the safest route visibly change.
5. *(10s)* Submit an anonymous report in 2 taps → map updates instantly.
6. *(10s)* "No public shame maps. No accounts. Just safer choices, crowdsourced."

## Design Decisions & Honest Limitations

| Decision / Limitation | Why |
|---|---|
| Rule-based scorer instead of ML | Sparse cold-start data; transparency is a safety feature. Constants centralized in `scoringConstants.js` for future model swap |
| Geohash-7 (~150m) cells as the scoring unit | Enables O(1) incremental rescoring + privacy snapping in one mechanism |
| Static fallback routes when OSRM is down | Live-demo insurance; always labeled, never silently mixed |
| Hospital-grade authn skipped | Anonymous reporting is the product; abuse handled via rate limits + corroboration |
| RLS not enabled on Supabase tables | Backend uses the service key; post-hackathon hardening item |
| EMT/identity verification, turn-by-turn nav, live bed of real data | Explicitly cut for scope — see roadmap §12 cut order |

## Project Governance Docs

Development ran on a spec-first pipeline (all local, gitignored by team choice):
[`plans/PS17-Safe-Route-Roadmap.md`](plans/PS17-Safe-Route-Roadmap.md) (canonical spec) → [`RULES.md`](RULES.md) (engineering law) → [`RFCs/`](RFCs) (7 implementation units + master index) → [`TEST_PLAN.md`](TEST_PLAN.md) (51-case strategy).

## Team

| Role | Scope |
|---|---|
| Role 1 | Frontend & map experience (`frontend/`) |
| Role 2 | Backend, database & scoring engine (`backend/`) |
| Role 3 | AI explanation agent, seed data, integration & demo lead (`ai_agent/`) |

---

*Built for the CSCverse hackathon. Supplements personal judgment — not a safety guarantee.*
