import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import { Flag, Shield, Loader2 } from 'lucide-react'

import Topbar from './components/Topbar'
import SearchCard from './components/SearchCard'
import InsightCard from './components/InsightCard'
import CompanionCard from './components/CompanionCard'
import SafetyModeSlider from './components/SafetyModeSlider'
import RouteDock from './components/RouteDock'
import TimeCard from './components/TimeCard'
import ReportModal from './components/ReportModal'

import { routes as fallbackRoutes, seedReports, hours } from './data'
import type { Report, SafetyLevel } from './types'
import { ROUTE_COLORS } from './types'
import { score, tone } from './utils'
import { fetchRoutes as apiFetchRoutes, submitReport as apiSubmitReport } from './api'
import type { ApiRoute } from './api'

// Demo coordinates (Bangalore)
const ORIGIN = { lat: 12.974, lng: 77.592 }
const DEST = { lat: 12.986, lng: 77.635 }

/** Map hour-slider index (0-7) to an ISO timestamp for the API */
function sliderToIso(hourIdx: number): string {
  const now = new Date()
  const h = 18 + hourIdx // 6 PM = 18, 7 PM = 19, ... 1 AM = 25 -> wraps
  now.setHours(h >= 24 ? h - 24 : h, 0, 0, 0)
  if (h >= 24) now.setDate(now.getDate() + 1)
  return now.toISOString()
}

/** Format meters to human-readable km/m */
function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

/** Format seconds to human-readable minutes */
function fmtTime(s: number) {
  return `${Math.round(s / 60)} min`
}

/** Assign labels by score rank: highest = Safest, middle = Balanced, lowest = Fastest */
function labelByRank(routes: ApiRoute[]): string[] {
  const ranked = routes
    .map((r, i) => ({ i, score: r.score }))
    .sort((a, b) => b.score - a.score)

  const labels = new Array<string>(routes.length)
  const tags = ['Safest', 'Balanced', 'Fastest']
  ranked.forEach((r, idx) => {
    labels[r.i] = tags[Math.min(idx, tags.length - 1)]
  })
  return labels
}

function App() {
  // API state
  const [apiRoutes, setApiRoutes] = useState<ApiRoute[] | null>(null)
  const [routeLabels, setRouteLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [hour, setHour] = useState(2)
  const [safetyLevel, setSafetyLevel] = useState<SafetyLevel>(0)
  const [reportOpen, setReportOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reports, setReports] = useState<Report[]>(seedReports)

  // Fetch routes from backend
  const loadRoutes = useCallback(async (hourIdx: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetchRoutes(ORIGIN, DEST, sliderToIso(hourIdx))
      setApiRoutes(data.routes)
      setRouteLabels(labelByRank(data.routes))
      // Select the safest route by default
      const safestIdx = data.routes.reduce(
        (best, r, i) => (r.score > data.routes[best].score ? i : best), 0
      )
      setSelectedIdx(safestIdx)
    } catch (e) {
      console.error('[App] Route fetch failed, using fallback:', e)
      setError((e as Error).message)
      setApiRoutes(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount and when the hour slider changes
  useEffect(() => {
    loadRoutes(hour)
  }, [hour, loadRoutes])

  // Derive display data — either from API or fallback
  const usingApi = apiRoutes !== null && apiRoutes.length > 0
  const activeApiRoute = usingApi ? apiRoutes[selectedIdx] || apiRoutes[0] : null

  // Fallback logic for when API fails
  const fallbackRoute = fallbackRoutes.find((_, i) => i === selectedIdx) || fallbackRoutes[0]
  const fallbackScore = score(fallbackRoute, hour, safetyLevel)

  // Recommended route (highest score)
  const recommended = useMemo(() => {
    if (usingApi && apiRoutes) {
      const best = apiRoutes.reduce((b, r, i) => (r.score > apiRoutes[b].score ? i : b), 0)
      return { idx: best, score: apiRoutes[best].score, label: routeLabels[best] || 'Best' }
    }
    const sorted = [...fallbackRoutes].sort((a, b) => score(b, hour, safetyLevel) - score(a, hour, safetyLevel))
    return { idx: 0, score: score(sorted[0], hour, safetyLevel), label: sorted[0].label }
  }, [usingApi, apiRoutes, routeLabels, hour, safetyLevel])

  // Handle report submission via API
  const handleReport = async (kind: string) => {
    // Map UI kinds to backend severity/lightCondition
    const severityMap: Record<string, number> = {
      'Low lighting': 2, 'Quiet / isolated': 2, 'Harassment concern': 3,
      'Obstruction': 1, 'Positive: well lit': 1,
    }
    const lightMap: Record<string, 'lit' | 'unlit' | 'unknown'> = {
      'Low lighting': 'unlit', 'Quiet / isolated': 'unknown', 'Harassment concern': 'unknown',
      'Obstruction': 'lit', 'Positive: well lit': 'lit',
    }

    // Add to local state immediately for responsiveness
    setReports((prev) => [...prev, { p: [12.979, 77.619], kind, age: 'Now', color: '#d9483d' }])
    setReportOpen(false)

    // Fire API call (don't block UI)
    try {
      await apiSubmitReport(12.979, 77.619, severityMap[kind] ?? 2, lightMap[kind] ?? 'unknown', kind)
      console.log('[App] Report submitted to backend')
    } catch (e) {
      console.warn('[App] Report API failed (saved locally only):', e)
    }
  }

  return (
    <main className="app-shell">
      <MapContainer center={[12.981, 77.613]} zoom={14.4} zoomControl={false} className="map" attributionControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

        {/* Draw routes from API or fallback */}
        {usingApi && apiRoutes
          ? apiRoutes.map((r, i) => (
              <Polyline
                key={`api-${r.index}`}
                positions={r.geometry}
                pathOptions={{
                  color: ROUTE_COLORS[i % ROUTE_COLORS.length],
                  weight: i === selectedIdx ? 7 : 4,
                  opacity: i === selectedIdx ? 0.95 : 0.27,
                  lineCap: 'round',
                }}
              />
            ))
          : fallbackRoutes.map((r, i) => (
              <Polyline
                key={r.id}
                positions={r.path}
                pathOptions={{
                  color: r.color,
                  weight: i === selectedIdx ? 7 : 4,
                  opacity: i === selectedIdx ? 0.95 : 0.27,
                  lineCap: 'round',
                }}
              />
            ))}

        {/* Origin & destination markers */}
        <CircleMarker center={[ORIGIN.lat, ORIGIN.lng]} radius={8} pathOptions={{ color: '#ffffff', fillColor: '#0f8a72', fillOpacity: 1, weight: 3 }}>
          <Tooltip direction="top">Your location</Tooltip>
        </CircleMarker>
        <CircleMarker center={[DEST.lat, DEST.lng]} radius={10} pathOptions={{ color: '#ffffff', fillColor: '#6b46f0', fillOpacity: 1, weight: 3 }}>
          <Tooltip direction="top">Indiranagar Metro</Tooltip>
        </CircleMarker>

        {/* Report pins */}
        {reports.map((r, i) => (
          <CircleMarker key={i} center={r.p} radius={6} pathOptions={{ color: '#15151a', fillColor: r.color, fillOpacity: 0.95, weight: 2 }}>
            <Tooltip>{r.kind} · {r.age}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-sky-glow" />
      <div className="map-vignette" />

      <Topbar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />

      <SearchCard destination="Indiranagar Metro Station" />

      {/* Loading indicator */}
      {loading && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999 }}>
          <Loader2 size={36} className="spin" style={{ color: '#6b46f0' }} />
        </div>
      )}

      <InsightCard
        recommendedLabel={recommended.label}
        recommendedScore={recommended.score}
        hourLabel={hours[hour]}
        explanationInput={activeApiRoute?.explanationInput}
      />

      <CompanionCard />

      <div className="floating-actions">
        <SafetyModeSlider level={safetyLevel} onChange={setSafetyLevel} />
        <button className="report-button" onClick={() => setReportOpen(true)}><Flag size={17} /> Report a concern</button>
      </div>

      <RouteDock
        selectedIdx={selectedIdx}
        onSelect={setSelectedIdx}
        apiRoutes={apiRoutes}
        routeLabels={routeLabels}
        fallbackRoutes={fallbackRoutes}
        hour={hour}
        safetyLevel={safetyLevel}
      />

      <TimeCard hour={hour} onChange={setHour} />

      <div className="privacy"><Shield size={13} /> Anonymous reports. No location history stored.</div>

      <AnimatePresence>
        {reportOpen && <ReportModal onClose={() => setReportOpen(false)} onSubmit={handleReport} />}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mobile-menu glass">
            <button>Saved places</button>
            <button>Safety settings</button>
            <button>Help & support</button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

export default App
