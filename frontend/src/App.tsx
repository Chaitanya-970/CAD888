import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Circle } from 'react-leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Flag, Loader2, Share2, Shield } from 'lucide-react'

import Topbar from './components/Topbar'
import SearchCard, { DESTINATIONS } from './components/SearchCard'
import type { Destination } from './components/SearchCard'
import InsightCard from './components/InsightCard'
import CompanionCard from './components/CompanionCard'
import SafetyModeSlider from './components/SafetyModeSlider'
import RouteDock from './components/RouteDock'
import TimeCard from './components/TimeCard'
import ReportModal from './components/ReportModal'
import ShareModal from './components/ShareModal'
import MapClickHandler from './components/MapClickHandler'

import { routes as fallbackRoutes, seedReports, hours, heatmapPoints } from './data'
import type { Report, SafetyLevel } from './types'
import { ROUTE_COLORS } from './types'
import { score } from './utils'
import { fetchRoutes as apiFetchRoutes, submitReport as apiSubmitReport } from './api'
import type { ApiRoute } from './api'

const ORIGIN = { lat: 20.2666, lng: 85.8360 }

function sliderToIso(hourIdx: number): string {
  const now = new Date()
  const h = 18 + hourIdx
  now.setHours(h >= 24 ? h - 24 : h, 0, 0, 0)
  if (h >= 24) now.setDate(now.getDate() + 1)
  return now.toISOString()
}

function labelByRank(routes: ApiRoute[]): string[] {
  const ranked = routes.map((r, i) => ({ i, score: r.score })).sort((a, b) => b.score - a.score)
  const labels = new Array<string>(routes.length)
  const tags = ['Safest', 'Balanced', 'Fastest']
  ranked.forEach((r, idx) => { labels[r.i] = tags[Math.min(idx, tags.length - 1)] })
  return labels
}

function App() {
  const [apiRoutes, setApiRoutes] = useState<ApiRoute[] | null>(null)
  const [routeLabels, setRouteLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [hour, setHour] = useState(2)
  const [safetyLevel, setSafetyLevel] = useState<SafetyLevel>(0)
  const [reportOpen, setReportOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reports, setReports] = useState<Report[]>(seedReports)
  const [shareOpen, setShareOpen] = useState(false)
  const [heatmapOn, setHeatmapOn] = useState(false)
  const [reportCoords, setReportCoords] = useState<[number, number] | null>(null)
  const [dest, setDest] = useState<Destination>(DESTINATIONS[0])

  const loadRoutes = useCallback(async (hourIdx: number, destination: Destination) => {
    setLoading(true)
    try {
      const data = await apiFetchRoutes(ORIGIN, { lat: destination.lat, lng: destination.lng }, sliderToIso(hourIdx))
      setApiRoutes(data.routes)
      setRouteLabels(labelByRank(data.routes))
      const safestIdx = data.routes.reduce((best, r, i) => (r.score > data.routes[best].score ? i : best), 0)
      setSelectedIdx(safestIdx)
    } catch (e) {
      console.error('[App] Route fetch failed, using fallback:', e)
      setApiRoutes(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRoutes(hour, dest) }, [hour, dest, loadRoutes])

  const usingApi = apiRoutes !== null && apiRoutes.length > 0
  const activeApiRoute = usingApi ? apiRoutes[selectedIdx] || apiRoutes[0] : null

  const recommended = useMemo(() => {
    if (usingApi && apiRoutes) {
      const best = apiRoutes.reduce((b, r, i) => (r.score > apiRoutes[b].score ? i : b), 0)
      return { score: apiRoutes[best].score, label: routeLabels[best] || 'Best' }
    }
    const sorted = [...fallbackRoutes].sort((a, b) => score(b, hour, safetyLevel) - score(a, hour, safetyLevel))
    return { score: score(sorted[0], hour, safetyLevel), label: sorted[0].label }
  }, [usingApi, apiRoutes, routeLabels, hour, safetyLevel])

  const handleMapClick = (lat: number, lng: number) => {
    setReportCoords([lat, lng])
    setReportOpen(true)
  }

  const handleReport = async (kind: string) => {
    const severityMap: Record<string, number> = {
      'Low lighting': 2, 'Quiet / isolated': 2, 'Harassment concern': 3,
      'Obstruction': 1, 'Positive: well lit': 1,
    }
    const lightMap: Record<string, 'lit' | 'unlit' | 'unknown'> = {
      'Low lighting': 'unlit', 'Quiet / isolated': 'unknown', 'Harassment concern': 'unknown',
      'Obstruction': 'lit', 'Positive: well lit': 'lit',
    }
    const coords: [number, number] = reportCoords || [20.2690, 85.8390]
    const isPositive = kind.startsWith('Positive')
    setReports((prev) => [...prev, { p: coords, kind, age: 'Now', color: isPositive ? '#0f8a72' : '#d9483d' }])
    setReportOpen(false)
    setReportCoords(null)

    try {
      await apiSubmitReport(coords[0], coords[1], severityMap[kind] ?? 2, lightMap[kind] ?? 'unknown', kind)
    } catch (e) {
      console.warn('[App] Report API failed (saved locally only):', e)
    }
  }

  const heatColor = (intensity: number) => {
    if (intensity >= 0.7) return { color: '#d9483d', fillColor: '#d9483d', fillOpacity: 0.25 + intensity * 0.15 }
    if (intensity >= 0.4) return { color: '#e0791a', fillColor: '#e0791a', fillOpacity: 0.18 + intensity * 0.12 }
    return { color: '#0f8a72', fillColor: '#0f8a72', fillOpacity: 0.12 + intensity * 0.08 }
  }

  return (
    <main className="app-shell">
      <MapContainer center={[20.2700, 85.8400]} zoom={14.4} zoomControl={false} className="map" attributionControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <MapClickHandler onMapClick={handleMapClick} />

        {heatmapOn && heatmapPoints.map(([lat, lng, intensity], i) => (
          <Circle key={`heat-${i}`} center={[lat, lng]} radius={180 + intensity * 120} pathOptions={{ ...heatColor(intensity), weight: 0 }} />
        ))}

        {usingApi && apiRoutes
          ? apiRoutes.map((r, i) => (
              <Polyline key={`api-${r.index}`} positions={r.geometry}
                pathOptions={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length], weight: i === selectedIdx ? 7 : 4, opacity: i === selectedIdx ? 0.95 : 0.27, lineCap: 'round' }} />
            ))
          : fallbackRoutes.map((r, i) => (
              <Polyline key={r.id} positions={r.path}
                pathOptions={{ color: r.color, weight: i === selectedIdx ? 7 : 4, opacity: i === selectedIdx ? 0.95 : 0.27, lineCap: 'round' }} />
            ))}

        <CircleMarker center={[ORIGIN.lat, ORIGIN.lng]} radius={8} pathOptions={{ color: '#ffffff', fillColor: '#0f8a72', fillOpacity: 1, weight: 3 }}>
          <Tooltip direction="top">Your location</Tooltip>
        </CircleMarker>
        <CircleMarker center={[dest.lat, dest.lng]} radius={10} pathOptions={{ color: '#ffffff', fillColor: '#6b46f0', fillOpacity: 1, weight: 3 }}>
          <Tooltip direction="top">{dest.name}</Tooltip>
        </CircleMarker>

        {reports.map((r, i) => (
          <CircleMarker key={i} center={r.p} radius={6} pathOptions={{ color: '#15151a', fillColor: r.color, fillOpacity: 0.95, weight: 2 }}>
            <Tooltip>{r.kind} · {r.age}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-sky-glow" />
      <div className="map-vignette" />

      <Topbar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />
      <SearchCard selected={dest} onSelect={setDest} onFindRoutes={() => loadRoutes(hour, dest)} loading={loading} />

      {loading && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999 }}>
          <Loader2 size={36} className="spin" style={{ color: '#6b46f0' }} />
        </div>
      )}

      <InsightCard recommendedLabel={recommended.label} recommendedScore={recommended.score} hourLabel={hours[hour]} explanationInput={activeApiRoute?.explanationInput} />
      <CompanionCard />

      <div className="floating-actions">
        <SafetyModeSlider level={safetyLevel} onChange={setSafetyLevel} />
        <button className="report-button" onClick={() => { setReportCoords(null); setReportOpen(true) }}><Flag size={17} /> Report a concern</button>
        <button className={`heatmap-toggle ${heatmapOn ? 'heatmap-on' : ''}`} onClick={() => setHeatmapOn((v) => !v)} aria-pressed={heatmapOn} title={heatmapOn ? 'Hide safety heatmap' : 'Show safety heatmap'}>
          {heatmapOn ? <EyeOff size={15} /> : <Eye size={15} />} Heatmap
        </button>
        <button className="share-button" onClick={() => setShareOpen(true)}><Share2 size={15} /> Share route</button>
      </div>

      <RouteDock selectedIdx={selectedIdx} onSelect={setSelectedIdx} apiRoutes={apiRoutes} routeLabels={routeLabels} fallbackRoutes={fallbackRoutes} hour={hour} safetyLevel={safetyLevel} />
      <TimeCard hour={hour} onChange={setHour} />
      <div className="privacy"><Shield size={13} /> Anonymous reports. No location history stored.</div>

      <AnimatePresence>
        {reportOpen && <ReportModal onClose={() => { setReportOpen(false); setReportCoords(null) }} onSubmit={handleReport} coords={reportCoords} />}
      </AnimatePresence>
      <AnimatePresence>
        {shareOpen && <ShareModal onClose={() => setShareOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {menuOpen && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mobile-menu glass">
            <button>Saved places</button><button>Safety settings</button><button>Help & support</button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

export default App
