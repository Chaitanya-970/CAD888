import { motion } from 'framer-motion'
import { Copy, Link, MessageCircle, Share2, UserPlus, X } from 'lucide-react'
import { useState } from 'react'

export default function ShareModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div className="modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="report-modal share-modal"
        initial={{ y: 30, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 30, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={onClose} aria-label="Close"><X /></button>
        <span className="modal-icon share-icon"><Share2 /></span>
        <h2>Share your live route</h2>
        <p>Let someone track your walk in real time — they'll see your route and ETA until you arrive safely.</p>

        <div className="share-options">
          <button className="share-option" onClick={handleCopy}>
            <span className="share-opt-icon"><Link size={18} /></span>
            <span className="share-opt-text">
              <b>{copied ? 'Copied!' : 'Copy share link'}</b>
              <small>Anyone with the link can track you</small>
            </span>
            <Copy size={16} className="share-opt-action" />
          </button>

          <button className="share-option">
            <span className="share-opt-icon soi-green"><MessageCircle size={18} /></span>
            <span className="share-opt-text">
              <b>Send via WhatsApp</b>
              <small>Share with a contact directly</small>
            </span>
          </button>

          <button className="share-option">
            <span className="share-opt-icon soi-violet"><UserPlus size={18} /></span>
            <span className="share-opt-text">
              <b>Add an emergency contact</b>
              <small>Auto-share on every walk</small>
            </span>
          </button>
        </div>

        <div className="share-preview">
          <div className="share-preview-dot" />
          <span>Live tracking active · sharing for <b>27 min</b></span>
        </div>

        <small>Location data is end-to-end encrypted and deleted after your walk.</small>
      </motion.div>
    </motion.div>
  )
}
