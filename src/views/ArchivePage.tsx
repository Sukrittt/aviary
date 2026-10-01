'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LIST_SPRING } from '@/src/components/landing/mobile/kit'
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

const KIND: Record<ArchivableCollection, { label: string; icon: string }> = {
  expenses: { label: 'Transaction', icon: '🧾' },
  budgets: { label: 'Budget', icon: '👛' },
  categories: { label: 'Category', icon: '🏷️' },
  groups: { label: 'Group', icon: '📂' },
  subscriptions: { label: 'Subscription', icon: '🔁' },
  holdings: { label: 'Holding', icon: '📈' },
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

  const qc = useQueryClient()
  const [hideAmounts] = useHideAmounts()
  const archiveQuery = useQuery({ queryKey: archiveKey, queryFn: getArchive })

  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const [pending, setPending] = useState<{ id: string; kind: 'restore' | 'purge' } | null>(null)
  const [restoredId, setRestoredId] = useState<string | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<ArchivedItem | null>(null)
  // The count at the moment the dialog opened, so the title doesn't read "Restore 0 items" while the tick plays.
  const [restoreAllCount, setRestoreAllCount] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const restoreAllButton = useButtonPhase()

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

  async function handleRestoreAll() {
    setNotice('')
    restoreAllButton.start()
    const restored: string[] = []
    let skipped = 0
    // One at a time on purpose: two archived rows with the same name would
    // otherwise race each other past the server's collision check.
    for (const item of sorted) {
      try {
        await restoreArchivedItem(item.collection, item.id)
        restored.push(item.id)
      } catch {
        skipped++
      }
    }
    drop(restored)
    if (skipped > 0) {
      restoreAllButton.fail()
      setRestoreAllCount(null)
      setNotice(
        `${restored.length} restored, ${skipped} skipped because a live item with the same name already exists.`,
      )
      return
    }
    restoreAllButton.succeed(() => setRestoreAllCount(null))
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
        {items.length > 0 && (
          <button type="button" className="account-compact-btn" onClick={() => setRestoreAllCount(items.length)}>
            Restore all
          </button>
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

          <ul className="archive-list" aria-label="Archived items">
            <AnimatePresence initial={false}>
            {pageItems.map((item, idx) => {
              const days = daysUntil(item.purgesAt)
              const band = bandFor(days)
              const showBand = band !== lastBand
              lastBand = band
              const isPending = pending?.id === item.id
              const restored = restoredId === item.id
              return (
                <motion.li
                  key={item.id}
                  layout="position"
                  transition={LIST_SPRING}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.15 } }}
                  exit={{
                    opacity: 0,
                    // Restore all clears the list top-down, like Mobile.
                    transition: restoreAllButton.saving
                      ? { duration: 0.18, delay: idx * 0.055 }
                      : { duration: 0.12 },
                  }}
                >
                  {showBand && <div className={`archive-band ${days <= 1 ? 'is-coral' : ''}`}>{band}</div>}
                  <div className={`account-card archive-row ${days <= 1 ? 'is-urgent' : ''}`}>
                    <span className="archive-kind" aria-hidden="true">
                      {KIND[item.collection].icon}
                    </span>
                    <div className="archive-row-body">
                      <div className="archive-row-name">
                        <strong>{item.label || 'Untitled'}</strong>
                        {item.amount !== undefined && <span>{formatCurrency(item.amount, hideAmounts)}</span>}
                      </div>
                      <div className="account-row-meta">
                        {KIND[item.collection].label} · deleted {formatDateShort(item.deletedAt)}
                      </div>
                    </div>
                    <div className="archive-row-clock">
                      <span className={`is-${urgency(days)}`}>{days === 1 ? '1 day left' : `${days} days left`}</span>
                      <div className="archive-bar">
                        <div
                          className={`is-${urgency(days)}`}
                          style={{ transform: `scaleX(${Math.max(6, Math.round((days / 7) * 100)) / 100})` }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="scan-icon-btn"
                      aria-label={`Delete ${item.label || 'item'} forever`}
                      disabled={isPending || restored}
                      onClick={() => setPurgeTarget(item)}
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      className={`account-pill-btn archive-restore ${restored ? 'is-done' : ''}`}
                      disabled={isPending || restored}
                      onClick={() => handleRestore(item)}
                    >
                      {restored ? '✓ Restored' : isPending && pending?.kind === 'restore' ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                </motion.li>
              )
            })}
            </AnimatePresence>
          </ul>

          {filter !== 'all' && shown.length === 0 && (
            <p className="account-row-meta" style={{ textAlign: 'center' }}>
              Nothing archived under {CHIP_LABELS[filter]}.
            </p>
          )}

          {shown.length > PAGE_SIZE && (
            <div className="archive-pagination">
              <button
                type="button"
                className="account-pill-btn"
                aria-label="Previous archive page"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                ←
              </button>
              <span className="account-row-meta">
                Page {currentPage + 1} of {pageCount} · {currentPage * PAGE_SIZE + 1}–
                {Math.min((currentPage + 1) * PAGE_SIZE, shown.length)} of {shown.length}
              </span>
              <button
                type="button"
                className="account-pill-btn"
                aria-label="Next archive page"
                disabled={currentPage === pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                →
              </button>
            </div>
          )}

          <p className="account-row-meta archive-footnote">
            Kept 7 days from deletion, then removed automatically. Restoring a category or group puts it back, its
            transactions stay where they are now.
          </p>
        </>
      )}

      <AnimatePresence>
        {restoreAllCount !== null && (
          <ConfirmDialog
            title={`Restore ${restoreAllCount} item${restoreAllCount === 1 ? '' : 's'} back where they were?`}
            cancelLabel="Cancel"
            onCancel={() => !restoreAllButton.saving && !restoreAllButton.success && setRestoreAllCount(null)}
          >
            <SuccessButton
              type="button"
              // action-button, not account-pill-btn: the tick's styles live on it.
              baseClass="action-button"
              saving={restoreAllButton.saving}
              success={restoreAllButton.success}
              savingLabel="Restoring…"
              successLabel="Restored"
              disabled={restoreAllButton.saving || restoreAllButton.success}
              onClick={handleRestoreAll}
            >
              Restore all
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
