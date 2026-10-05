'use client'

import { useEffect, useRef, useState } from 'react'
import { ReceiptText, Upload } from 'lucide-react'
import { Scrim, Sheet } from '@/src/components/MotionSheet'
import { LoadingCaption } from '@/src/components/LoadingCaption'
import { ScanReview } from './ScanReview'
import { ScanConfirm } from './ScanConfirm'
import type { ScanBillState } from './useScanBillController'
import { useScanBillDraft } from './ScanBillProvider'

interface Props {
  onClose: () => void
  onEnterManually: () => void
}

/**
 * Web twin of Mobile's modals/scan-bill. One dialog walks pick → scanning →
 * review → confirm; review and confirm are wide two-column layouts so the
 * bill photo sits beside the items it was read from.
 */
export function ScanBillModal({ onClose, onEnterManually }: Props) {
  const { state, registerOnDone } = useScanBillDraft()
  const replacementInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => registerOnDone(onClose), [registerOnDone, onClose])
  const { phase } = state
  // Past the picker there are edits to lose, so a stray click on the scrim
  // stops closing the dialog. The ✕ still does.
  const dismissable = phase === 'pick' || phase === 'error'

  const title = phase === 'confirm' ? 'Confirm your log' : 'Scan a bill'
  const subtitle =
    phase === 'review'
      ? `${state.productItems.length} ${state.productItems.length === 1 ? 'item' : 'items'} · scanned just now`
      : null

  return (
    <Scrim className="erd-modal-overlay" onClick={dismissable ? onClose : undefined}>
      <Sheet
        className={`erd-modal-card scan-modal ${phase === 'review' || phase === 'confirm' ? 'is-wide' : ''} ${phase === 'review' ? 'is-review' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Scan a bill"
      >
        <div className="erd-modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="scan-subtitle">{subtitle}</p>}
          </div>
          <div className="scan-head-actions">
            {phase === 'review' && (
              <button type="button" className={`account-pill-btn scan-select-toggle ${state.selecting ? 'is-selected' : ''}`} aria-pressed={state.selecting} onClick={state.toggleSelecting}>
                {state.selecting ? 'Done' : 'Select'}
              </button>
            )}
            {(phase === 'review' || phase === 'confirm') && (
              <button
                type="button"
                className="account-pill-btn scan-reupload"
                aria-label="Re-upload bill"
                onClick={() => replacementInputRef.current?.click()}
                disabled={state.confirmButton.saving || state.confirmButton.success}
              >
                <Upload size={15} aria-hidden="true" />
                <span className="scan-reupload-label">Re-upload bill</span>
              </button>
            )}
            <button
              type="button"
              className="erd-modal-close"
              onClick={onClose}
              aria-label="Close"
              disabled={state.confirmButton.success}
            >
              ✕
            </button>
          </div>
        </div>
        <input
          ref={replacementInputRef}
          type="file"
          accept="image/*"
          hidden
          aria-label="Re-upload bill photo"
          disabled={state.confirmButton.saving || state.confirmButton.success}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file || state.confirmButton.saving || state.confirmButton.success) return
            state.startOver()
            void state.pickFile(file)
          }}
        />

        {phase === 'pick' && <ScanPick {...state} />}

        {phase === 'scanning' && (
          <div className="scan-center">
            {state.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimize
              <img className="scan-scanning-thumb" src={state.imageUrl} alt="" />
            )}
            <LoadingCaption feature="scanBill" />
          </div>
        )}

        {phase === 'error' && (
          <div className="scan-center">
            <p className="scan-error-copy">{state.errorMsg}</p>
            <div className="scan-actions-row">
              <button type="button" className="account-pill-btn" onClick={state.startOver}>
                Try another photo
              </button>
              <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={onEnterManually}>
                Enter manually
              </button>
            </div>
          </div>
        )}

        {phase === 'review' && <ScanReview {...state} />}
        {phase === 'confirm' && <ScanConfirm {...state} />}
      </Sheet>
    </Scrim>
  )
}

/**
 * Mobile offers "Take a photo" and "Choose a screenshot". A desktop's
 * screenshot is usually on the clipboard or the desktop, so paste and drop
 * sit alongside the file picker, and the camera is getUserMedia.
 */
function ScanPick({ pickFile, pickFrame }: Pick<ScanBillState, 'pickFile' | 'pickFrame'>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [dragging, setDragging] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const canUseCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      void pickFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [pickFile])

  // Attach the stream once the <video> exists, and release the camera when
  // this unmounts (a capture moves the dialog on to scanning) or it closes.
  useEffect(() => {
    if (!stream) return
    if (videoRef.current) videoRef.current.srcObject = stream
    return () => stream.getTracks().forEach((t) => t.stop())
  }, [stream])

  async function openCamera() {
    setCameraError('')
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }))
    } catch {
      setCameraError("Camera access is off. Allow it for this site, or choose a file instead.")
    }
  }

  function closeCamera() {
    setStream(null)
    setVideoReady(false)
  }

  if (stream) {
    return (
      <div className="scan-camera">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setVideoReady(true)}
          aria-label="Camera preview"
        />
        <div className="scan-actions-row">
          <button type="button" className="account-pill-btn" onClick={closeCamera}>
            Back
          </button>
          <button
            type="button"
            className="account-pill-btn account-pill-btn--primary"
            disabled={!videoReady}
            onClick={() => videoRef.current && pickFrame(videoRef.current)}
          >
            Take photo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`scan-drop ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) void pickFile(file)
      }}
    >
      <ReceiptText className="scan-drop-icon" size={34} strokeWidth={1.75} aria-hidden="true" />
      <p className="scan-drop-title">Drop a bill or a screenshot here</p>
      <p className="scan-drop-copy">We&apos;ll read the items and calculate your share.</p>
      <div className="scan-actions-row">
        <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={() => inputRef.current?.click()}>
          Choose a file
        </button>
        {canUseCamera && (
          <button type="button" className="account-pill-btn" onClick={openCamera}>
            Use camera
          </button>
        )}
      </div>
      <p className="scan-drop-formats">JPG, PNG or WebP</p>
      {cameraError && <p className="erd-log-error">{cameraError}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="Bill photo"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void pickFile(file)
        }}
      />
    </div>
  )
}
