'use client'

import { useId, useRef, useState } from 'react'
import { Camera, ChevronDown, X } from 'lucide-react'

interface Props {
  /** What to show as the thumbnail: a local data URL before saving, or the signed URL of a saved photo. */
  photoUrl: string | null
  /** Shown on the closed toggle so a saved photo isn't hidden without a trace. */
  hasPhoto?: boolean
  busy?: boolean
  error?: string
  onOpen?: () => void
  onPick: (file: File) => void
  onRemove: () => void
}

/**
 * The "More" disclosure on the log and edit dialogs. Photos are a side
 * feature, so they never sit on the quick-log path: the control only appears
 * once the user asks for more.
 */
export function ExpensePhotoMore({ photoUrl, hasPhoto, busy, error, onOpen, onPick, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelId = useId()

  return (
    <section className="erd-more">
      <button
        type="button"
        className="erd-more-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen(!open)
        }}
      >
        {hasPhoto && !open ? 'More · 1 photo' : 'More'}
        <ChevronDown size={14} aria-hidden="true" className={open ? 'is-open' : undefined} />
      </button>

      {open && (
        <div id={panelId} className="erd-more-panel">
          <div className="erd-log-label">Photo</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            aria-label="Choose a photo"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onPick(file)
            }}
          />
          {photoUrl ? (
            <div className="erd-photo">
              <a href={photoUrl} target="_blank" rel="noreferrer" className="erd-photo-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL or short-lived signed Blob URL, nothing to optimize */}
                <img src={photoUrl} alt="Expense photo" />
              </a>
              <div className="erd-photo-actions">
                <button type="button" className="erd-date-chip" disabled={busy} onClick={() => inputRef.current?.click()}>
                  Replace
                </button>
                <button type="button" className="erd-date-chip" disabled={busy} onClick={onRemove}>
                  <X size={14} aria-hidden="true" /> Remove
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="erd-date-chip" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Camera size={15} aria-hidden="true" />
              {busy ? 'Loading…' : 'Add a photo'}
            </button>
          )}
          {error && <p className="erd-log-error" role="alert">{error}</p>}
        </div>
      )}
    </section>
  )
}
