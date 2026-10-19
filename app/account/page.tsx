'use client'

import { CurrencySetting } from '@/src/components/CurrencyPicker'
import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence } from 'motion/react'
import { WalletIcon, BankIcon, ArchiveIcon, BrainIcon, CaretRightIcon, CompassIcon, CreditCardIcon, DatabaseIcon, FileTextIcon, GiftIcon, ClockCounterClockwiseIcon, ChartLineIcon, LockIcon, ChatCircleIcon, ReceiptIcon, RepeatIcon, ScanIcon, ScrollIcon, SlidersHorizontalIcon, TrendUpIcon, UserPlusIcon, UsersIcon, TicketIcon, CheckIcon, type PhosphorIcon } from '@/src/components/icons'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { useAppearance } from '../../components/AppearanceProvider'
import { useHideAmounts } from '../../src/hooks/useHideAmounts'
import { useMoneyBrain } from '../../components/MoneyBrainProvider'
import { LogExpenseModal } from '../../src/components/LogExpenseModal'
import { ScanBillModal } from '../../src/features/scan-bill/ScanBillModal'
import { SignOutDialog } from '../../src/components/ConfirmDialog'
import { GetAppDialog } from '../../src/components/GetAppDialog'
import { SubscriptionSection } from '../../src/components/billing/SubscriptionSection'
import { billingVisible, planSummary } from '../../src/components/billing/copy'
import { useBillingStatus } from '../../src/hooks/useBillingStatus'
import { useHiddenFeatures } from '../../src/hooks/useUser'
import type { HideableFeature } from '../../src/lib/features'
import { FEEDBACK_BOARD_PATH } from '../../lib/links'
import { Toast } from '../../src/components/Toast'
import { NewBudgetEntry } from '../../src/components/BudgetSwitcher'
import { BudgetMembersEntry } from '../../src/components/BudgetMembers'
import { JoinCodeEntry } from '../../src/components/JoinBudget'
import { track } from '../../src/lib/analytics'

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
  const hidden = useHiddenFeatures()
  const shown = (key: HideableFeature) => !hidden.includes(key)
  const [doc, setDoc] = useState<UserDoc | null>(null)
  const [notifyCadence, setNotifyCadence] = useState<NotifyCadence>('off')
  const [showScan, setShowScan] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [copiedToast, setCopiedToast] = useState(0)

  const inviteFriend = async () => {
    const url = `${window.location.origin}/?ref=invite`
    const text = "I've been budgeting with Aviary. Give it a try:"
    if (navigator.share) {
      try {
        await navigator.share({ text, url })
        track('invite_shared', { method: 'share' })
      } catch {
        // Dismissed the share sheet.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
    } catch {
      return
    }
    track('invite_shared', { method: 'copy' })
    setCopiedToast((n) => n + 1)
  }
  const [showGetApp, setShowGetApp] = useState(false)

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
        <CaretRightIcon size={16} className="account-row-arrow" aria-hidden="true" />
      </Link>

      <Link href={FEEDBACK_BOARD_PATH} className="account-early-card">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="account-badge account-early-badge">Early access</span>
          <div className="account-early-title">Aviary&rsquo;s still early. Help shape it.</div>
          <div className="account-row-hint">Post ideas and vote on what we build next. We read every one.</div>
        </div>
        <ChatCircleIcon size={18} aria-hidden="true" />
      </Link>

      <SubscriptionSection />

      <div>
        <div className="account-section-label" style={{ marginBottom: 10 }}>
          Features
        </div>
        <div className="account-feature-grid">
          {shown('wrapped') && (
            <FeatureCard
              icon={GiftIcon}
              tone="coral"
              label="Expense Wrapped"
              blurb="Download the mobile app to view this."
              href={PLAY_STORE_URL}
              external
              locked
            />
          )}
          {shown('askAviary') && <FeatureCard icon={BrainIcon} tone="gold" label="Ask Aviary" blurb="Ask about your spending" onClick={() => openMoneyBrain()} />}
          {shown('investments') && <FeatureCard icon={TrendUpIcon} tone="mint" label="Investments" blurb="Portfolio at a glance" href="/investments" />}
          {shown('billScan') && <FeatureCard icon={ScanIcon} tone="mint" label="Scan a bill" blurb="Split a cart or receipt" onClick={() => setShowScan(true)} />}
          {shown('income') && <FeatureCard icon={WalletIcon} tone="mint" label="Income" blurb="What comes in and when" href="/account/income" />}
          {shown('accounts') && <FeatureCard icon={BankIcon} tone="gold" label="Accounts" blurb="Bank, card and cash" href="/account/accounts" />}
          {shown('recurring') && <FeatureCard icon={RepeatIcon} tone="violet" label="Recurring expenses" blurb="Plan upcoming payments" href="/account/recurring" />}
          <FeatureCard icon={ArchiveIcon} tone="blue" label="Archive" blurb="Restore deleted items" href="/account/archive" />
          {shown('subscriptions') && <FeatureCard icon={ReceiptIcon} tone="violet" label="Subscriptions" blurb="What renews and when" href="/account/subscriptions" />}
          {shown('insights') && <FeatureCard icon={ChartLineIcon} tone="blue" label="Insights" blurb="Trends and breakdowns" href="/insights" />}
        </div>
      </div>

      <div>
        <div className="account-section-label" style={{ marginBottom: 10 }}>
          Preferences
        </div>
        <div className="account-card">
          <CurrencySetting />
          <AccountRow
            icon={SlidersHorizontalIcon}
            label="Features"
            hint={hidden.length ? `${hidden.length} hidden` : 'Everything on'}
            href="/account/features"
          />
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
                <button type="button" className="account-inline-link" onClick={() => setShowGetApp(true)}>
                  Get it
                </button>
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
          <AccountRow icon={LockIcon} label="Account & security" href="/account/security" />
          <AccountRow icon={DatabaseIcon} label="Your data" href="/account/data" />
          <NewBudgetEntry render={(open) => <AccountRow icon={WalletIcon} label="New budget" hint="Keep a trip or a household apart" onClick={open} />} />
          <BudgetMembersEntry render={(open, budget) => <AccountRow icon={UsersIcon} label={budget.members.length > 1 ? `${budget.name} members` : 'Share this budget'} hint={budget.role === 'owner' ? 'Invite someone to budget with you' : "See who's in, or leave"} onClick={open} />} />
          <JoinCodeEntry render={(open) => <AccountRow icon={TicketIcon} label="Join with a code" hint="Got an invite? Pop it in" onClick={open} />} />
          {shown('billScan') && <AccountRow icon={ClockCounterClockwiseIcon} label="Bills Scanned" href="/account/bill-scans" />}
          {/* Twin of Mobile's Plan & billing row: tapping it shows the plan once
              billing is live, or the trial notice before then. The badge is a
              sibling of the link, since an anchor can't nest inside one. */}
          <div className="account-row-wrap" style={{ display: 'flex', alignItems: 'center', paddingRight: 16 }}>
            <Link
              href={showBilling ? '#subscription' : '/account/trial-notice?from=more'}
              className="account-row"
              style={{ flex: 1, minWidth: 0 }}
            >
              <CreditCardIcon size={16} aria-hidden="true" />
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
          <AccountRow icon={CompassIcon} label="How this works" href="/account/guided-tour" />
          <AccountRow icon={ScrollIcon} label="Changelog" href="/account/changelog" />
          <AccountRow icon={UserPlusIcon} label="Invite a friend" hint="Share Aviary with someone" onClick={inviteFriend} />
          <AccountRow icon={ChatCircleIcon} label="Help & feedback" hint="We read every one" href="/account/help" />
          <AccountRow icon={FileTextIcon} label="Terms & privacy" href="/legal/privacy" />
        </div>
      </div>

      <Toast trigger={copiedToast} message="Invite link copied" icon={CheckIcon} />

      <button type="button" className="account-signout-btn" onClick={() => setConfirmSignOut(true)}>
        Sign out
      </button>

      <AnimatePresence>
        {confirmSignOut && <SignOutDialog onCancel={() => setConfirmSignOut(false)} />}
        {showGetApp && <GetAppDialog email={email || undefined} onClose={() => setShowGetApp(false)} />}
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
  icon: PhosphorIcon
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
          <LockIcon size={12} />
        </span>
      )}
      <span className="account-feature-icon" style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})` }} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="account-feature-title">{label}</span>
      <span className="account-feature-copy">{blurb}</span>
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

function AccountRow({ icon: Icon, label, hint, href, onClick }: { icon: PhosphorIcon; label: string; hint?: string } & ({ href: string; onClick?: never } | { href?: never; onClick: () => void })) {
  const body = (
    <>
      <Icon size={16} aria-hidden="true" />
      <span className="account-row-label">
        {label}
        {hint && <span className="account-row-hint">{hint}</span>}
      </span>
      <CaretRightIcon size={16} className="account-row-arrow" aria-hidden="true" />
    </>
  )
  if (onClick) {
    return (
      <button type="button" className="account-row" onClick={onClick}>
        {body}
      </button>
    )
  }
  return (
    <Link href={href!} className="account-row">
      {body}
    </Link>
  )
}
