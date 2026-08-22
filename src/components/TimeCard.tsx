import { Clock3 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { hours } from '../data'

export default function TimeCard({ hour, onChange }: { hour: number; onChange: (h: number) => void }) {
  return (
    <section className="time-card glass">
      <div className="time-label"><Clock3 size={16} /><b>Leaving around {hours[hour]}</b><small>Scores update as the night changes</small></div>
      <input
        aria-label="Departure time"
        type="range"
        min="0"
        max="7"
        value={hour}
        onChange={(e) => onChange(+e.target.value)}
        style={{ '--value': `${(hour / 7) * 100}%` } as CSSProperties}
      />
      <div className="time-ticks"><span>6 PM</span><span>9 PM</span><span>12 AM</span><span>1 AM</span></div>
    </section>
  )
}
