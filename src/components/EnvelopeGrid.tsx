import { useCurrency } from '@/src/context/CurrencyContext'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChevronsDownUp } from 'lucide-react'
import { SpringChevron, SpringCollapse } from './SpringCollapse'
import { avatarColorFor, categoryEmoji, groupEmoji, splitEmoji } from '../lib/emoji'
import type { Envelope } from '../types/expense'
import { BirdEmptyState } from './BirdEmptyState'
import { todayIST } from '../lib/date'

/** Web twin of Mobile's app/(tabs)/index.tsx envelopes card (EnvelopeGroup + EnvelopeRow). */

interface Props {
  envelopes: Envelope[]
  groups: string[]
  hideAmounts: boolean
  onManage: () => void
  onMoveMoney: (category: string) => void
  onAssignFromRTA: (category: string) => void
  onSetAssigned: (category: string) => void
  onPayCreditCard?: () => void
}

const UNGROUPED_LABEL = 'Other'

function usedPct(e: Envelope): number {
  if (e.assigned > 0) return Math.round((e.spent / e.assigned) * 100)
  return e.spent > 0 ? Infinity : 0
}

function usedPctLabel(e: Envelope): string {
  if (e.assigned > 0) return `${usedPct(e)}%`
  return e.spent > 0 ? '∞' : '—'
}

const DAY_MS = 86_400_000

/**
 * Days counted on the IST calendar, like every other date in the app
 * (src/lib/date.ts). Not the device's local day: the server renders this too
 * (app/expense/page.tsx) from a UTC clock, and the two have to agree or
 * hydration fails between midnight and 05:30 IST.
 */
function lastSpentLabel(iso: string | undefined): string {
  if (!iso) return '—'
  // Both sides as UTC midnights of their calendar dates, so the difference is whole days.
  const spent = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(spent)) return '—'
  const days = Math.round((Date.parse(`${todayIST()}T00:00:00Z`) - spent) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days >= 2 && days <= 31) return `${days}d ago`
  return new Date(spent).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function EnvelopeGrid({ envelopes, groups, hideAmounts, onManage, onMoveMoney, onAssignFromRTA, onSetAssigned, onPayCreditCard }: Props) {
  const { formatCurrency } = useCurrency()
  const money = (n: number) => (hideAmounts ? '---' : formatCurrency(n))

  const router = useRouter()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menuCategory, setMenuCategory] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null)
  const [menuPortalTarget, setMenuPortalTarget] = useState<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuPortalRef = useRef<HTMLDivElement | null>(null)

  function closeMenu() {
    setMenuCategory(null)
    setMenuAnchor(null)
    setMenuPortalTarget(null)
  }

  useEffect(() => {
    if (!menuCategory) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (menuPortalRef.current?.contains(target)) return
      closeMenu()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuCategory])

  // Portaled to <body> with viewport-fixed coordinates so the menu escapes
  // the card's clipping ancestors (.erd-main / .erd-content both clip
  // overflow regardless of z-index) instead of getting cropped.
  function openMenu(category: string, trigger: HTMLElement) {
    if (menuCategory === category) return closeMenu()
    const rect = trigger.getBoundingClientRect()
    setMenuAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    // Portal inside .expense-redesign (not document.body) so the menu still
    // inherits the --erd-* theme variables scoped to that wrapper; its
    // `overflow: hidden` doesn't clip position:fixed descendants.
    setMenuPortalTarget(trigger.closest<HTMLElement>('.expense-redesign'))
    setMenuCategory(category)
  }

  const ccEnvelope = useMemo(() => envelopes.find((e) => e.isCreditCardPayment) ?? null, [envelopes])

  const grouped = useMemo(() => {
    const regular = envelopes.filter((e) => !e.isCreditCardPayment)
    const list = groups
      .map((g) => ({ label: g, items: regular.filter((e) => e.group === g) }))
      .filter((g) => g.items.length > 0)
    const ungrouped = regular.filter((e) => !e.group)
    if (ungrouped.length > 0) list.push({ label: UNGROUPED_LABEL, items: ungrouped })
    return list
  }, [envelopes, groups])

  const allCollapsed = grouped.length > 0 && grouped.every((g) => collapsed.has(g.label))

  function toggleGroup(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  function renderRow(e: Envelope, group?: string) {
    const isCC = e.isCreditCardPayment
    const name = isCC ? 'Credit Card Payment' : splitEmoji(e.category).text
    const pct = Math.max(0, Math.min(100, e.spentPct))
    // Unclamped, for color only — see Mobile's ProgressBar thresholds: muted
    // at exactly 100%, coral past 90%, warn past 75%.
    const rawPct = usedPct(e)
    const fill = (!e.assigned && !e.spent) || rawPct === 100 ? 'is-done' : rawPct > 90 ? 'is-coral' : rawPct > 75 ? 'is-warn' : 'is-mint'
    const isMenuOpen = menuCategory === e.category

    return (
      <div key={e.category} className={`env2-row ${isMenuOpen ? 'is-open' : ''}`} ref={isMenuOpen ? menuRef : undefined}>
        <button
          type="button"
          className="env2-row-main"
          onClick={(ev) => openMenu(e.category, ev.currentTarget)}
          aria-expanded={isMenuOpen}
        >
          <span className="env2-row-top">
            <span className="env2-emoji env2-category-icon" style={{ background: avatarColorFor(name) }} aria-hidden="true">{isCC ? '💳' : categoryEmoji(e.category, group)}</span>
            <span className="env2-name">{name}</span>
            <span className="env2-spent-of">
              <span className="env2-spent-label">Spent</span> {money(e.spent)} <span className="env2-spent-label">of</span> {money(e.assigned)}
            </span>
          </span>
          <span className="env-bar-track env2-bar">
            <span className={`env-bar-fill ${fill}`} style={{ display: 'block', width: `${pct}%` }} />
          </span>
          {!isCC && (
            <span className="env2-meta">
              Used {usedPctLabel(e)} · Last spent {lastSpentLabel(e.lastSpentDate)}
            </span>
          )}
        </button>
        <span className={`env2-available ${e.isOverspent ? 'is-neg' : ''}`}>
          <span className="env2-balance-label">{e.isOverspent ? 'Overspent' : 'Left'}</span>
          {money(e.available)}
        </span>

        {isMenuOpen && menuAnchor && createPortal(
          <div
            className="env-menu env2-menu"
            ref={menuPortalRef}
            style={{ position: 'fixed', top: menuAnchor.top, right: menuAnchor.right }}
          >
            <button type="button" className="env-menu-item" onClick={() => { onMoveMoney(e.category); closeMenu() }}>
              Pull money from envelopes
            </button>
            <button type="button" className="env-menu-item" onClick={() => { onAssignFromRTA(e.category); closeMenu() }}>
              Assign from Ready to Assign
            </button>
            <button type="button" className="env-menu-item" onClick={() => { onSetAssigned(e.category); closeMenu() }}>
              Edit assigned amount
            </button>
            {!isCC && (
              <button
                type="button"
                className="env-menu-item"
                onClick={() => router.push(`/expense/transactions?category=${encodeURIComponent(e.category)}`)}
              >
                View transactions
              </button>
            )}
            {isCC && e.available > 0 && (
              <button type="button" className="env-menu-item env-menu-item-danger" onClick={() => { onPayCreditCard?.(); closeMenu() }}>
                Pay credit card bill
              </button>
            )}
          </div>,
          menuPortalTarget ?? document.body
        )}
      </div>
    )
  }

  return (
    <>
      <div className="env2-head">
        <div className="env2-head-title">
          <h3>Envelopes</h3>
          <button
            type="button"
            className="env2-icon-btn"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(grouped.map((g) => g.label)))}
            aria-label={allCollapsed ? 'Expand all' : 'Collapse all'}
            title={allCollapsed ? 'Expand all' : 'Collapse all'}
          >
            <ChevronsDownUp size={16} />
          </button>
        </div>
        <button type="button" className="erd-manage-btn" onClick={onManage}>
          Manage
        </button>
      </div>

      {!envelopes.length ? (
        <BirdEmptyState
          subject="envelopes"
          title="Your envelopes are waiting"
          description="Give every kind of spending a place to land."
          action={{ label: 'Add your first envelope', onClick: onManage }}
        />
      ) : (
        <div className="env2-list">
          {grouped.map(({ label, items }) => {
            const expanded = !collapsed.has(label)
            const totalAvailable = items.reduce((s, e) => s + e.available, 0)
            return (
              <div key={label} className="env2-group">
                <button type="button" className="env2-group-head" onClick={() => toggleGroup(label)} aria-expanded={expanded}>
                  <span className="env2-group-name">
                    <SpringChevron open={expanded} size={16} className="env2-chevron" />
                    <span className="env2-emoji">{groupEmoji(label)}</span>
                    <span>{splitEmoji(label).text}</span>
                  </span>
                  <span className={`env2-group-left ${totalAvailable < 0 ? 'is-neg' : ''}`}><span className="env2-balance-label">Left in group</span>{money(totalAvailable)}</span>
                </button>
                <SpringCollapse open={expanded}>
                  <div className="env2-group-rows">{items.map((e) => renderRow(e, label))}</div>
                </SpringCollapse>
              </div>
            )
          })}
          {ccEnvelope && (
            <div className="env2-cc">
              <span className="env2-cc-badge">PAYOFF</span>
              {renderRow(ccEnvelope)}
            </div>
          )}
        </div>
      )}
    </>
  )
}
