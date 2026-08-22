import { motion } from 'framer-motion'
import { Flag, X } from 'lucide-react'
import { useState } from 'react'
import { reportKinds } from '../data'

export default function ReportModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (k: string) => void }) {
  const [choice, setChoice] = useState(reportKinds[0])
  return (
    <motion.div className="modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="report-modal"
        initial={{ y: 30, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 30, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={onClose} aria-label="Close"><X /></button>
        <span className="modal-icon"><Flag /></span>
        <h2>Share a safety signal</h2>
        <p>Your report is anonymous and helps others choose with more confidence.</p>
        <div className="report-choices">
          {reportKinds.map((x) => (
            <button className={choice === x ? 'picked' : ''} onClick={() => setChoice(x)} key={x}>{x}</button>
          ))}
        </div>
        <button className="submit-report" onClick={() => onSubmit(choice)}>Submit anonymous report</button>
        <small>Precise locations are softened to protect privacy.</small>
      </motion.div>
    </motion.div>
  )
}
