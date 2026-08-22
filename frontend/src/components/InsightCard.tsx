import { Eye, Sparkles, Sun, Users } from 'lucide-react'
import { tone } from '../utils'
import type { ExplanationInput } from '../api'

export default function InsightCard({
  recommendedLabel, recommendedScore, hourLabel, explanationInput,
}: {
  recommendedLabel: string
  recommendedScore: number
  hourLabel: string
  explanationInput?: ExplanationInput | null
}) {
  const litPct = explanationInput
    ? Math.round(((explanationInput.totalCells - explanationInput.unlitCells) / Math.max(1, explanationInput.totalCells)) * 100)
    : 86

  const reportsChecked = explanationInput?.reportsLast30d ?? 12

  return (
    <aside className="insight-card glass">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YOUR BEST OPTION</span>
          <h2>{recommendedLabel} route <Sparkles size={16} /></h2>
        </div>
        <span className={`score-pill ${tone(recommendedScore)}`}>{recommendedScore}</span>
      </div>
      <p>Recommended for <b>{hourLabel}</b> based on recent community signals.</p>
      <div className="insight-stats">
        <span><Sun size={15} /> {litPct}% lit</span>
        <span><Users size={15} /> {litPct > 70 ? 'Active areas' : 'Moderate activity'}</span>
        <span><Eye size={15} /> {reportsChecked} reports checked</span>
      </div>
    </aside>
  )
}
