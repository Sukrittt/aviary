'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Render the image directly: browsers block opening a data URL in a new tab. */
export function BillImagePreview({ src, onClose }: { src: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="scan-photo-preview"
      aria-label="Bill photo preview"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="scan-photo-preview-head">
        <h3>Bill photo</h3>
        <button type="button" className="erd-modal-close" aria-label="Close bill photo" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL rendered without navigation */}
      <img src={src} alt="Full scanned bill" />
    </dialog>,
    document.querySelector('.expense-redesign') ?? document.body,
  )
}
