'use client'

import { DeviceMobileIcon } from '@/src/components/icons'
import { Scrim, Sheet } from './MotionSheet'
import { IosWaitlist } from './landing/IosWaitlist'
import { GET_ANDROID_URL } from './billing/copy'
import { track } from '../lib/analytics'

/** Where the web app sends people for the phone app: Google Play, or the iPhone waitlist. Render inside <AnimatePresence>. */
export function GetAppDialog({ email, onClose }: { email?: string; onClose: () => void }) {
  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <Sheet className="erd-modal-card archive-confirm get-app-dialog" role="dialog" aria-modal="true" aria-label="Get the app" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <h3 className="archive-confirm-title">Get the app</h3>
        <p className="account-row-meta">Alerts, the home-screen widget and Wrapped all live in the phone app.</p>
        <div className="archive-confirm-actions">
          <a className="action-button get-app-play" href={GET_ANDROID_URL} target="_blank" rel="noreferrer"
            onClick={() => track('store_cta_clicked', { placement: 'account_notifications' })}>
            <DeviceMobileIcon size={16} aria-hidden="true" />Open Google Play
          </a>
        </div>
        <IosWaitlist placement="account_notifications" className="get-app-waitlist" buttonClass="action-button" knownEmail={email} />
        <div className="archive-confirm-actions">
          <button type="button" className="account-pill-btn" onClick={onClose}>Close</button>
        </div>
      </Sheet>
    </Scrim>
  )
}
