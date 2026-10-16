'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BankIcon, CalendarBlankIcon, CameraIcon, CheckIcon, ClockIcon, PencilSimpleIcon, TagIcon, TrashIcon, XIcon } from './icons'
import { CategoryIcon } from './CategoryIcon'
import { DeletingRow } from './DeletingRow'
import { Scrim } from './MotionSheet'
import { useExpensesFeed, useUploadExpensePhoto } from '../hooks/useExpenses'
import { useCategoryIcons } from '../hooks/useCategories'
import { useCurrency } from '../context/CurrencyContext'
import { avatarStyleFor, splitEmoji } from '../lib/emoji'
import { toTransactions, type Transaction } from '../lib/expenseTransactions'
import { stablePhotoUrl } from '../lib/activityFeed'
import { base64Of, dataUrlFromFile, PHOTO_ENCODING } from '../features/scan-bill/image'
import { track } from '../lib/analytics'
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

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Activity's feed view: every expense as a card, photo first, newest at the
 * top, loading more as you scroll. Expenses without a photo show their
 * category on its tint, with a way to add one. A card opens into its detail
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
  const { formatCurrency } = useCurrency()
  const upload = useUploadExpensePhoto()
  const input = useRef<HTMLInputElement>(null)
  const name = splitEmoji(txn.category).text
  // The just-picked file shows at once, until the row's photo changes on the
  // server (the upload's own refetch, or a later edit or removal).
  const [picked, setPicked] = useState<{ uri: string; over: string | null } | null>(null)
  if (picked && picked.over !== txn.photoUrl) setPicked(null)
  const [justAdded, setJustAdded] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const signed = useMemo(() => (txn.photoUrl ? stablePhotoUrl(txn.photoUrl) : null), [txn.photoUrl])
  const uri = picked?.uri ?? signed

  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(false), 1100)
    return () => clearTimeout(timer)
  }, [justAdded])

  async function addPhoto(file: File) {
    if (!txn.id) return
    setFailed(null)
    let dataUrl: string
    try {
      dataUrl = await dataUrlFromFile(file, PHOTO_ENCODING)
    } catch {
      setFailed("Couldn't read that photo. Try another one.")
      return
    }
    setPicked({ uri: dataUrl, over: txn.photoUrl })
    try {
      await upload.mutateAsync({ id: txn.id, image: base64Of(dataUrl) })
      track('expense_photo_added', { from: 'feed' })
      setJustAdded(true)
    } catch {
      setPicked(null)
      setFailed("Photo didn't upload. Check your connection and try again.")
    }
  }

  return (
    <motion.article layoutId={`feed-${layoutKey}`} className="feed-card">
      {/* One button over the whole card, like the list rows' txn-row-trigger; the photo button sits above it. */}
      <button type="button" className="feed-card-open" aria-label={`${txn.item}, ${name}. View details`} onClick={onOpen} />
      <header className="feed-card-head">
        <span className="txn-timeline-icon" style={avatarStyleFor(name)} aria-hidden="true">
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
      <div className="feed-card-media">
        {uri ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL or short-lived signed Blob URL, nothing to optimize
          <img src={uri} alt="" className="feed-card-photo" />
        ) : (
          <div className="feed-card-placeholder" style={avatarStyleFor(name)}>
            <CategoryIcon name={txn.category} icon={icon} size={48} />
          </div>
        )}
        {/* A row with a photo the server didn't sign shows its category, without offering a second photo. */}
        {!uri && !txn.hasPhoto && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/*"
              hidden
              aria-label={`Choose a photo for ${txn.item}`}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void addPhoto(file)
              }}
            />
            <button type="button" className="feed-add-photo" onClick={() => input.current?.click()} aria-label={`Add a photo to ${txn.item}`}>
              <CameraIcon size={15} aria-hidden="true" />
              Add a photo
            </button>
          </>
        )}
        {upload.isPending && <span className="feed-card-busy" role="status" aria-label="Uploading photo" />}
        {justAdded && (
          <span className="feed-card-added" aria-label="Photo added">
            <CheckIcon size={18} weight="bold" aria-hidden="true" />
          </span>
        )}
      </div>
      {txn.notes.trim() ? <p className="feed-card-notes">{txn.notes.trim()}</p> : null}
      {failed && <p className="feed-card-error" role="alert">{failed}</p>}
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
  // A backdated expense was logged on another day; its time is when it was logged, not spent.
  const sameDay = !Number.isNaN(logged.getTime()) && localDate(logged) === txn.date
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
          <span className="txn-timeline-icon" style={avatarStyleFor(name)} aria-hidden="true">
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
            <div className="feed-card-placeholder" style={avatarStyleFor(name)}>
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
