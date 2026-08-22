import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import { Flag, Shield } from 'lucide-react'

import Topbar from './components/Topbar'
import SearchCard from './components/SearchCard'
import InsightCard from './components/InsightCard'
import CompanionCard from './components/CompanionCard'
import SafetyModeSlider from './components/SafetyModeSlider'
import RouteDock from './components/RouteDock'
import TimeCard from './components/TimeCard'
import ReportModal from './components/ReportModal'

import { routes, seedReports, hours } from './data'
import type { RouteId, Report, SafetyLevel } from './types'
import { score } from './utils'

function App() {
  const [selected, setSelected] = useState<RouteId>('safest')
  const [hour, setHour] = useState(2)
  const [safetyLevel, setSafetyLevel] = useState<SafetyLevel>(0)
  const [reportOpen, setReportOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reports, setReports] = useState<Report[]>(seedReports)

  const route = routes.find((r) => r.id === selected)!
  const activeScore = score(route, hour, safetyLevel)

  const recommended = useMemo(
    () => [...routes].sort((a, b) => score(b, hour, safetyLevel) - score(a, hour, safetyLevel))[0],
    [hour, safetyLevel],
  )
  const recommendedScore = score(recommended, hour, safetyLevel)

  const addReport = (kind: string) => {
    setReports((prev) => [...prev, { p: [12.979, 77.619], kind, age: 'Now', color: '#d9483d' }])
    setReportOpen(false)
  }

  return (
    <main className="app-shell">
      <MapContainer center={[12.981, 77.613]} zoom={14.4} zoomControl={false} className="map" attributionControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
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
        <button className="report-button" onClick={() => setReportOpen(true)}><Flag size={17} /> Report a concern</button>
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
        {reportOpen && <ReportModal onClose={() => setReportOpen(false)} onSubmit={addReport} />}
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
