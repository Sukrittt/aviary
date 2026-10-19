'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BankIcon, CalendarBlankIcon, ClockIcon, PencilSimpleIcon, TagIcon, TrashIcon, XIcon } from './icons'
import { CategoryIcon } from './CategoryIcon'
import { DeletingRow } from './DeletingRow'
import { Scrim } from './MotionSheet'
import { useExpensesFeed } from '../hooks/useExpenses'
import { useCategoryIcons, useCategoryStyle } from '../hooks/useCategories'
import { useCurrency } from '../context/CurrencyContext'
import { splitEmoji } from '../lib/emoji'
import { toTransactions, type Transaction } from '../lib/expenseTransactions'
import { stablePhotoUrl } from '../lib/activityFeed'
import { EMPTY } from '../lib/constants'

const FEED_PAGE_SIZE = 24
// About how long the dialog takes to shrink back into its card (MotionSheet's spring).
const CLOSE_MS = 350

type FeedParams = { category?: string; account?: string; from?: string; to?: string; q?: string }

function dayHeading(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function timeOf(timestamp: string): string {
  const d = new Date(timestamp)
  if (!timestamp || Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
}

/**
 * Activity's feed view: every expense as a card, photo first, newest at the
 * top, loading more as you scroll. Expenses without a photo stay a compact
 * card, just the header and notes, so photos stand out. A card opens into its detail
 * dialog (the card itself grows into it), with Edit and Delete. Twin of
 * Mobile's src/components/activity/ActivityFeed.tsx; income stays in the list.
 */
export function TransactionsFeed({ params, hideAmounts, accountNameOf, removedKeys, txnKey, isDeleting, onDeleteDone, onEdit, onDelete, empty }: {
  params: FeedParams
  hideAmounts: boolean
  accountNameOf: (id: string) => string
  removedKeys: ReadonlySet<string>
  txnKey: (t: Transaction) => string
  /** The confirmed delete whose card should sweep away; `onDeleteDone` then sends it. */
  isDeleting: (t: Transaction) => boolean
  onDeleteDone: (t: Transaction) => void
  onEdit: (t: Transaction) => void
  /** Asks to delete; the detail dialog has already closed by then. */
  onDelete: (t: Transaction) => void
  empty: ReactNode
}) {
  const feed = useExpensesFeed({ limit: FEED_PAGE_SIZE, ...params })
  const categoryIcons = useCategoryIcons()
  const groups = useMemo(() => {
    const rows = toTransactions(feed.data?.pages.flatMap((p) => p.rows) ?? EMPTY).filter((t) => !removedKeys.has(txnKey(t)))
    const out: { date: string; txns: Transaction[] }[] = []
    for (const t of rows) {
      if (out.at(-1)?.date !== t.date) out.push({ date: t.date, txns: [] })
      out.at(-1)!.txns.push(t)
    }
    return out
  }, [feed.data, removedKeys, txnKey])
  const [open, setOpen] = useState<Transaction | null>(null)
  // Delete waits for the dialog to shrink back into its card, so the sweep
  // plays where you can see it. Timed rather than read from the exit
  // callback, which a layout animation can hold up.
  const deleteTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(deleteTimer.current), [])

  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed
  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (feed.isLoading) return <div className="feed-status" role="status">Loading your feed…</div>
  if (feed.isError) return <div className="txn-timeline-empty">Couldn&apos;t load your feed. Check your connection and try again.</div>
  if (groups.length === 0) return <>{empty}</>

  return (
    <div className="feed">
      {groups.map((g) => (
        <section key={g.date} className="feed-day" aria-label={dayHeading(g.date)}>
          <h2 className="feed-day-label">{dayHeading(g.date)}</h2>
          <div className="feed-grid">
            {g.txns.map((t) => (
              <DeletingRow key={txnKey(t)} className="feed-cell" active={isDeleting(t)} onDone={() => onDeleteDone(t)}>
                <FeedCard
                  txn={t}
                  layoutKey={txnKey(t)}
                  hideAmounts={hideAmounts}
                  icon={categoryIcons.get(t.category)}
                  onOpen={() => setOpen(t)}
                />
              </DeletingRow>
            ))}
          </div>
        </section>
      ))}
      <div ref={sentinel} className="feed-more">
        {isFetchingNextPage ? (
          <span role="status">Loading more…</span>
        ) : hasNextPage ? (
          <button type="button" className="action-button is-ghost" onClick={() => void fetchNextPage()}>
            Load more
          </button>
        ) : (
          <span>You&apos;re all caught up.</span>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <TransactionDetailDialog
            key={txnKey(open)}
            txn={open}
            layoutKey={txnKey(open)}
            hideAmounts={hideAmounts}
            icon={categoryIcons.get(open.category)}
            account={accountNameOf(open.accountId)}
            onClose={() => setOpen(null)}
            onEdit={() => {
              setOpen(null)
              onEdit(open)
            }}
            onDelete={() => {
              const t = open
              setOpen(null)
              deleteTimer.current = setTimeout(() => onDelete(t), CLOSE_MS)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function FeedCard({ txn, layoutKey, hideAmounts, icon, onOpen }: {
  txn: Transaction
  layoutKey: string
  hideAmounts: boolean
  icon?: string
  onOpen: () => void
}) {
  const styleOf = useCategoryStyle()
  const { formatCurrency } = useCurrency()
  const name = splitEmoji(txn.category).text
  const uri = useMemo(() => (txn.photoUrl ? stablePhotoUrl(txn.photoUrl) : null), [txn.photoUrl])

  return (
    <motion.article layoutId={`feed-${layoutKey}`} className="feed-card">
      {/* One button over the whole card, like the list rows' txn-row-trigger. */}
      <button type="button" className="feed-card-open" aria-label={`${txn.item}, ${name}. View details`} onClick={onOpen} />
      <header className="feed-card-head">
        <span className="txn-timeline-icon" style={styleOf(name)} aria-hidden="true">
          <CategoryIcon name={txn.category} icon={icon} />
        </span>
        <span className="feed-card-title">
          <span className="feed-card-item">{txn.item}</span>
          <span className="feed-card-meta">{name}</span>
        </span>
        <span className={`feed-card-amount${hideAmounts ? ' amount-hidden' : ''}`}>
          {hideAmounts ? '---' : formatCurrency(txn.amountInr)}
        </span>
      </header>
      {uri ? (
        <div className="feed-card-media">
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Blob URL, nothing to optimize */}
          <img src={uri} alt="" className="feed-card-photo" />
        </div>
      ) : null}
      {txn.notes.trim() ? <p className="feed-card-notes">{txn.notes.trim()}</p> : null}
    </motion.article>
  )
}

function TransactionDetailDialog({ txn, layoutKey, hideAmounts, icon, account, onClose, onEdit, onDelete }: {
  txn: Transaction
  layoutKey: string
  hideAmounts: boolean
  icon?: string
  /** The account's name, '' when the expense has none. */
  account: string
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const styleOf = useCategoryStyle()
  const { formatCurrency } = useCurrency()
  const name = splitEmoji(txn.category).text
  const photo = txn.photoUrl ? stablePhotoUrl(txn.photoUrl) : null
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const logged = new Date(txn.timestamp)
  // A backdated expense was logged on another day; its time is when it was
  // logged, not spent. Timestamps carry the user's own offset
  // (2026-09-21T08:30:15+05:30), so their date part is the user's day too,
  // whatever zone this browser is in.
  const sameDay = txn.timestamp.slice(0, 10) === txn.date
  const time = timeOf(txn.timestamp)
  const rows = [
    { icon: TagIcon, label: 'Category', value: name },
    { icon: CalendarBlankIcon, label: 'Date', value: dayHeading(txn.date) },
    ...(time
      ? [{ icon: ClockIcon, label: sameDay ? 'Time' : 'Logged', value: sameDay ? time : `${logged.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${time}` }]
      : []),
    { icon: BankIcon, label: 'Account', value: account || 'Not set' },
  ]

  return (
    <Scrim className="erd-modal-overlay" onClick={onClose}>
      <motion.div
        layoutId={`feed-${layoutKey}`}
        className="feed-detail"
        role="dialog"
        aria-modal="true"
        aria-label={txn.item}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="feed-card-head">
          <span className="txn-timeline-icon" style={styleOf(name)} aria-hidden="true">
            <CategoryIcon name={txn.category} icon={icon} />
          </span>
          <span className="feed-card-title">
            <span className="feed-card-item">{txn.item}</span>
            <span className="feed-card-meta">{name}</span>
          </span>
          <button ref={close} type="button" className="feed-detail-close" aria-label="Close" onClick={onClose}>
            <XIcon size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="feed-card-media">
          {photo ? (
            <a href={photo} target="_blank" rel="noreferrer" aria-label={`Open photo of ${txn.item}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Blob URL, nothing to optimize */}
              <img src={photo} alt={`Photo of ${txn.item}`} className="feed-card-photo" />
            </a>
          ) : (
            <div className="feed-card-placeholder" style={styleOf(name)}>
              <CategoryIcon name={txn.category} icon={icon} size={48} />
            </div>
          )}
        </div>
        <div className="feed-detail-body">
          <div className={`feed-detail-amount${hideAmounts ? ' amount-hidden' : ''}`}>
            {hideAmounts ? '---' : formatCurrency(txn.amountInr)}
          </div>
          <dl className="feed-detail-rows">
            {rows.map((r) => (
              <div key={r.label} className="feed-detail-row">
                <dt>
                  <r.icon size={16} aria-hidden="true" />
                  {r.label}
                </dt>
                <dd className={r.value === 'Not set' ? 'is-empty' : undefined}>{r.value}</dd>
              </div>
            ))}
          </dl>
          {txn.notes.trim() ? (
            <div className="feed-detail-notes">
              <span>Notes</span>
              <p>{txn.notes.trim()}</p>
            </div>
          ) : null}
          <div className="feed-detail-actions">
            <button type="button" className="account-pill-btn" onClick={onEdit}>
              <PencilSimpleIcon size={15} aria-hidden="true" />
              Edit
            </button>
            <button type="button" className="account-danger-btn" onClick={onDelete}>
              <TrashIcon size={15} aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
      </motion.div>
    </Scrim>
  )
}
