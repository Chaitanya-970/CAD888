import { AnimatePresence, motion } from 'framer-motion'
import { Compass, Flag, Footprints, Shield, Star, Sun, Zap } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Route, SafetyLevel } from '../types'
import { ROUTE_COLORS } from '../types'
import { score, tone } from '../utils'
import type { ApiRoute } from '../api'

const LABEL_ICONS: Record<string, typeof Shield> = {
  Safest: Shield,
  Balanced: Compass,
  Fastest: Zap,
}

function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}
function fmtTime(s: number) {
  return `${Math.round(s / 60)} min`
}

export default function RouteDock({
  selectedIdx, onSelect, apiRoutes, routeLabels, fallbackRoutes, hour, safetyLevel,
}: {
  selectedIdx: number
  onSelect: (idx: number) => void
  apiRoutes: ApiRoute[] | null
  routeLabels: string[]
  fallbackRoutes: Route[]
  hour: number
  safetyLevel: SafetyLevel
}) {
  const usingApi = apiRoutes !== null && apiRoutes.length > 0
  const activeScore = usingApi
    ? (apiRoutes![selectedIdx]?.score ?? 50)
    : score(fallbackRoutes[selectedIdx] || fallbackRoutes[0], hour, safetyLevel)

  const activeExpl = usingApi ? apiRoutes![selectedIdx]?.explanationInput : null

  const explainText = activeExpl
    ? buildExplanation(activeExpl)
    : (fallbackRoutes[selectedIdx]?.note || 'Route information loading...')

  const litPct = activeExpl
    ? Math.round(((activeExpl.totalCells - activeExpl.unlitCells) / Math.max(1, activeExpl.totalCells)) * 100)
    : 76
  const reportCount = activeExpl ? activeExpl.reportsLast30d : 0

  return (
    <section className="route-dock glass">
      <div className="dock-top">
        <div><span className="eyebrow">ROUTE OPTIONS</span><h3>Choose how you want to go</h3></div>
      </div>

      <div className="route-options">
        {usingApi && apiRoutes
          ? apiRoutes.map((r, i) => {
              const label = routeLabels[i] || `Route ${i + 1}`
              const Icon = LABEL_ICONS[label] || Compass
              return (
                <button
                  onClick={() => onSelect(i)}
                  className={`route-option ${selectedIdx === i ? 'selected' : ''}`}
                  key={r.index}
                  style={{ '--route-color': ROUTE_COLORS[i % ROUTE_COLORS.length] } as CSSProperties}
                >
                  <span className="route-icon"><Icon size={18} /></span>
                  <span className="route-copy"><b>{label}</b><small>{fmtTime(r.summary.durationS)} · {fmtDist(r.summary.distanceM)}</small></span>
                  <span className={`route-score ${tone(r.score)}`}>{r.score}<small>/100</small></span>
                  {selectedIdx === i && <motion.span layoutId="selectedline" className="selected-line" />}
                </button>
              )
            })
          : fallbackRoutes.map((r, i) => {
              const Icon = r.icon
              const s = score(r, hour, safetyLevel)
              return (
                <button
                  onClick={() => onSelect(i)}
                  className={`route-option ${selectedIdx === i ? 'selected' : ''}`}
                  key={r.id}
                  style={{ '--route-color': r.color } as CSSProperties}
                >
                  <span className="route-icon"><Icon size={18} /></span>
                  <span className="route-copy"><b>{r.label}</b><small>{r.time} · {r.distance}</small></span>
                  <span className={`route-score ${tone(s)}`}>{s}<small>/100</small></span>
                  {selectedIdx === i && <motion.span layoutId="selectedline" className="selected-line" />}
                </button>
              )
            })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${selectedIdx}-${hour}-${safetyLevel}`}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="why-panel"
        >
          <div className="why-title">
            <span><Star size={15} fill="currentColor" /> WHY THIS ROUTE</span>
            <span className={`score-label ${tone(activeScore)}`}>
              {activeScore >= 84 ? 'Excellent choice' : activeScore >= 70 ? 'Strong choice' : 'Use awareness'}
            </span>
          </div>
          <p>{explainText}</p>
          <div className="breakdown">
            <span><Sun size={15} /> Lighting <b>{litPct}%</b></span>
            <span><Footprints size={15} /> Foot traffic <b>{activeExpl ? (litPct > 70 ? 'Active' : 'Moderate') : 'Moderate'}</b></span>
            <span><Flag size={15} /> Reports <b>{reportCount} nearby</b></span>
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  )
}

function buildExplanation(expl: { unlitCells: number; totalCells: number; reportsLast30d: number; worstCellScore: number; timeBucket: string }): string {
  const litPct = Math.round(((expl.totalCells - expl.unlitCells) / Math.max(1, expl.totalCells)) * 100)
  const parts: string[] = []

  if (litPct >= 80) parts.push(`Well-lit route with ${litPct}% of segments having good lighting`)
  else if (litPct >= 50) parts.push(`Route has moderate lighting coverage (${litPct}%)`)
  else parts.push(`Caution: only ${litPct}% of this route is well-lit`)

  if (expl.reportsLast30d === 0) parts.push('no safety concerns reported in the last 30 days')
  else if (expl.reportsLast30d <= 2) parts.push(`${expl.reportsLast30d} report${expl.reportsLast30d > 1 ? 's' : ''} filed nearby recently`)
  else parts.push(`${expl.reportsLast30d} reports filed in the last 30 days — exercise caution`)

  if (expl.timeBucket === 'night') parts.push('scores adjusted for nighttime conditions')

  return parts.join('. ') + '.'
}
