import { useCurrency } from '@/src/context/CurrencyContext'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowsInLineVerticalIcon } from '@/src/components/icons'
import { SpringChevron, SpringCollapse } from './SpringCollapse'
import { splitEmoji } from '../lib/emoji'
import { useCategoryStyle } from '../hooks/useCategories'
import { CategoryIcon } from './CategoryIcon'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MENU_ITEM, MENU_POPUP } from './menuStyles'
import type { Envelope } from '../types/expense'
import { BirdEmptyState } from './BirdEmptyState'
import { todayIST } from '../lib/date'
import { RollingAmount } from './home/RollingAmount'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { rolledOverLine } from '../lib/rollover'
import { allowanceNote, paceLine, resetChip, weekResult, type PaceStatus, type WeekPace } from '../lib/weekly'

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
  /** Stored icons by category name, from `useCategoryIcons()`. */
  categoryIcons?: Map<string, string>
  /** Picked icons by group name, from `useGroupIcons()`. */
  groupIcons?: Map<string, string>
  /** Bump to roll last month's carry into each Left amount (see RollingAmount). 0 shows them settled. */
  rollPlay?: number
  /** The month on screen ("2026-11"), for the chips' "+₹95 from October" tooltip. */
  month?: string
  /** This week's pace for each weekly-tracked category (src/lib/weekly.ts). */
  paces?: Map<string, WeekPace>
  /** Categories with Track weekly on. Omit to hide the switch (another month on screen). */
  weekly?: Map<string, string>
  onToggleWeekly?: (category: string, on: boolean) => void
}

const UNGROUPED_LABEL = 'Other'

function usedPct(e: Envelope): number {
  if (e.assigned > 0) return Math.round((e.spent / e.assigned) * 100)
  return e.spent > 0 ? Infinity : 0
}

/** Mobile's availablePill(): red only when overspent, no pill at all for an envelope spent exactly to zero. */
function pillClass(e: Envelope): string {
  if (e.isOverspent) return 'is-over'
  if (usedPct(e) === 100) return 'is-empty'
  return usedPct(e) > 75 ? 'is-low' : 'is-good'
}

/** Mobile's weeklyPill(): pace, not fullness. Green on track, amber ahead of the tick, red over. */
const PACE_PILL: Record<PaceStatus, string> = { onTrack: 'is-good', ahead: 'is-low', over: 'is-over' }
const PACE_FILL: Record<PaceStatus, string> = { onTrack: 'is-mint', ahead: 'is-warn', over: 'is-coral' }

/** The menu's week-by-week list: the weeks you spent in so far, and this one. Mobile's WeekBreakdown. */
function WeekBreakdown({ pace, e, money }: { pace: WeekPace; e: Envelope; money: (n: number) => string }) {
  const note = allowanceNote(pace, money)
  const last = pace.weeks.length - 1
  return (
    <div className="env2-weeks">
      <div className="env2-weeks-month">{money(e.spent)} of {money(e.assigned + e.rolledOver)} this month</div>
      {pace.weeks.map((w, i) => ({ w, i })).filter(({ w, i }) => w.spent !== 0 || i === last).map(({ w, i }) => {
        const isNow = i === last
        const result = weekResult(w, isNow, pace.left, money)
        const tone = isNow ? PACE_PILL[pace.status] : result.over ? 'is-over' : 'is-good'
        const pct = isNow ? pace.spentPct : w.allowance > 0 ? Math.min(100, (w.spent / w.allowance) * 100) : w.spent > 0 ? 100 : 0
        const fill = isNow ? PACE_FILL[pace.status] : w.spent > w.allowance ? 'is-coral' : 'is-mint'
        return (
          <div key={w.from} className={`env2-week ${isNow ? 'is-now' : ''}`}>
            <span className="env2-week-label">{isNow ? 'This week' : `Week ${i + 1}`}</span>
            <span className="env2-bar-wrap">
              <span className="env-bar-track env2-bar">
                <span className={`env-bar-fill ${fill}`} style={{ display: 'block', width: `${pct}%` }} />
              </span>
              {isNow && pace.tickPct < 100 && <span className="env2-tick" style={{ left: `${pace.tickPct}%` }} />}
            </span>
            <span className={`env2-pill ${tone}`}>{result.text}</span>
          </div>
        )
      })}
      {note && <p className="env2-weeks-note">{note}</p>}
    </div>
  )
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

export function EnvelopeGrid({ envelopes, groups, hideAmounts, onManage, onMoveMoney, onAssignFromRTA, onSetAssigned, onPayCreditCard, categoryIcons, groupIcons, rollPlay = 0, month, paces, weekly, onToggleWeekly }: Props) {
  const styleOf = useCategoryStyle()
  const { formatCurrency } = useCurrency()
  const money = (n: number) => (hideAmounts ? '---' : formatCurrency(n))

  const router = useRouter()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menuCategory, setMenuCategory] = useState<string | null>(null)
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

  // Rows that carried something roll in one after another, top to bottom.
  const rollOrder = useMemo(() => {
    const order = new Map<string, number>()
    for (const e of [...grouped.flatMap((g) => g.items), ...(ccEnvelope ? [ccEnvelope] : [])]) {
      if (e.rolledOver) order.set(e.category, order.size)
    }
    return order
  }, [grouped, ccEnvelope])

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
    // Unclamped, for color only. Matches Mobile's ProgressBar: coral only when
    // overspent, muted at exactly 100%, warn past 75%.
    const rawPct = usedPct(e)
    const fill = e.isOverspent ? 'is-coral' : (!e.assigned && !e.spent) || rawPct === 100 ? 'is-done' : rawPct > 75 ? 'is-warn' : 'is-mint'
    // Spending with nothing assigned: "of ₹0" and "Used ∞" said nothing useful.
    const unbudgeted = !e.assigned && e.spent > 0
    const isMenuOpen = menuCategory === e.category
    // Home keeps the month for every row; a weekly row adds a pace tick and
    // tones bar and pill by month pace. The weeks live in the row's menu.
    const pace = isCC ? undefined : paces?.get(e.category)

    return (
      <div key={e.category} className={`env2-row ${isMenuOpen ? 'is-open' : ''}`}>
        <DropdownMenu open={isMenuOpen} onOpenChange={(open) => setMenuCategory(open ? e.category : null)}>
        <DropdownMenuTrigger
          render={<button type="button" className="env2-row-main" />}
        >
          <span className="env2-row-top">
            <span className="env2-emoji env2-category-icon" style={styleOf(name)} aria-hidden="true">
              <CategoryIcon name={e.category} icon={isCC ? 'CreditCard' : categoryIcons?.get(e.category)} group={group} />
            </span>
            <span className="env2-name">{name}</span>
            <span className="env2-spent-of">
              <span className="env2-spent-label">Spent</span> {money(e.spent)}
              {!unbudgeted && <> <span className="env2-spent-label">of</span> {money(e.assigned)}</>}
            </span>
          </span>
          {pace ? (
            <>
              <span className="env2-bar-wrap">
                <span className="env-bar-track env2-bar">
                  <span className={`env-bar-fill ${PACE_FILL[pace.monthStatus]}`} style={{ display: 'block', width: `${pace.monthSpentPct}%` }} />
                </span>
                {pace.monthTickPct < 100 && <span className="env2-tick" style={{ left: `${pace.monthTickPct}%` }} />}
              </span>
              <span className={`env2-meta env2-pace ${pace.status === 'over' ? 'is-over' : ''}`}>
                <span>{paceLine(pace, money)}</span>
                <span className="env2-reset">{resetChip(pace)}</span>
              </span>
            </>
          ) : (
            <span className="env-bar-track env2-bar">
              <span className={`env-bar-fill ${fill}`} style={{ display: 'block', width: `${pct}%` }} />
            </span>
          )}
          {!isCC && !pace && (
            <span className="env2-meta">
              {unbudgeted ? 'Not budgeted · ' : ''}Last spent {lastSpentLabel(e.lastSpentDate)}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={MENU_POPUP}>
          {pace && <WeekBreakdown pace={pace} e={e} money={money} />}
          {!isCC && weekly && onToggleWeekly && (
            <>
              <DropdownMenuCheckboxItem
                className={`${MENU_ITEM} pr-8`}
                checked={weekly.has(e.category)}
                onCheckedChange={(on) => onToggleWeekly(e.category, on)}
              >
                Track weekly
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem className={MENU_ITEM} onClick={() => onMoveMoney(e.category)}>
            Pull money from categories
          </DropdownMenuItem>
          <DropdownMenuItem className={MENU_ITEM} onClick={() => onAssignFromRTA(e.category)}>
            Assign from Ready to Assign
          </DropdownMenuItem>
          <DropdownMenuItem className={MENU_ITEM} onClick={() => onSetAssigned(e.category)}>
            Edit assigned amount
          </DropdownMenuItem>
          {!isCC && (
            <DropdownMenuItem
              className={MENU_ITEM}
              onClick={() => router.push(`/expense/transactions?category=${encodeURIComponent(e.category)}`)}
            >
              View transactions
            </DropdownMenuItem>
          )}
          {isCC && e.available > 0 && (
            <DropdownMenuItem className={MENU_ITEM} variant="destructive" onClick={() => onPayCreditCard?.()}>
              Pay credit card bill
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
        </DropdownMenu>
        <span className="env2-available">
          <span className="env2-balance-label">{e.isOverspent ? 'Overspent' : 'Left'}</span>
          {(() => {
            const pill = (
              <RollingAmount
                className={`env2-pill ${pace ? PACE_PILL[pace.monthStatus] : pillClass(e)}`}
                from={e.available - e.rolledOver}
                to={e.available}
                play={hideAmounts ? 0 : rollPlay}
                delayMs={Math.min(rollOrder.get(e.category) ?? 0, 5) * 150}
                format={money}
              />
            )
            // What carried in, on hover or focus, since the row no longer says it.
            const tip = month && !hideAmounts ? rolledOverLine(e.rolledOver, month, formatCurrency) : null
            if (!tip) return pill
            return (
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} />}>{pill}</TooltipTrigger>
                <TooltipContent>{tip}</TooltipContent>
              </Tooltip>
            )
          })()}
        </span>

      </div>
    )
  }

  return (
    <>
      <div className="env2-head">
        <div className="env2-head-title">
          <h3>Categories</h3>
          <button
            type="button"
            className="env2-icon-btn"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(grouped.map((g) => g.label)))}
            aria-label={allCollapsed ? 'Expand all' : 'Collapse all'}
            title={allCollapsed ? 'Expand all' : 'Collapse all'}
          >
            <ArrowsInLineVerticalIcon size={16} />
          </button>
        </div>
        <button type="button" className="erd-manage-btn" onClick={onManage}>
          Manage
        </button>
      </div>

      {!envelopes.length ? (
        <BirdEmptyState
          subject="envelopes"
          title="Your categories are waiting"
          description="Give every kind of spending a place to land."
          action={{ label: 'Add your first category', onClick: onManage }}
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
                    <span className="env2-emoji" aria-hidden="true"><CategoryIcon kind="group" name={label} icon={groupIcons?.get(label)} /></span>
                    <span>{splitEmoji(label).text}</span>
                  </span>
                  {/* A summary, so neutral: color is the rows' pills' job. Red only when the group as a whole is over. */}
                  <span className={`env2-group-left ${totalAvailable < 0 ? 'is-neg' : ''}`}>
                    <span className="env2-balance-label">{totalAvailable < 0 ? 'Over in group' : 'Left in group'}</span>
                    {money(Math.abs(totalAvailable))}
                  </span>
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
