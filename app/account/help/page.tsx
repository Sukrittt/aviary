import { pageMetadata } from '@/lib/seo'
import { HOW_CATEGORIES_WORK } from '@/src/components/landing/faqs'
import Link from 'next/link'
import { FEEDBACK_BOARD_PATH } from '@/lib/links'
import { BugIcon, ChatCircleIcon, CompassIcon, StarIcon } from '@/src/components/icons'

const REPO_URL = 'https://github.com/Sukrittt/aviary-mobile'

export default function HelpPage() {
  return (
    <>
      <div className="account-card">
        <div style={{ padding: 16 }}>
          <div className="account-row-label" style={{ marginBottom: 6 }}>
            How categories work
          </div>
          <p className="account-help-copy">{HOW_CATEGORIES_WORK}</p>
        </div>
      </div>
      <div className="account-card">
        <Link href="/account/guided-tour" className="account-row">
          <span className="account-row-icon" aria-hidden="true">
            <CompassIcon size={18} />
          </span>
          <span className="account-row-label">Take the guided tour</span>
          <span className="account-row-arrow" aria-hidden="true">
            →
          </span>
        </Link>
        <Link href={FEEDBACK_BOARD_PATH} className="account-row">
          <span className="account-row-icon" aria-hidden="true">
            <ChatCircleIcon size={18} />
          </span>
          <span className="account-row-label">Feedback board</span>
          <span className="account-row-arrow" aria-hidden="true">
            →
          </span>
        </Link>
        <Link href="/account/feedback" className="account-row">
          <span className="account-row-icon" aria-hidden="true">
            <BugIcon size={18} />
          </span>
          <span className="account-row-label">Report a bug</span>
          <span className="account-row-arrow" aria-hidden="true">
            →
          </span>
        </Link>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="account-row">
          <span className="account-row-icon" aria-hidden="true">
            <StarIcon size={18} />
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
