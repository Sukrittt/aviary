'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useAppearance } from '@/components/AppearanceProvider'
import { useBudgets } from '@/src/hooks/useBudgets'
import { useCategories } from '@/src/hooks/useCategories'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useGroups } from '@/src/hooks/useGroups'
import { EMPTY } from '@/src/lib/constants'
import { categoryEmoji, splitEmoji } from '@/src/lib/emoji'
import { computeEnvelopeState, currentMonthKey, daysLeftInMonth } from '@/src/lib/envelope'
import { formatDateTimeLong } from '@/src/lib/format'
import { darkTokens, lightTokens } from '@/src/theme/tokens'
import { AmountText, ease } from '@/src/components/landing/mobile/kit'
import {
  AnimatedUsedPercentage,
  DELTA_DELAY,
  DeltaBar,
  FadeInDown,
  STAGGER,
} from '@/src/components/landing/mobile/LogExpense'

/** The in-app receipt runs Mobile's beats at 0.6x their length; 1 is Mobile's pace. */
const PACE = 0.6
const at = (ms: number) => ms * PACE

export interface AddedExpense {
  id?: string
  /** Row version from the add; the server refuses a delete without it. */
  version?: number
  timestamp: string
  item: string
  category: string
  date: string
  amount: number
  loggedAt: string
}

const TICK_SRC = '/landing/success-tick.lottie'

/**
 * Mounted hidden under the log form so the tick's player (wasm from the CDN)
 * and file are already loaded by the time a save lands. Without it the tick
 * waits on the network first, and plays late.
 */
export function PreloadExpenseAddedTick() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
      <DotLottieReact src={TICK_SRC} autoplay={false} />
    </div>
  )
}

/**
 * Web twin of Mobile's app/modals/expense-added.tsx, shown inside the log
 * dialog in place of the form. Same beats: the tick plays, "Added ₹X" and the
 * item drop in, then the envelope card, whose bar grows to where it stood
 * before this expense, pins a marker, and eases in the new spend while the
 * "left" figure counts down on the same beat. Days left and pace land last.
 */
export function ExpenseAdded({
  expense,
  undoing,
  undoError,
  onUndo,
  onDone,
}: {
  expense: AddedExpense
  undoing: boolean
  undoError: string
  onUndo: () => void
  onDone: () => void
}) {
  const { formatMoney } = useCurrency()
  const { theme } = useAppearance()
  const tokens = theme === 'light' ? lightTokens : darkTokens
  const budgetsQ = useBudgets()
  const expensesQ = useRecentExpenses()
  const categoriesQ = useCategories()
  const groupsQ = useGroups()
  const { amount, item, category, date, timestamp } = expense

  const envelope = useMemo(() => {
    const state = computeEnvelopeState(
      budgetsQ.data ?? EMPTY,
      expensesQ.data ?? EMPTY,
      currentMonthKey(),
      categoriesQ.data ?? EMPTY,
      groupsQ.data ?? EMPTY,
    )
    return state.envelopes.find((e) => e.category === category)
  }, [budgetsQ.data, expensesQ.data, categoriesQ.data, groupsQ.data, category])

  // The refetch this add triggered may not have landed yet. Until the new row
  // is in the list, charge it by hand so the numbers are right on first paint.
  const counted = (expensesQ.data ?? EMPTY).some((e) => e.timestamp === timestamp)
  const spent = (envelope?.spent ?? 0) + (counted ? 0 : amount)
  const left = (envelope?.available ?? 0) - (counted ? 0 : amount)
  const funded = (envelope?.assigned ?? 0) + (envelope?.rolledOver ?? 0)
  // A past-month expense doesn't move this month's envelope, so no card for it.
  const isCurrentMonth = date.slice(0, 7) === currentMonthKey()
  const showEnvelope = isCurrentMonth && envelope != null && funded > 0
  const spentPct = funded > 0 ? Math.min(100, (spent / funded) * 100) : 0
  const prevPct = funded > 0 ? Math.min(100, ((spent - amount) / funded) * 100) : 0
  const preLeft = left + amount
  const daysLeft = daysLeftInMonth()
  const perDay = daysLeft > 0 ? Math.round(left / daysLeft) : left

  // Counts down from the pre-expense figure once, on the delta's beat, and
  // never restarts when a background refetch nudges `left`.
  const [shownLeft, setShownLeft] = useState(preLeft)
  const seededRef = useRef(false)
  useEffect(() => {
    if (!showEnvelope || seededRef.current) return
    seededRef.current = true
    setShownLeft(preLeft)
    const t = setTimeout(() => setShownLeft(left), at(DELTA_DELAY))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEnvelope])

  const categoryName = splitEmoji(category).text
  const subtitle = item || categoryName

  return (
    <div className="erd-added">
      <div className="erd-added-receipt">
        <DotLottieReact src={TICK_SRC} autoplay loop={false} className="erd-added-tick" />
        <FadeInDown delay={at(STAGGER.headline)} duration={at(420)} className="erd-added-headline">
          <span>Added</span>
          <AmountText value={amount} animate />
        </FadeInDown>
        {subtitle !== '' && (
          <FadeInDown delay={at(STAGGER.detail)} duration={at(420)} className="erd-added-subtitle">
            {!item && category ? `${categoryEmoji(category, envelope?.group)} ` : ''}
            {subtitle}
          </FadeInDown>
        )}
      </div>

      {showEnvelope && (
        <FadeInDown delay={at(STAGGER.card)} duration={at(460)} className="erd-added-card">
          <AnimatedUsedPercentage from={prevPct} to={spentPct} categoryName={categoryName} tokens={tokens} pace={PACE} />
          <div className="erd-added-left">
            <AmountText value={shownLeft} animate />
            <span>{`left of ${formatMoney(Math.round(funded))}`}</span>
          </div>
          <div className="erd-added-bar">
            <DeltaBar from={prevPct} to={spentPct} amount={amount} tokens={tokens} pace={PACE} />
          </div>
          <motion.div
            className="erd-added-pace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: at(STAGGER.cardFooter) / 1000, duration: at(420) / 1000, ease: ease.inOutQuad }}
          >
            <span>{daysLeft === 0 ? 'Less than 24 hrs' : `${daysLeft} days left`}</span>
            <strong>{`${formatMoney(perDay)}/day to stay on track`}</strong>
          </motion.div>
        </FadeInDown>
      )}

      <FadeInDown delay={at(STAGGER.footer)} duration={at(440)} className="erd-added-footer">
        {undoError !== '' && (
          <p className="erd-log-error" role="alert">
            {undoError}
          </p>
        )}
        <div className="erd-added-actions">
          {/* No id means the delete could only match by timestamp and item, and might hit the wrong row. */}
          {expense.id && (
            <button type="button" className="account-pill-btn erd-added-undo" disabled={undoing} onClick={onUndo}>
              {undoing ? 'Undoing…' : 'Undo'}
            </button>
          )}
          <button type="button" className="setup-cta erd-added-done" autoFocus onClick={onDone}>
            Done
          </button>
        </div>
        <span className="erd-added-stamp">{formatDateTimeLong(expense.loggedAt)}</span>
      </FadeInDown>
    </div>
  )
}
