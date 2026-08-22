import { Plus, Users } from 'lucide-react'

export default function CompanionCard() {
  return (
    <aside className="companion-card glass">
      <div className="companion-icon"><Users size={17} /></div>
      <div><b>Verified companions nearby</b><small>3 people are walking this area</small></div>
      <button aria-label="Invite a companion"><Plus size={16} /></button>
    </aside>
  )
}
