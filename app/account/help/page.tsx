import { pageMetadata } from '@/lib/seo'
import Link from 'next/link'

const REPO_URL = 'https://github.com/Sukrittt/aviary-mobile'
const FEEDBACK_BOARD_URL = 'https://aviary.userjot.com'

export default function HelpPage() {
  return (
    <>
      <div className="account-card">
        <div style={{ padding: 16 }}>
          <div className="account-row-label" style={{ marginBottom: 6 }}>
            How envelopes work
          </div>
          <p className="account-help-copy">
            All income gets assigned to an envelope — rent, food, subscriptions, whatever you spend on.
            Money that hasn&apos;t been assigned yet sits in Ready to Assign. Overspend an envelope and you move
            money into it from another one; the total never lies, it just moves. At the start of a new month,
            whatever&apos;s left in each envelope rolls forward instead of resetting to zero, so a slow month in
            one category quietly covers a busy one later.
          </p>
        </div>
      </div>
      <div className="account-card">
        <Link href="/account/guided-tour" className="account-row">
          <span className="account-row-icon" aria-hidden="true">
            🧭
          </span>
          <span className="account-row-label">Take the guided tour</span>
          <span className="account-row-arrow" aria-hidden="true">
            →
          </span>
        </Link>
        <a href={FEEDBACK_BOARD_URL} target="_blank" rel="noreferrer" className="account-row">
          <span className="account-row-icon" aria-hidden="true">
            💬
          </span>
          <span className="account-row-label">Feedback board</span>
          <span className="account-row-arrow" aria-hidden="true">
            →
          </span>
        </a>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="account-row">
          <span className="account-row-icon" aria-hidden="true">
            ⭐
          </span>
          <span className="account-row-label">Star the repo</span>
          <span className="account-row-arrow" aria-hidden="true">
            →
          </span>
        </a>
      </div>
    </>
  )
}

export const metadata = pageMetadata('/account/help')
