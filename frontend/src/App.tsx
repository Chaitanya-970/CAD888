import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Circle } from 'react-leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Flag, Share2, Shield } from 'lucide-react'

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

import { routes, seedReports, hours, heatmapPoints } from './data'
import type { RouteId, Report, SafetyLevel } from './types'
import { score } from './utils'

function App() {
  const [selected, setSelected] = useState<RouteId>('safest')
  const [hour, setHour] = useState(2)
  const [safetyLevel, setSafetyLevel] = useState<SafetyLevel>(0)
  const [reportOpen, setReportOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reports, setReports] = useState<Report[]>(seedReports)
  const [shareOpen, setShareOpen] = useState(false)
  const [heatmapOn, setHeatmapOn] = useState(false)
  const [reportCoords, setReportCoords] = useState<[number, number] | null>(null)

  const route = routes.find((r) => r.id === selected)!
  const activeScore = score(route, hour, safetyLevel)

  const recommended = useMemo(
    () => [...routes].sort((a, b) => score(b, hour, safetyLevel) - score(a, hour, safetyLevel))[0],
    [hour, safetyLevel],
  )
  const recommendedScore = score(recommended, hour, safetyLevel)

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
  }

  return (
    <main className="app-shell">
      <MapContainer center={[12.981, 77.613]} zoom={14.4} zoomControl={false} className="map" attributionControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

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
          <Tooltip direction="top">Your location</Tooltip>
        </CircleMarker>
        <CircleMarker center={[12.986, 77.635]} radius={10} pathOptions={{ color: '#ffffff', fillColor: '#6b46f0', fillOpacity: 1, weight: 3 }}>
          <Tooltip direction="top">Indiranagar Metro</Tooltip>
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

      <SearchCard destination="Indiranagar Metro Station" />

      <InsightCard recommended={recommended} recommendedScore={recommendedScore} hourLabel={hours[hour]} />

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
        selected={selected}
        onSelect={setSelected}
        hour={hour}
        safetyLevel={safetyLevel}
        activeRoute={route}
        activeScore={activeScore}
      />

      <TimeCard hour={hour} onChange={setHour} />

      <div className="privacy"><Shield size={13} /> Anonymous reports. No location history stored.</div>

      <AnimatePresence>
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