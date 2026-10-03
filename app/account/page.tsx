'use client'

import { CurrencySetting } from '@/src/components/CurrencyPicker'
import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence } from 'motion/react'
import {
  Archive,
  Brain,
  ChevronRight,
  Compass,
  CreditCard,
  Database,
  FileText,
  Gift,
  History,
  LineChart,
  Lock,
  MessageCircle,
  Receipt,
  Repeat,
  ScanLine,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { useAppearance } from '../../components/AppearanceProvider'
import { useHideAmounts } from '../../src/hooks/useHideAmounts'
import { useMoneyBrain } from '../../components/MoneyBrainProvider'
import { LogExpenseModal } from '../../src/components/LogExpenseModal'
import { ScanBillModal } from '../../src/features/scan-bill/ScanBillModal'
import { SignOutDialog } from '../../src/components/ConfirmDialog'
import { SubscriptionSection } from '../../src/components/billing/SubscriptionSection'
import { billingVisible, planSummary } from '../../src/components/billing/copy'
import { useBillingStatus } from '../../src/hooks/useBillingStatus'

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'

type NotifyCadence = 'off' | 'weekly' | 'daily'

interface UserDoc {
  email: string
  name: string | null
  avatarUrl: string | null
  notifyCadence?: NotifyCadence
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
] as const

const NOTIFY_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
] as const

export default function AccountPage() {
  const { user } = useAuth()
  const billing = useBillingStatus().data
  const showBilling = billingVisible(billing)
  const { preference, setPreference } = useAppearance()
  const { openMoneyBrain } = useMoneyBrain()
  const [hideAmounts, setHideAmounts] = useHideAmounts()
  const [doc, setDoc] = useState<UserDoc | null>(null)
  const [notifyCadence, setNotifyCadence] = useState<NotifyCadence>('off')
  const [showScan, setShowScan] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/user')
      if (!res.ok) return
      const data: UserDoc = await res.json()
      setDoc(data)
      setNotifyCadence(data.notifyCadence ?? 'off')
    })()
  }, [])

  async function updateCadence(next: NotifyCadence) {
    setNotifyCadence(next)
    await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifyCadence: next }),
    })
  }

  const email = doc?.email ?? user?.email ?? ''
  const name = doc?.name || email || 'You'
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <>
      <Link href="/account/security" className="account-profile-card">
        {doc?.avatarUrl ? (
          <Image
            className="account-avatar"
            src={doc.avatarUrl}
            alt=""
            width={52}
            height={52}
            unoptimized
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div className="account-avatar" aria-hidden="true">
            {initial}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="account-profile-name">{name}</div>
          {email && <div className="account-profile-email">{email}</div>}
        </div>
        <ChevronRight size={16} className="account-row-arrow" aria-hidden="true" />
      </Link>

      <SubscriptionSection />

      <div>
        <div className="account-section-label" style={{ marginBottom: 10 }}>
          Features
        </div>
        <div className="account-feature-grid">
          <FeatureCard
            icon={Gift}
            tone="coral"
            label="Expense Wrapped"
            blurb={<span className="account-feature-copy">Download the mobile app to view this.</span>}
            href={PLAY_STORE_URL}
            external
            locked
          />
          <FeatureCard icon={Brain} tone="gold" label="Ask Aviary" blurb="Ask about your spending" onClick={() => openMoneyBrain()} />
          <FeatureCard icon={TrendingUp} tone="mint" label="Investments" blurb="Portfolio at a glance" href="/investments" />
          <FeatureCard icon={ScanLine} tone="mint" label="Scan a bill" blurb="Split a cart or receipt" onClick={() => setShowScan(true)} />
          <FeatureCard icon={Repeat} tone="violet" label="Recurring expenses" blurb="Plan upcoming payments" href="/account/recurring" />
          <FeatureCard icon={Archive} tone="blue" label="Archive" blurb="Restore deleted items" href="/account/archive" />
          <FeatureCard icon={Receipt} tone="violet" label="Subscriptions" blurb="What renews and when" href="/account/subscriptions" />
          <FeatureCard icon={LineChart} tone="blue" label="Insights" blurb="Trends and breakdowns" href="/insights" />
        </div>
      </div>

      <div>
        <div className="account-section-label" style={{ marginBottom: 10 }}>
          Preferences
        </div>
        <div className="account-card">
          <CurrencySetting />
          <div className="account-row" style={{ cursor: 'default' }}>
            <span className="account-row-label">Appearance</span>
            <div className="account-segmented" role="group" aria-label="Theme">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={preference === opt.value ? 'is-active' : ''}
                  onClick={() => setPreference(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <label className="account-row">
            <span className="account-row-label">
              Hide amounts
              <span className="account-row-hint">Blur balances when the app opens</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="account-switch"
              checked={hideAmounts}
              onChange={(e) => setHideAmounts(e.target.checked)}
            />
          </label>
          <div className="account-row" style={{ cursor: 'default' }}>
            <span className="account-row-label">
              Notifications
              <span className="account-row-hint">
                Alerts only arrive on the Android app.{' '}
                <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-ink)', fontWeight: 700 }}>
                  Get it
                </a>
              </span>
            </span>
            <div className="account-segmented" role="group" aria-label="Notification cadence">
              {NOTIFY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={notifyCadence === opt.value ? 'is-active' : ''}
                  onClick={() => updateCadence(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="account-section-label" style={{ marginBottom: 10 }}>
          Account
        </div>
        <div className="account-card">
          <AccountRow icon={Lock} label="Account & security" href="/account/security" />
          <AccountRow icon={Database} label="Your data" href="/account/data" />
          <AccountRow icon={History} label="Bills Scanned" href="/account/bill-scans" />
          {/* Twin of Mobile's Plan & billing row: tapping it shows the plan once
              billing is live, or the trial notice before then. The badge is a
              sibling of the link, since an anchor can't nest inside one. */}
          <div className="account-row-wrap" style={{ display: 'flex', alignItems: 'center', paddingRight: 16 }}>
            <Link
              href={showBilling ? '#subscription' : '/account/trial-notice?from=more'}
              className="account-row"
              style={{ flex: 1, minWidth: 0 }}
            >
              <CreditCard size={16} aria-hidden="true" />
              <span className="account-row-label">
                Plan &amp; billing
                <span className="account-row-hint">
                  {showBilling && billing ? planSummary(billing) : "You're on the trial plan"}
                </span>
              </span>
            </Link>
            <a
              className="account-badge"
              href="https://github.com/Sukrittt/aviary-mobile"
              target="_blank"
              rel="noreferrer"
            >
              Open source
            </a>
          </div>
          <AccountRow icon={Compass} label="How this works" href="/account/guided-tour" />
          <AccountRow icon={FileText} label="Changelog" href="/account/changelog" />
          <AccountRow icon={MessageCircle} label="Help & feedback" href="/account/help" />
          <AccountRow icon={FileText} label="Terms & privacy" href="/legal/privacy" />
        </div>
      </div>

      <button type="button" className="account-signout-btn" onClick={() => setConfirmSignOut(true)}>
        Sign out
      </button>

      <AnimatePresence>
        {confirmSignOut && <SignOutDialog onCancel={() => setConfirmSignOut(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showLog && <LogExpenseModal onClose={() => setShowLog(false)} onSaved={() => {}} />}
      </AnimatePresence>
      <AnimatePresence>
        {showScan && (
          <ScanBillModal
            onClose={() => setShowScan(false)}
            onEnterManually={() => {
              setShowScan(false)
              setShowLog(true)
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

type Tone = 'coral' | 'gold' | 'mint' | 'violet' | 'blue'

function FeatureCard({
  icon: Icon,
  tone,
  label,
  blurb,
  href,
  external,
  locked,
  onClick,
}: {
  icon: LucideIcon
  tone: Tone
  label: string
  blurb: ReactNode
  href?: string
  external?: boolean
  locked?: boolean
  onClick?: () => void
}) {
  const className = locked ? 'account-feature-card account-feature-card--locked' : 'account-feature-card'
  const body = (
    <>
      {locked && (
        <span className="account-feature-lock-badge" aria-hidden="true">
          <Lock size={12} />
        </span>
      )}
      <span className="account-feature-icon" style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})` }} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="account-feature-title">{label}</span>
      {blurb}
    </>
  )
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {body}
      </a>
    )
  }
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={!onClick}>
      {body}
    </button>
  )
}

function AccountRow({ icon: Icon, label, href }: { icon: LucideIcon; label: string; href: string }) {
  return (
    <Link href={href} className="account-row">
      <Icon size={16} aria-hidden="true" />
      <span className="account-row-label">{label}</span>
      <ChevronRight size={16} className="account-row-arrow" aria-hidden="true" />
    </Link>
  )
}
