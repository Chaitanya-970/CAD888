import { Eye, Sparkles, Sun, Users } from 'lucide-react'
import type { Route } from '../types'
import { tone } from '../utils'

export default function InsightCard({ recommended, recommendedScore, hourLabel }: { recommended: Route; recommendedScore: number; hourLabel: string }) {
  return (
    <aside className="insight-card glass">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YOUR BEST OPTION</span>
          <h2>{recommended.label} route <Sparkles size={16} /></h2>
        </div>
        <span className={`score-pill ${tone(recommendedScore)}`}>{recommendedScore}</span>
      </div>
      <p>Recommended for <b>{hourLabel}</b> based on recent community signals.</p>
      <div className="insight-stats">
        <span><Sun size={15} /> 86% lit</span>
        <span><Users size={15} /> Active areas</span>
        <span><Eye size={15} /> 12 reports checked</span>
      </div>
    </aside>
  )
}
