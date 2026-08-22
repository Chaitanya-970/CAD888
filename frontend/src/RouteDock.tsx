import { AnimatePresence, motion } from 'framer-motion'
import { Flag, Footprints, Info, Lightbulb, Star, Sun } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Route, RouteId, SafetyLevel } from './types'
import { routes } from './data'
import { score, tone, routeExplanation, safetyTip } from './utils'

export default function RouteDock({
  selected, onSelect, hour, safetyLevel, activeRoute, activeScore,
}: {
  selected: RouteId
  onSelect: (id: RouteId) => void
  hour: number
  safetyLevel: SafetyLevel
  activeRoute: Route
  activeScore: number
}) {
  return (
    <section className="route-dock glass">
      <div className="dock-top">
        <div><span className="eyebrow">ROUTE OPTIONS</span><h3>Choose how you want to go</h3></div>
        <button className="text-btn"><Info size={15} /> How scores work</button>
      </div>

      <div className="route-options">
        {routes.map((r) => {
          const Icon = r.icon
          const s = score(r, hour, safetyLevel)
          return (
            <button
              onClick={() => onSelect(r.id)}
              className={`route-option ${selected === r.id ? 'selected' : ''}`}
              key={r.id}
              style={{ '--route-color': r.color } as CSSProperties}
            >
              <span className="route-icon"><Icon size={18} /></span>
              <span className="route-copy"><b>{r.label}</b><small>{r.time} · {r.distance}</small></span>
              <span className={`route-score ${tone(s)}`}>{s}<small>/100</small></span>
              {selected === r.id && <motion.span layoutId="selectedline" className="selected-line" />}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${selected}-${hour}-${safetyLevel}`}
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
          <p className="route-explanation">{routeExplanation(activeRoute.id, activeScore, hour)}</p>
          <div className="breakdown">
            <span><Sun size={15} /> Lighting <b>{Math.min(96, 76 + (activeRoute.id === 'safest' ? 12 : activeRoute.id === 'balanced' ? 6 : 0) - hour * 2)}%</b></span>
            <span><Footprints size={15} /> Foot traffic <b>{Math.max(42, 88 - hour * 6)}%</b></span>
            <span><Flag size={15} /> Reports <b>{activeRoute.id === 'fastest' ? '2 nearby' : '0 nearby'}</b></span>
          </div>
          <div className="ai-tip">
            <Lightbulb size={14} />
            <span>{safetyTip(activeRoute.id, hour)}</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  )
}
