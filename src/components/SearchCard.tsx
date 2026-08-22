import { ChevronDown, MapPin, Navigation } from 'lucide-react'

export default function SearchCard({ destination }: { destination: string }) {
  return (
    <section className="search-card glass">
      <div className="eyebrow"><span className="live-dot" /> SAFETY-OPTIMIZED ROUTING</div>
      <div className="location-row"><span className="origin-dot" /><span>Current location</span></div>
      <div className="connector" />
      <button className="location-row destination" type="button">
        <MapPin size={18} />
        <div><small>WHERE TO?</small><strong>{destination}</strong></div>
        <ChevronDown size={17} />
      </button>
      <button className="route-button"><Navigation size={17} /> Find safer routes</button>
    </section>
  )
}
