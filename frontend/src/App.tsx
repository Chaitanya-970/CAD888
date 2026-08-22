<<<<<<< HEAD
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import { Flag, Shield, Loader2 } from 'lucide-react'
=======
import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Circle } from 'react-leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Flag, Share2, Shield } from 'lucide-react'
>>>>>>> 747de043203ac2d80168946971df4a5cc89967e9

import Topbar from './components/Topbar'
import SearchCard from './components/SearchCard'
import InsightCard from './components/InsightCard'
import CompanionCard from './components/CompanionCard'
import SafetyModeSlider from './components/SafetyModeSlider'
import RouteDock from './RouteDock'
import TimeCard from './components/TimeCard'
import ReportModal from './components/ReportModal'
import ShareModal from './components/ShareModal'
import MapClickHandler from './components/MapClickHandler'

<<<<<<< HEAD
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
=======
import { routes, seedReports, hours, heatmapPoints } from './data'
import type { RouteId, Report, SafetyLevel } from './types'
import { score } from './utils'
>>>>>>> 747de043203ac2d80168946971df4a5cc89967e9

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
  const [shareOpen, setShareOpen] = useState(false)
  const [heatmapOn, setHeatmapOn] = useState(false)
  const [reportCoords, setReportCoords] = useState<[number, number] | null>(null)

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

<<<<<<< HEAD
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
=======
  /** P1-a: Place a report at the clicked map location. */
  const handleMapClick = (lat: number, lng: number) => {
    setReportCoords([lat, lng])
    setReportOpen(true)
  }

  const addReport = (kind: string) => {
    const coords: [number, number] = reportCoords || [12.979, 77.619]
    const isPositive = kind.startsWith('Positive')
    setReports((prev) => [...prev, { p: coords, kind, age: 'Now', color: isPositive ? '#0f8a72' : '#d9483d' }])
    setReportOpen(false)
    setReportCoords(null)
  }

  /** P2-b: Heatmap intensity color based on risk value. */
  const heatColor = (intensity: number) => {
    if (intensity >= 0.7) return { color: '#d9483d', fillColor: '#d9483d', fillOpacity: 0.25 + intensity * 0.15 }
    if (intensity >= 0.4) return { color: '#e0791a', fillColor: '#e0791a', fillOpacity: 0.18 + intensity * 0.12 }
    return { color: '#0f8a72', fillColor: '#0f8a72', fillOpacity: 0.12 + intensity * 0.08 }
>>>>>>> 747de043203ac2d80168946971df4a5cc89967e9
  }

  return (
    <main className="app-shell">
      <MapContainer center={[12.981, 77.613]} zoom={14.4} zoomControl={false} className="map" attributionControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

<<<<<<< HEAD
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
=======
        {/* P1-a: Click anywhere on map to report */}
        <MapClickHandler onMapClick={handleMapClick} />

        {/* P2-b: Heatmap overlay */}
        {heatmapOn && heatmapPoints.map(([lat, lng, intensity]: [number, number, number], i: number) => (
          <Circle
            key={`heat-${i}`}
            center={[lat, lng]}
            radius={180 + intensity * 120}
            pathOptions={{ ...heatColor(intensity), weight: 0 }}
          />
        ))}

        {routes.map((r) => (
          <Polyline
            key={r.id}
            positions={r.path}
            pathOptions={{ color: r.color, weight: r.id === selected ? 7 : 4, opacity: r.id === selected ? 0.95 : 0.27, lineCap: 'round' }}
          />
        ))}
        <CircleMarker center={[12.974, 77.592]} radius={8} pathOptions={{ color: '#ffffff', fillColor: '#0f8a72', fillOpacity: 1, weight: 3 }}>
>>>>>>> 747de043203ac2d80168946971df4a5cc89967e9
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
        <button className="report-button" onClick={() => { setReportCoords(null); setReportOpen(true) }}>
          <Flag size={17} /> Report a concern
        </button>
        {/* P2-b: Heatmap toggle */}
        <button
          className={`heatmap-toggle ${heatmapOn ? 'heatmap-on' : ''}`}
          onClick={() => setHeatmapOn((v) => !v)}
          aria-pressed={heatmapOn}
          title={heatmapOn ? 'Hide safety heatmap' : 'Show safety heatmap'}
        >
          {heatmapOn ? <EyeOff size={15} /> : <Eye size={15} />}
          Heatmap
        </button>
        {/* P3-b: Share route button */}
        <button className="share-button" onClick={() => setShareOpen(true)}>
          <Share2 size={15} /> Share route
        </button>
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
<<<<<<< HEAD
        {reportOpen && <ReportModal onClose={() => setReportOpen(false)} onSubmit={handleReport} />}
=======
        {reportOpen && (
          <ReportModal
            onClose={() => { setReportOpen(false); setReportCoords(null) }}
            onSubmit={addReport}
            coords={reportCoords}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shareOpen && <ShareModal onClose={() => setShareOpen(false)} />}
>>>>>>> 747de043203ac2d80168946971df4a5cc89967e9
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