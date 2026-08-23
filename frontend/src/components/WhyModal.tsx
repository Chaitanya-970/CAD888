import { motion } from 'framer-motion'
import { Loader2, ShieldQuestion, X } from 'lucide-react'

export type ExplainFactor =
  | { type: 'lighting'; value: string; cellsAffected: number; ofTotalCells: number }
  | { type: 'incidents'; count30d: number; worstBucket: string; cell: string }
  | { type: 'floor'; triggered: boolean; minCellScore: number }

export type ExplainContext = {
  routeIndex: number
  score: number
  band: 'green' | 'yellow' | 'red'
  factors: ExplainFactor[]
  /** Added by the Role 3 agent when EXPLAIN_AGENT_ENABLED=true. Optional by contract. */
  explanation?: string
  explanationSource?: string
  disclaimer: string
  generatedAt: string
}

function factorLine(f: ExplainFactor): string {
  switch (f.type) {
    case 'lighting':
      return `${f.cellsAffected} of ${f.ofTotalCells} blocks on this route are poorly lit.`
    case 'incidents':
      return `${f.count30d} report${f.count30d === 1 ? '' : 's'} in the last 30 days, mostly in the ${f.worstBucket}.`
    case 'floor':
      return `One block scores just ${f.minCellScore} — low enough to pull the whole route down.`
    default:
      return ''
  }
}

export default function WhyModal({
  data,
  loading,
  error,
  routeLabel,
  onClose,
}: {
  data: ExplainContext | null
  loading: boolean
  error: string | null
  routeLabel: string
  onClose: () => void
}) {
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.section
        className="why-modal glass"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-heading">
          <div>
            <span className="eyebrow">WHY THIS SCORE</span>
            <h2><ShieldQuestion size={17} /> {routeLabel} route</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>

        {loading && <p className="why-loading"><Loader2 size={16} className="spin" /> Checking community signals…</p>}

        {error && !loading && <p className="why-error">Couldn’t load the explanation: {error}</p>}

        {data && !loading && (
          <>
            <div className={`score-pill ${data.band}`}>{data.score} / 100</div>

            {data.explanation && <p className="why-explanation">{data.explanation}</p>}

            {data.factors.length > 0 ? (
              <ul className="why-factors">
                {data.factors.map((f, i) => <li key={i}>{factorLine(f)}</li>)}
              </ul>
            ) : (
              <p className="why-factors-empty">
                No lighting gaps, recent reports, or low-scoring blocks found on this route.
              </p>
            )}

            <footer className="why-disclaimer">{data.disclaimer}</footer>
          </>
        )}
      </motion.section>
    </motion.div>
  )
}
