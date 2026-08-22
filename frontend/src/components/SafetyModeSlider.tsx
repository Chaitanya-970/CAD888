import { motion } from 'framer-motion'
import { Shield } from 'lucide-react'
import { SAFETY_LEVELS } from '../types'
import type { SafetyLevel } from '../types'

export default function SafetyModeSlider({ level, onChange }: { level: SafetyLevel; onChange: (l: SafetyLevel) => void }) {
  return (
    <div className="safety-mode glass">
      <div className="safety-mode-label"><Shield size={16} /> Safety mode</div>
      <div className="sms-track" role="radiogroup" aria-label="Safety mode">
        {SAFETY_LEVELS.map((s, i) => (
          <button
            key={s.label}
            role="radio"
            aria-checked={level === i}
            className={`sms-option ${level === i ? 'active' : ''}`}
            onClick={() => onChange(i as SafetyLevel)}
          >
            {level === i && <motion.span layoutId="sms-thumb" className="sms-thumb" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="sms-option-text">{s.label}</span>
          </button>
        ))}
      </div>
      <p className="safety-mode-hint">{SAFETY_LEVELS[level].hint}</p>
    </div>
  )
}
