import { Bell, Menu, Shield } from 'lucide-react'

export default function Topbar({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu: () => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Shield size={18} /></span>
        <span>SAFEWAY</span>
        
      </div>
      <nav className="desktop-nav" aria-label="Main navigation">
        <button className="active">Route planner</button>
   
      </nav>
      <div className="top-actions">
        <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
        <button className="avatar" aria-label="Account">AK</button>
        <button className="icon-button mobile-only" aria-label="Menu" aria-expanded={menuOpen} onClick={onToggleMenu}>
          <Menu size={20} />
        </button>
      </div>
    </header>
  )
}
