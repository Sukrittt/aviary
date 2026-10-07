'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Folder, Receipt, Repeat, Tag, TrendingUp, Wallet, X } from 'lucide-react'
import { ROW_SPRING } from '../components/DeletingRow'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoadingCaption } from '../components/LoadingCaption'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SuccessButton, useButtonPhase } from '../components/SuccessButton'
import { getArchive, purgeArchivedItem, restoreArchivedItem, type ArchivableCollection, type ArchivedItem } from '../api/account'
import { useHideAmounts } from '../hooks/useHideAmounts'
import { daysUntil, formatDateShort } from '../lib/format'
import { BirdEmptyState } from '../components/BirdEmptyState'

const SECTION_ORDER: ArchivableCollection[] = ['expenses', 'budgets', 'categories', 'groups', 'subscriptions', 'holdings']

const CHIP_LABELS: Record<ArchivableCollection, string> = {
  expenses: 'Transactions',
  budgets: 'Budgets',
  categories: 'Categories',
  groups: 'Groups',
  subscriptions: 'Subscriptions',
  holdings: 'Holdings',
}

const KIND: Record<ArchivableCollection, { label: string; Icon: typeof Receipt }> = {
  expenses: { label: 'Transaction', Icon: Receipt },
  budgets: { label: 'Budget', Icon: Wallet },
  categories: { label: 'Category', Icon: Tag },
  groups: { label: 'Group', Icon: Folder },
  subscriptions: { label: 'Subscription', Icon: Repeat },
  holdings: { label: 'Holding', Icon: TrendingUp },
}

type Filter = 'all' | ArchivableCollection
type Band = 'Gone tomorrow' | 'Going this week' | 'Later this week'

function bandFor(days: number): Band {
  if (days <= 1) return 'Gone tomorrow'
  if (days <= 3) return 'Going this week'
  return 'Later this week'
}

function urgency(days: number): 'coral' | 'warn' | 'calm' {
  return days <= 1 ? 'coral' : days <= 3 ? 'warn' : 'calm'
}

const archiveKey = ['archive'] as const
const PAGE_SIZE = 10
const RETRY = 'Check your connection and try again.'

/** `/account/archive`. Twin of Mobile's account/archive.tsx. */
export function ArchivePage() {
  const { formatCurrency } = useCurrency()
  const reduce = useReducedMotion()

  const qc = useQueryClient()
  const [hideAmounts] = useHideAmounts()
  const archiveQuery = useQuery({ queryKey: archiveKey, queryFn: getArchive })

  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const [pending, setPending] = useState<{ id: string; kind: 'restore' | 'purge' } | null>(null)
  const [restoredId, setRestoredId] = useState<string | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<ArchivedItem | null>(null)
  // The rows at the moment the dialog opened, so the title doesn't read "Restore 0 items" while the tick plays.
  const [restoreBatch, setRestoreBatch] = useState<ArchivedItem[] | null>(null)
  const [notice, setNotice] = useState('')
  const batchButton = useButtonPhase()
  // Multi-select: `selecting` swaps each row's buttons for a pick toggle, like Activity.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())

  const items = archiveQuery.data ?? []
  const loading = archiveQuery.isLoading
  const loadError = archiveQuery.isError
  const sorted = [...items].sort((a, b) => daysUntil(a.purgesAt) - daysUntil(b.purgesAt))
  const shown = filter === 'all' ? sorted : sorted.filter((i) => i.collection === filter)
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageItems = shown.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const next = sorted[0]

  const counts = { all: items.length } as Record<Filter, number>
  for (const c of SECTION_ORDER) counts[c] = items.filter((i) => i.collection === c).length

  const selectedItems = pageItems.filter((i) => selected.has(i.id))
  const allSelected = pageItems.length > 0 && selectedItems.length === pageItems.length
  const selectionLocked = batchButton.saving || batchButton.success

  // A selection only means the rows on screen: drop it when they change.
  useEffect(() => setSelected(new Set()), [filter, currentPage])

  function exitSelecting() {
    setSelecting(false)
    setSelected(new Set())
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function drop(ids: string[]) {
    qc.setQueryData<ArchivedItem[]>(archiveKey, (old) => (old ?? []).filter((i) => !ids.includes(i.id)))
    // A restore puts rows back into whichever list they came from, so every
    // screen's cache is suspect, same blanket invalidation as Mobile.
    void qc.invalidateQueries()
  }

  async function handleRestore(item: ArchivedItem) {
    setNotice('')
    setPending({ id: item.id, kind: 'restore' })
    try {
      await restoreArchivedItem(item.collection, item.id)
      setPending(null)
      setRestoredId(item.id)
      setTimeout(() => {
        setRestoredId(null)
        drop([item.id])
      }, 650)
    } catch (err) {
      setPending(null)
      setNotice(
        err instanceof Error && err.message.includes('already exists')
          ? `Couldn't restore "${item.label || 'this item'}". A live item with this name already exists.`
          : `Couldn't restore that. ${RETRY}`,
      )
    }
  }

  async function handlePurge(item: ArchivedItem) {
    setPurgeTarget(null)
    setNotice('')
    setPending({ id: item.id, kind: 'purge' })
    try {
      await purgeArchivedItem(item.collection, item.id)
      drop([item.id])
    } catch {
      setNotice(`Couldn't delete that. ${RETRY}`)
    } finally {
      setPending(null)
    }
  }

  async function handleRestoreBatch(batch: ArchivedItem[]) {
    setNotice('')
    batchButton.start()
    const restored: string[] = []
    const failed: string[] = []
    // One at a time on purpose: two archived rows with the same name would
    // otherwise race each other past the server's collision check.
    for (const item of batch) {
      try {
        await restoreArchivedItem(item.collection, item.id)
        restored.push(item.id)
      } catch {
        failed.push(item.id)
      }
    }
    drop(restored)
    if (failed.length > 0) {
      batchButton.fail()
      setRestoreBatch(null)
      // Failed rows stay selected, so a retry is one tap away.
      setSelected(new Set(failed))
      setNotice(
        `${restored.length} restored, ${failed.length} skipped because a live item with the same name already exists.`,
      )
      return
    }
    batchButton.succeed(() => {
      setRestoreBatch(null)
      exitSelecting()
    })
  }

  let lastBand: Band | null = null

  return (
    <>
      <div className="account-page-heading">
        <div>
          <div className="account-section-label">Archive</div>
          <div className="account-row-meta" style={{ padding: '2px 4px 0' }}>
            {items.length === 0 ? 'Nothing waiting to be purged' : `${items.length} item${items.length === 1 ? '' : 's'} · kept 7 days`}
          </div>
        </div>
        {items.length > 0 && !selecting && (
          <div className="archive-heading-actions">
            <button type="button" className="account-pill-btn" onClick={() => setSelecting(true)}>
              Select
            </button>
            <button type="button" className="account-compact-btn" onClick={() => setRestoreBatch(sorted)}>
              Restore all
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="account-warn-banner" role="status">
          <div className="account-warn-copy" style={{ marginTop: 0 }}>
            {notice}
          </div>
        </div>
      )}

      {loading ? (
        <LoadingCaption feature="archive" placement="page" />
      ) : loadError ? (
        <div className="account-empty">
          <p className="account-row-meta">Couldn&apos;t load the archive. {RETRY}</p>
        </div>
      ) : items.length === 0 ? (
        <BirdEmptyState
          mood="clear"
          subject="archive"
          title="All clear in here"
          description="Deleted transactions, budgets and more will rest here for seven days, just in case."
        />
      ) : (
        <>
          {next && (
            <div className="account-card archive-next">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="account-section-label" style={{ padding: 0 }}>
                  Next to go
                </div>
                <div className="archive-next-name">{next.label || 'Untitled'}</div>
                <div className="account-row-meta">
                  {KIND[next.collection].label}
                  {next.amount !== undefined ? ` · ${formatCurrency(next.amount, hideAmounts)}` : ''} · deleted{' '}
                  {formatDateShort(next.deletedAt)}
                </div>
              </div>
              <div className={`archive-clock is-${urgency(daysUntil(next.purgesAt))}`}>
                <strong>{daysUntil(next.purgesAt)}</strong>
                <span>{daysUntil(next.purgesAt) === 1 ? 'day' : 'days'} left</span>
              </div>
            </div>
          )}

          <div className="erd-chip-row archive-filters" role="group" aria-label="Filter archive">
            {(['all', ...SECTION_ORDER] as Filter[])
              .filter((f) => f === 'all' || counts[f] > 0)
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`erd-chip ${filter === f ? 'is-selected' : ''}`}
                  aria-pressed={filter === f}
                  onClick={() => {
                    setFilter(f)
                    setPage(0)
                  }}
                >
                  {f === 'all' ? 'All' : CHIP_LABELS[f]} <span className="archive-chip-count">{counts[f]}</span>
                </button>
              ))}
          </div>

          <motion.ul
            key={`${filter}-${currentPage}`}
            className={`archive-list${selecting ? ' is-selecting' : ''}`}
            aria-label="Archived items"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
            {pageItems.map((item, idx) => {
              const days = daysUntil(item.purgesAt)
              const band = bandFor(days)
              const showBand = band !== lastBand
              lastBand = band
              const isPending = pending?.id === item.id
              const restored = restoredId === item.id
              const isSelected = selecting && selected.has(item.id)
              const { Icon } = KIND[item.collection]
              return (
                <motion.li
                  key={item.id}
                  layout="position"
                  transition={{ layout: ROW_SPRING }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.15 } }}
                  exit={{
                    opacity: 0,
                    // Restore all clears the list top-down, like Mobile.
                    transition: batchButton.saving
                      ? { duration: 0.18, delay: idx * 0.055 }
                      : { duration: 0.22 },
                  }}
                >
                  {showBand && <div className={`archive-band ${days <= 1 ? 'is-coral' : ''}`}>{band}</div>}
                  <div className={`archive-row${isSelected ? ' is-selected' : ''}`}>
                    {selecting && (
                      <button
                        type="button"
                        className="archive-row-pick"
                        aria-label={`Select ${item.label || 'item'}`}
                        aria-pressed={isSelected}
                        disabled={selectionLocked}
                        onClick={() => toggleSelected(item.id)}
                      />
                    )}
                    <span className="txn-check-slot" aria-hidden="true">
                      <span className={`txn-check${isSelected ? ' is-on' : ''}`}>
                        {isSelected && (
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M5 13l4 4L19 7"
                              stroke="currentColor"
                              strokeWidth={3}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              pathLength={1}
                            />
                          </svg>
                        )}
                      </span>
                    </span>
                    <span className={`archive-kind is-${item.collection}`} aria-hidden="true">
                      <Icon size={20} strokeWidth={2.2} />
                    </span>
                    <span className="archive-row-body">
                      <span className="archive-row-name">{item.label || 'Untitled'}</span>
                      <span className="archive-row-meta">
                        {KIND[item.collection].label} · deleted {formatDateShort(item.deletedAt)}
                        {item.amount !== undefined ? ` · ${formatCurrency(item.amount, hideAmounts)}` : ''}
                      </span>
                    </span>
                    <span className={`archive-days is-${urgency(days)}`}>{days === 1 ? '1 day left' : `${days} days left`}</span>
                    {!selecting && (
                      <span className="archive-row-actions">
                        <button
                          type="button"
                          className="scan-icon-btn"
                          aria-label={`Delete ${item.label || 'item'} forever`}
                          disabled={isPending || restored}
                          onClick={() => setPurgeTarget(item)}
                        >
                          <X size={15} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={`account-pill-btn archive-restore ${restored ? 'is-done' : ''}`}
                          disabled={isPending || restored}
                          onClick={() => handleRestore(item)}
                        >
                          {restored ? '✓ Restored' : isPending && pending?.kind === 'restore' ? 'Restoring…' : 'Restore'}
                        </button>
                      </span>
                    )}
                  </div>
                </motion.li>
              )
            })}
            </AnimatePresence>
          </motion.ul>

          {filter !== 'all' && shown.length === 0 && (
            <p className="archive-footnote">Nothing archived under {CHIP_LABELS[filter]}.</p>
          )}

          {selecting && (
            <div className="txn-select-bar" role="toolbar" aria-label="Selected items">
              <span className="txn-select-count">
                {selectedItems.length === 0 ? 'Tap rows to pick them' : `${selectedItems.length} selected`}
              </span>
              <button
                type="button"
                className="action-button is-ghost"
                disabled={selectionLocked}
                onClick={() => setSelected(allSelected ? new Set() : new Set(pageItems.map((i) => i.id)))}
              >
                {allSelected ? 'Clear' : 'Select all'}
              </button>
              <button
                type="button"
                className="account-compact-btn archive-select-restore"
                disabled={selectedItems.length === 0 || selectionLocked}
                onClick={() => setRestoreBatch(selectedItems)}
              >
                Restore
              </button>
              <button type="button" className="action-button is-ghost" disabled={selectionLocked} onClick={exitSelecting}>
                Done
              </button>
            </div>
          )}

          <div className="txn-timeline-footer archive-footer">
            <span>
              {shown.length} item{shown.length === 1 ? '' : 's'}
            </span>
            {pageCount > 1 && (
              <div className="txn-timeline-pagination">
                <button type="button" className="action-button is-ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  Prev
                </button>
                <span>
                  {currentPage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  className="action-button is-ghost"
                  disabled={currentPage === pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
            <span>Gone after 7 days</span>
          </div>

          <p className="archive-footnote">
            Restoring a category or group puts it back. Its transactions stay where they are now.
          </p>
        </>
      )}

      <AnimatePresence>
        {restoreBatch && (
          <ConfirmDialog
            title={
              restoreBatch.length === 1
                ? `Restore ${restoreBatch[0].label || 'this item'} back where it was?`
                : `Restore ${restoreBatch.length} items back where they were?`
            }
            cancelLabel="Cancel"
            onCancel={() => !selectionLocked && setRestoreBatch(null)}
          >
            <SuccessButton
              type="button"
              // action-button, not account-pill-btn: the tick's styles live on it.
              baseClass="action-button"
              saving={batchButton.saving}
              success={batchButton.success}
              savingLabel="Restoring…"
              successLabel="Restored"
              disabled={selectionLocked}
              onClick={() => handleRestoreBatch(restoreBatch)}
            >
              Restore
            </SuccessButton>
          </ConfirmDialog>
        )}
        {purgeTarget && (
          <ConfirmDialog
            title={`Delete ${purgeTarget.label || 'this item'} forever?`}
            body="This can't be undone."
            cancelLabel="Keep"
            onCancel={() => setPurgeTarget(null)}
          >
            <button type="button" className="account-danger-btn" style={{ marginTop: 0 }} onClick={() => handlePurge(purgeTarget)}>
              Delete forever
            </button>
          </ConfirmDialog>
        )}
      </AnimatePresence>
    </>
  )
}
