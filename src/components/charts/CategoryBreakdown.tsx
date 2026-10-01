'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ListFilter, TrendingDown, TrendingUp, X } from 'lucide-react'
import type { BreakdownRow, MonthComparison } from '@/src/lib/monthly'
import { CHART_COLORS } from '@/src/theme/chartColors'
import { DonutChart, type DonutSegment } from './DonutChart'
import { AutoHeight, PopIn, ease } from '@/src/components/landing/mobile/kit'
import { BirdEmptyState } from '../BirdEmptyState'

interface Props {
  rows: BreakdownRow[]
  categoryRows: BreakdownRow[]
  groupRows: BreakdownRow[]
  categoryGroupMap: ReadonlyMap<string, string>
  mode: 'category' | 'group'
  onModeChange: (mode: 'category' | 'group') => void
  selectedKey: string | null
  onSelectKey: (key: string | null) => void
  comparison: MonthComparison | null
  leftover: number
  monthLabel: string
  hideAmounts?: boolean
  loading?: boolean
}

const VISIBLE_ROWS = 6
const DONUT_TAIL_PCT = 3

// Mirrors Mobile's CategoryBreakdown/useReveal timings.
const SETTLE_MS = 320
const ROW_START_DELAY = 200
const ROW_STAGGER_MS = 40
const ROW_STAGGER_CAP = 6
const BAR_OFFSET_MS = 60
const BAR_DURATION = 450
const FILTER_APPLY_DELAY_MS = 220
const groupFor = (map: ReadonlyMap<string, string>, key: string) => map.get(key) || 'Other'
const LIST_SPRING = {
  type: 'spring',
  damping: 64,
  stiffness: 700,
  mass: 1,
} as const

function useReveal(scope: string, ready: boolean) {
  const [settled, setSettled] = useState(false)
  const [revealed, setRevealed] = useState({ scope: '', nonce: 0 })
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(id)
  }, [])
  if (settled && ready && revealed.scope !== scope) setRevealed({ scope, nonce: revealed.nonce + 1 })
  return {
    revealKey: revealed.nonce,
    revealReady: settled && ready && revealed.scope === scope && revealed.nonce > 0,
  }
}

function BudgetBar({ pct, color, play, delay }: { pct: number; color: string; play: boolean; delay: number }) {
  const [initial] = useState(() => (play ? { width: '0%' } : false))
  return (
    <span className="ins-budget-track">
      <motion.i
        style={{ background: pct > 100 ? 'var(--coral)' : color }}
        initial={initial}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{
          delay: delay / 1000,
          duration: BAR_DURATION / 1000,
          ease: ease.inOutCubic,
        }}
      />
    </span>
  )
}

function buildSegments(rows: BreakdownRow[], colors: Map<string, string>): DonutSegment[] {
  const big = rows.filter((row) => row.pct >= DONUT_TAIL_PCT)
  const small = rows.filter((row) => row.pct < DONUT_TAIL_PCT)
  const segments = big.map((row) => ({
    key: row.key,
    label: row.label,
    emoji: row.emoji,
    value: row.spent,
    color: colors.get(row.key) ?? 'var(--erd-text3)',
  }))
  if (small.length > 0) {
    segments.push({
      key: '__other__',
      label: 'Other',
      emoji: '',
      value: small.reduce((sum, row) => sum + row.spent, 0),
      color: 'var(--erd-text3)',
    })
  }
  return segments
}

export function CategoryBreakdown({ rows, categoryRows, groupRows, categoryGroupMap, mode, onModeChange, selectedKey, onSelectKey, comparison, leftover, monthLabel, hideAmounts = false, loading = false }: Props) {
  const { currencySymbol, formatCurrency } = useCurrency()

  const [expanded, setExpanded] = useState(false)
  const [sortBy, setSortBy] = useState<'spend' | 'budget'>('spend')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterTab, setFilterTab] = useState<'category' | 'group'>('category')
  const [excludedCategoryKeys, setExcludedCategoryKeys] = useState<Set<string>>(() => new Set())
  const [excludedGroupKeys, setExcludedGroupKeys] = useState<Set<string>>(() => new Set())
  const [draftCategoryKeys, setDraftCategoryKeys] = useState<Set<string>>(() => new Set())
  const [draftGroupKeys, setDraftGroupKeys] = useState<Set<string>>(() => new Set())
  const [pendingFilters, setPendingFilters] = useState<{ categories: Set<string>; groups: Set<string> } | null>(null)
  // A filter describes one concrete month, so it resets on a month change.
  const [filterMonth, setFilterMonth] = useState(monthLabel)
  if (filterMonth !== monthLabel) {
    setFilterMonth(monthLabel)
    setFilterOpen(false)
    setExcludedCategoryKeys(new Set())
    setExcludedGroupKeys(new Set())
    setPendingFilters(null)
  }

  const eligibleGroupRows = useMemo(() => {
    const withCategories = new Set(categoryRows.map((row) => groupFor(categoryGroupMap, row.key)))
    return groupRows.filter((row) => withCategories.has(row.key))
  }, [categoryRows, groupRows, categoryGroupMap])

  const displayRows = useMemo(() => {
    const includedCategories = categoryRows.filter((row) => !excludedCategoryKeys.has(row.key) && !excludedGroupKeys.has(groupFor(categoryGroupMap, row.key)))
    const filteredRows =
      mode === 'category'
        ? includedCategories
        : eligibleGroupRows
            .map((group) => {
              const members = includedCategories.filter((row) => groupFor(categoryGroupMap, row.key) === group.key)
              if (members.length === 0) return null
              if (members.length === categoryRows.filter((row) => groupFor(categoryGroupMap, row.key) === group.key).length) return group
              const spent = members.reduce((sum, row) => sum + row.spent, 0)
              const previousSpent = members.reduce((sum, row) => (row.deltaPct == null ? sum : sum + row.spent / (1 + row.deltaPct / 100)), 0)
              return {
                ...group,
                spent,
                assigned: members.reduce((sum, row) => sum + row.assigned, 0),
                assignedIsCarried: members.every((row) => row.assignedIsCarried),
                deltaPct: previousSpent > 0 ? ((spent - previousSpent) / previousSpent) * 100 : null,
              }
            })
            .filter((row): row is BreakdownRow => row != null)
    const sum = filteredRows.reduce((acc, row) => acc + row.spent, 0) || 1
    return filteredRows.map((row) => ({ ...row, pct: (row.spent / sum) * 100 }))
  }, [categoryRows, eligibleGroupRows, excludedCategoryKeys, excludedGroupKeys, mode, categoryGroupMap])

  useEffect(() => {
    if (filterOpen || pendingFilters == null) return
    const id = setTimeout(() => {
      setExcludedCategoryKeys(pendingFilters.categories)
      setExcludedGroupKeys(pendingFilters.groups)
      setPendingFilters(null)
      if (selectedKey == null) return
      const excluded =
        mode === 'category'
          ? pendingFilters.categories.has(selectedKey) || pendingFilters.groups.has(groupFor(categoryGroupMap, selectedKey))
          : pendingFilters.groups.has(selectedKey) ||
            categoryRows.filter((row) => groupFor(categoryGroupMap, row.key) === selectedKey).every((row) => pendingFilters.categories.has(row.key))
      if (excluded) onSelectKey(null)
    }, FILTER_APPLY_DELAY_MS)
    return () => clearTimeout(id)
  }, [filterOpen, pendingFilters, selectedKey, mode, categoryRows, categoryGroupMap, onSelectKey])

  const colors = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((row, index) => map.set(row.key, CHART_COLORS[index % CHART_COLORS.length]))
    return map
  }, [rows])

  const segments = useMemo(() => buildSegments(displayRows, colors), [displayRows, colors])
  const sortedRows = useMemo(() => {
    if (sortBy === 'spend') return displayRows
    return [...displayRows].sort((a, b) => {
      const aRatio = !a.assignedIsCarried && a.assigned > 0 ? a.spent / a.assigned : -1
      const bRatio = !b.assignedIsCarried && b.assigned > 0 ? b.spent / b.assigned : -1
      return bRatio - aRatio
    })
  }, [displayRows, sortBy])

  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, VISIBLE_ROWS)
  const selectedRow = displayRows.find((row) => row.key === selectedKey) ?? null
  const baseRows = mode === 'category' ? categoryRows : eligibleGroupRows
  const filtered = displayRows.length < baseRows.length
  const filterRows = filterTab === 'category' ? categoryRows : eligibleGroupRows
  const draftKeys = filterTab === 'category' ? draftCategoryKeys : draftGroupKeys
  const setDraftKeys = filterTab === 'category' ? setDraftCategoryKeys : setDraftGroupKeys
  const allDraftSelected = filterRows.length > 0 && filterRows.every((row) => draftKeys.has(row.key))
  const hasDraftVisibleCategory = categoryRows.some((row) => draftCategoryKeys.has(row.key) && draftGroupKeys.has(groupFor(categoryGroupMap, row.key)))
  const selectedDonutKey = selectedKey && segments.some((segment) => segment.key === selectedKey) ? selectedKey : selectedKey ? '__other__' : null
  const total = displayRows.reduce((sum, row) => sum + row.spent, 0)
  const { revealKey, revealReady } = useReveal(`${monthLabel}|${mode}`, displayRows.length > 0)
  const play = revealReady

  function openFilter() {
    setFilterTab(mode)
    setDraftCategoryKeys(new Set(categoryRows.filter((row) => !excludedCategoryKeys.has(row.key)).map((row) => row.key)))
    setDraftGroupKeys(new Set(eligibleGroupRows.filter((row) => !excludedGroupKeys.has(row.key)).map((row) => row.key)))
    setFilterOpen(true)
  }

  function toggleDraftKey(key: string) {
    setDraftKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function applyFilter() {
    if (!hasDraftVisibleCategory) return
    const categories = new Set(categoryRows.filter((row) => !draftCategoryKeys.has(row.key)).map((row) => row.key))
    const groups = new Set(eligibleGroupRows.filter((row) => !draftGroupKeys.has(row.key)).map((row) => row.key))
    setPendingFilters({ categories, groups })
    const activeForTab = filterTab === 'category' ? categories.size > 0 : groups.size > 0
    if (activeForTab && mode !== filterTab) onModeChange(filterTab)
    setFilterOpen(false)
  }

  return (
    <>
      <div className="ins-card-heading">
        <div>
          <h2>Where it went</h2>
          <p>Your month, split into the parts that shaped it</p>
        </div>
        {baseRows.length > 1 && (
          <button type="button" className={filtered ? 'ins-icon-btn is-active' : 'ins-icon-btn'} onClick={openFilter} aria-label={filtered ? `Filter chart, ${displayRows.length} active` : 'Filter chart'}>
            <ListFilter size={17} />
            {filtered && <span>{displayRows.length}</span>}
          </button>
        )}
      </div>

      <div className="ins-breakdown-controls">
        <div className="ins-segmented" role="tablist" aria-label="Breakdown type">
          <button type="button" role="tab" aria-selected={mode === 'category'} className={mode === 'category' ? 'is-active' : ''} onClick={() => onModeChange('category')}>
            By category
          </button>
          <button type="button" role="tab" aria-selected={mode === 'group'} className={mode === 'group' ? 'is-active' : ''} onClick={() => onModeChange('group')}>
            By group
          </button>
        </div>
        <div className="ins-segmented ins-measure" aria-label="Sort breakdown">
          <button type="button" className={sortBy === 'spend' ? 'is-active' : ''} onClick={() => setSortBy('spend')} aria-label="Measure by amount spent">
            {currencySymbol}
          </button>
          <button type="button" className={sortBy === 'budget' ? 'is-active' : ''} onClick={() => setSortBy('budget')} aria-label="Measure by percent of budget used">
            %
          </button>
        </div>
      </div>

      {displayRows.length === 0 ? (
        <div className="ins-breakdown-empty" aria-busy={loading}>
          {!loading && (
            <BirdEmptyState
              subject="expenses"
              title="Nothing spent yet"
              description="Log an expense and it'll land here."
            />
          )}
        </div>
      ) : (
        <>
          <div className="ins-breakdown-content" style={{ opacity: revealReady ? 1 : 0 }}>
            <div className="ins-breakdown-visuals">
              <DonutChart key={revealKey} revealKey={revealKey} segments={segments} selectedKey={selectedDonutKey} onSelect={(key) => onSelectKey(key === '__other__' ? null : key)}>
                {play && (
                  <PopIn key={`${revealKey}:${selectedKey ?? '__none__'}`} play delay={0} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    {selectedRow ? (
                      <>
                        {selectedRow.emoji && <span className="ins-center-emoji">{selectedRow.emoji}</span>}
                        <strong>{formatCurrency(selectedRow.spent, hideAmounts)}</strong>
                        <span>{selectedRow.pct.toFixed(0)}%</span>
                      </>
                    ) : filtered ? (
                      <>
                        <span>Filtered total</span>
                        <strong>{formatCurrency(total, hideAmounts)}</strong>
                      </>
                    ) : comparison?.baseline != null && comparison.deltaPct != null && Math.round(comparison.deltaPct) !== 0 ? (
                      <>
                        <span className={comparison.deltaPct > 0 ? 'is-up' : 'is-down'}>
                          {comparison.deltaPct > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {Math.abs(comparison.deltaPct).toFixed(0)}%
                        </span>
                        <small>
                          {formatCurrency(Math.abs(comparison.spent - comparison.baseline), hideAmounts)} {comparison.deltaPct > 0 ? 'more' : 'less'} than usual
                        </small>
                      </>
                    ) : (
                      <>
                        <span>Top spend</span>
                        <strong>{displayRows[0]?.label}</strong>
                        <small>{displayRows[0]?.pct.toFixed(0)}% of the month</small>
                      </>
                    )}
                  </PopIn>
                )}
              </DonutChart>
            </div>

            <div className="ins-breakdown-list">
              <AnimatePresence initial={false}>
                {visibleRows.map((row, index) => {
                  const selected = selectedKey === row.key
                  const hasBudget = !row.assignedIsCarried && row.assigned > 0
                  const pct = hasBudget ? (row.spent / row.assigned) * 100 : 0
                  const rowDelay = ROW_START_DELAY + Math.min(index, ROW_STAGGER_CAP) * ROW_STAGGER_MS
                  return (
                    <motion.div key={row.key} layout="position" transition={LIST_SPRING} exit={{ opacity: 0, transition: { duration: 0.16 } }}>
                      <PopIn key={`${revealKey}:${row.key}`} play={play} delay={rowDelay}>
                        <button type="button" key={row.key} className={selected ? 'ins-breakdown-row is-selected' : 'ins-breakdown-row'} onClick={() => onSelectKey(selected ? null : row.key)} aria-pressed={selected}>
                          <span className="ins-row-top">
                            <i style={{ background: colors.get(row.key) }} />
                            {row.emoji && <span aria-hidden="true">{row.emoji}</span>}
                            <span className="ins-row-name">{row.label}</span>
                            <strong>{formatCurrency(row.spent, hideAmounts)}</strong>
                            {row.deltaPct != null && Math.round(row.deltaPct) !== 0 && (
                              <span className={row.deltaPct > 0 ? 'ins-delta is-up' : 'ins-delta is-down'}>
                                {row.deltaPct > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {Math.abs(row.deltaPct).toFixed(0)}%
                              </span>
                            )}
                          </span>
                          {hasBudget ? <BudgetBar pct={pct} color={colors.get(row.key) ?? 'var(--erd-text3)'} play={play} delay={rowDelay + BAR_OFFSET_MS} /> : <span className="ins-budget-track" />}
                          <small>{hasBudget ? `${formatCurrency(row.spent, hideAmounts)} of ${formatCurrency(row.assigned, hideAmounts)}` : 'No budget set'}</small>
                          {selected && mode === 'category' && (
                            <Link href={`/expense/transactions?category=${encodeURIComponent(row.key)}`} onClick={(event) => event.stopPropagation()}>
                              View transactions ›
                            </Link>
                          )}
                        </button>
                      </PopIn>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
            {!expanded && sortedRows.length > VISIBLE_ROWS && (
              <button type="button" className="ins-text-btn" onClick={() => setExpanded(true)}>
                Other ({sortedRows.length - VISIBLE_ROWS})
              </button>
            )}
          </div>
        </>
      )}

      <div className="ins-leftover">
        <span>Income left in {monthLabel}</span>
        <strong>{formatCurrency(leftover, hideAmounts)}</strong>
      </div>

      <AnimatePresence>
      {filterOpen && (
        <motion.div
          key="filter"
          className="ins-filter-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: ease.outCubic }}
          onMouseDown={(event) => event.target === event.currentTarget && setFilterOpen(false)}
        >
          <motion.section
            className="ins-filter-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ins-filter-title"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: ease.outCubic }}
          >
            <AutoHeight transition={LIST_SPRING} innerStyle={{ padding: 24 }}>
            <div className="ins-filter-head">
              <div>
                <h3 id="ins-filter-title">Filter chart</h3>
                <p>Choose what appears in this chart</p>
              </div>
              <button type="button" className="ins-icon-btn" onClick={() => setFilterOpen(false)} aria-label="Close filter">
                <X size={18} />
              </button>
            </div>
            <div className="ins-filter-tabs">
              <div className="ins-segmented" role="tablist" aria-label="Filter by">
                {(
                  [
                    ['category', 'Categories'],
                    ['group', 'Groups'],
                  ] as const
                ).map(([tab, label]) => (
                  <button key={tab} type="button" role="tab" aria-selected={filterTab === tab} className={filterTab === tab ? 'is-active' : ''} onClick={() => setFilterTab(tab)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="ins-filter-all">
              <input type="checkbox" checked={allDraftSelected} onChange={() => setDraftKeys(allDraftSelected ? new Set() : new Set(filterRows.map((row) => row.key)))} aria-label={`Select all ${filterTab === 'category' ? 'categories' : 'groups'}`} />
              <span className={allDraftSelected ? 'ins-check is-checked' : 'ins-check'}>{allDraftSelected && <Check size={14} strokeWidth={3} />}</span>
            </label>
            <div className="ins-filter-list">
              <AnimatePresence initial={false} mode="popLayout">
              {filterRows.map((row) => {
                const checked = draftKeys.has(row.key)
                return (
                  <motion.label key={`${filterTab}:${row.key}`} layout="position" transition={LIST_SPRING} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.15 } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleDraftKey(row.key)} />
                    <i style={{ background: colors.get(row.key) ?? 'var(--erd-text3)' }} />
                    {row.emoji ? <span aria-hidden="true">{row.emoji}</span> : <span />}
                    <span className="ins-filter-label">{row.label}</span>
                    <span className={checked ? 'ins-check is-checked' : 'ins-check'}>{checked && <Check size={14} strokeWidth={3} />}</span>
                  </motion.label>
                )
              })}
              </AnimatePresence>
            </div>
            {!hasDraftVisibleCategory && <p className="ins-filter-error">Keep at least one item in the chart.</p>}
            <div className="ins-filter-actions">
              <button type="button" className="action-button is-ghost" onClick={() => setFilterOpen(false)}>
                Cancel
              </button>
              <button type="button" className="action-button" disabled={!hasDraftVisibleCategory} onClick={applyFilter}>
                Apply
              </button>
            </div>
            </AutoHeight>
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  )
}
