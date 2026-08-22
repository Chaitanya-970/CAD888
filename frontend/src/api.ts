/**
 * API client — thin wrapper for the backend endpoints.
 *
 * Uses VITE_API_URL from .env (falls back to the live Vercel deployment).
 * Every function returns the parsed JSON or throws on network/HTTP errors.
 */

const BASE = import.meta.env.VITE_API_URL || 'https://cad-888.vercel.app'

// ── Types matching backend response shapes ──────────────────────────

export type ExplanationInput = {
  unlitCells: number
  totalCells: number
  reportsLast30d: number
  worstCellScore: number
  timeBucket: string
}

export type ApiRoute = {
  index: number
  summary: { distanceM: number; durationS: number }
  geometry: [number, number][] // [[lat,lng], ...]
  score: number
  band: 'green' | 'yellow' | 'red'
  cells: string[]
  cellScores: { cell: string; score: number }[]
  explanationInput: ExplanationInput
}

export type RouteResponse = {
  routes: ApiRoute[]
  dataSource: string
  generatedAt: string
}

export type ReportResponse = {
  reportId: string
  cellGeohash: string
  scoreBefore: number
  scoreAfter: number
  corroborated: boolean
}

// ── API functions ───────────────────────────────────────────────────

export async function fetchRoutes(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  time?: string
): Promise<RouteResponse> {
  const body: Record<string, unknown> = { origin, destination }
  if (time) body.time = time

  const res = await fetch(`${BASE}/api/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Route API ${res.status}: ${text}`)
  }

  return res.json()
}

export async function submitReport(
  lat: number,
  lng: number,
  severity: number,
  lightCondition: 'lit' | 'unlit' | 'unknown',
  note?: string
): Promise<ReportResponse> {
  const body: Record<string, unknown> = { lat, lng, severity, lightCondition }
  if (note) body.note = note

  const res = await fetch(`${BASE}/api/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Report API ${res.status}: ${text}`)
  }

  return res.json()
}

export async function fetchExplainContext(params: {
  originLat: number
  originLng: number
  destLat: number
  destLng: number
  time?: string
  routeIndex?: number
}) {
  const qs = new URLSearchParams()
  qs.set('originLat', String(params.originLat))
  qs.set('originLng', String(params.originLng))
  qs.set('destLat', String(params.destLat))
  qs.set('destLng', String(params.destLng))
  if (params.time) qs.set('time', params.time)
  if (params.routeIndex !== undefined) qs.set('routeIndex', String(params.routeIndex))

  const res = await fetch(`${BASE}/api/explain-context?${qs}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Explain API ${res.status}: ${text}`)
  }

  return res.json()
}
