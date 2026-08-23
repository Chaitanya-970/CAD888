import { useState, useRef, useEffect } from 'react'
import { ChevronDown, MapPin, Navigation, Search } from 'lucide-react'

export type Destination = {
  name: string
  lat: number
  lng: number
}

export const DESTINATIONS: Destination[] = [
  { name: 'Master Canteen Square',   lat: 20.2666, lng: 85.8434 },
  { name: 'Kalpana Square',          lat: 20.2596, lng: 85.8400 },
  { name: 'Vani Vihar (Utkal Univ)', lat: 20.2989, lng: 85.8374 },
  { name: 'Saheed Nagar',            lat: 20.2862, lng: 85.8468 },
  { name: 'Jaydev Vihar Square',     lat: 20.2948, lng: 85.8178 },
  { name: 'Patia Square',            lat: 20.3531, lng: 85.8187 },
  { name: 'Rasulgarh Square',        lat: 20.2842, lng: 85.8617 },
  { name: 'Sishu Bhawan Square',     lat: 20.2709, lng: 85.8388 },
  { name: 'Acharya Vihar Square',    lat: 20.2923, lng: 85.8324 },
  { name: 'Bomikhal',                lat: 20.2800, lng: 85.8530 },
]

type Props = {
  selected: Destination
  onSelect: (d: Destination) => void
  onFindRoutes: () => void
  loading?: boolean
}

export default function SearchCard({ selected, onSelect, onFindRoutes, loading }: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = DESTINATIONS.filter(d =>
    d.name.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <section className="search-card glass" ref={ref}>
      <div className="eyebrow"><span className="live-dot" /> SAFETY-OPTIMIZED ROUTING</div>
      <div className="location-row"><span className="origin-dot" /><span>Current location</span></div>
      <div className="connector" />

      <button
        className="location-row destination"
        type="button"
        onClick={() => { setOpen(v => !v); setFilter('') }}
      >
        <MapPin size={18} />
        <div><small>WHERE TO?</small><strong>{selected.name}</strong></div>
        <ChevronDown size={17} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {open && (
        <div className="dest-dropdown">
          <div className="dest-search-row">
            <Search size={14} />
            <input
              autoFocus
              type="text"
              placeholder="Search destination…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="dest-search-input"
            />
          </div>
          <ul className="dest-list">
            {filtered.length === 0 && (
              <li className="dest-empty">No results</li>
            )}
            {filtered.map(d => (
              <li key={d.name}>
                <button
                  className={`dest-option ${d.name === selected.name ? 'active' : ''}`}
                  onClick={() => { onSelect(d); setOpen(false) }}
                >
                  <MapPin size={14} />
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="route-button" onClick={onFindRoutes} disabled={loading}>
        {loading
          ? <><Navigation size={17} className="spin" /> Finding routes…</>
          : <><Navigation size={17} /> Find safer routes</>
        }
      </button>
    </section>
  )
}
