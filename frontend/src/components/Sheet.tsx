import { useEffect } from 'react'
import { IClose } from './Icons'

export function Sheet({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal>
        <div className="sheet-head">
          <span className="grabber" />
          <span className="eyebrow" style={{ paddingTop: 6 }}>{label}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IClose size={18} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  )
}
