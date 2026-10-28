'use client'

import { useId, useState, type ReactNode } from 'react'
import { AmountField, AmountSheet } from './AmountSheet'
import { MonthPicker } from './DatePicker'
import { useCurrency } from '@/src/context/CurrencyContext'
import { ReadOnlyNotice } from './BudgetNotices'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { useSpaces } from '../hooks/useSpaces'
import { useUpdateCategory } from '../hooks/useCategories'
import { splitEmoji } from '../lib/emoji'
import { goalLine, nextGoalMonth, shortMonth, type GoalProgress } from '../lib/goal'
import { currentMonthKey } from '../lib/envelope'
import type { CategoryGoal } from '../types'

/** A goal as typed: the amount as text, no deadline as ''. */
export interface GoalDraft {
  amount: string
  by: string
  yearly: boolean
}

export const draftOf = (goal?: CategoryGoal): GoalDraft => ({ amount: goal ? String(goal.amount) : '', by: goal?.by ?? '', yearly: goal?.repeat === 'yearly' })

/** The goal a draft describes, or null while it has no amount or it's a one-off whose month is over. A yearly one just rolls on. */
export function goalOf(d: GoalDraft): CategoryGoal | null {
  const amount = Number(d.amount)
  if (!(amount > 0) || (d.by && !d.yearly && d.by < currentMonthKey())) return null
  return { amount, ...(d.by ? { by: d.by } : {}), ...(d.by && d.yearly ? { repeat: 'yearly' as const } : {}) }
}

const SAVE_FAILED = "Couldn't save. Check your connection and try again."

/**
 * Target, optional month, and once or every year. Shared by this sheet and Add
 * category; `compact` dresses it in the envelope sheet's smaller labels and chips.
 */
export function GoalFields({ draft, onChange, autoFocus, compact }: { draft: GoalDraft; onChange: (d: GoalDraft) => void; autoFocus?: boolean; compact?: boolean }) {
  const amountId = useId()
  const byId = useId()
  const thisMonth = currentMonthKey()
  const over = !!draft.by && !draft.yearly && draft.by < thisMonth
  const { currencySymbol } = useCurrency()
  const chip = compact ? 'env-pct' : 'erd-chip'
  const on = compact ? 'is-on' : 'is-selected'
  const by = (
    <>
      <MonthPicker id={byId} value={draft.by} onChange={(by) => onChange({ ...draft, by })} />
      <p className={compact ? 'env-sheet-hint' : 'erd-sub-hint'}>{over ? "That month's over. Pick this one or later." : draft.by ? 'Need it again next year? Repeat it.' : 'Leave it empty to save at your own pace.'}</p>
      {draft.by && (
        <div className={compact ? 'env-pct-row' : 'erd-sub-picks'}>
          <button type="button" className={`${chip} ${draft.yearly ? '' : on}`} aria-pressed={!draft.yearly} onClick={() => onChange({ ...draft, yearly: false })}>Just once</button>
          <button type="button" className={`${chip} ${draft.yearly ? on : ''}`} aria-pressed={draft.yearly} onClick={() => onChange({ ...draft, yearly: true })}>Every year</button>
        </div>
      )}
    </>
  )
  if (compact) {
    return (
      <>
        <label className="env-sheet-section-label" htmlFor={amountId}>Amount</label>
        <div className="env-amount">
          <span className="env-amount-symbol" aria-hidden="true">{currencySymbol}</span>
          <input id={amountId} className="env-input" type="text" inputMode="decimal" placeholder="0" autoFocus={autoFocus} value={draft.amount}
            onChange={(e) => { if (/^\d{0,9}(\.\d{0,2})?$/.test(e.target.value)) onChange({ ...draft, amount: e.target.value }) }} />
        </div>
        <label className="env-sheet-section-label" htmlFor={byId}>By</label>
        {by}
      </>
    )
  }
  return (
    <>
      <AmountField id={amountId} value={draft.amount} onChange={(amount) => onChange({ ...draft, amount })} hint="What you're saving up to." autoFocus={autoFocus} />
      <section className="erd-sub-section">
        <label className="erd-log-label" htmlFor={byId}>By</label>
        {by}
      </section>
    </>
  )
}

/** Make an envelope a goal, change it, or turn it back into a spending category. */
export function GoalSheet({ category, goal, onClose }: { category: string; goal?: CategoryGoal; onClose: () => void }) {
  const { readOnly } = useSpaces()
  const update = useUpdateCategory()
  const save = useButtonPhase()
  const remove = useButtonPhase()
  const busy = save.saving || save.success || remove.saving || remove.success
  const [draft, setDraft] = useState(() => draftOf(goal))
  const [error, setError] = useState('')
  const next = goalOf(draft)

  async function write(phase: ReturnType<typeof useButtonPhase>, value: CategoryGoal | null) {
    if (busy) return
    phase.start()
    setError('')
    try {
      await update.mutateAsync({ name: category, updates: { goal: value } })
      phase.succeed(onClose)
    } catch {
      phase.fail()
      setError(SAVE_FAILED)
    }
  }

  return (
    <AmountSheet
      title={goal ? `Goal for ${splitEmoji(category).text}` : `Make ${splitEmoji(category).text} a goal`}
      onClose={onClose}
      busy={busy}
      replaceBody={readOnly ? <ReadOnlyNotice onClose={onClose} /> : undefined}
      footer={
        <div className="goal-sheet-actions">
          {goal && (
            <SuccessButton type="button" baseClass="account-pill-btn" saving={remove.saving} success={remove.success} savingLabel="Saving…" successLabel="Done" disabled={busy} onClick={() => void write(remove, null)}>
              Back to spending
            </SuccessButton>
          )}
          <SuccessButton type="button" baseClass="erd-log-submit" saving={save.saving} success={save.success} successLabel="Saved" disabled={!next || busy} onClick={() => next && void write(save, next)}>
            Save goal
          </SuccessButton>
        </div>
      }
    >
      <GoalFields draft={draft} onChange={setDraft} autoFocus />
      {error && <p role="alert" className="erd-log-error">{error}</p>}
    </AmountSheet>
  )
}

/**
 * The row's one line under a goal's bar, with its actions inline: set the
 * monthly amount a behind goal needs, or repeat or remove a done one. Nothing
 * changes without the tap; without onSetMonthly it's the plain line.
 */
export function GoalLine({ category, goal, progress, money, month, onPull }: {
  category: string
  goal: CategoryGoal
  progress: GoalProgress
  month: string
  money: (n: number) => string
  /** Opens Pull money into this category for the amount it's behind by. Omitted: no actions (read-only, another month). */
  onPull?: (category: string, amount: number) => void
}) {
  const update = useUpdateCategory()
  const [busy, setBusy] = useState<'repeat' | 'remove' | null>(null)
  const [error, setError] = useState('')

  async function run(key: NonNullable<typeof busy>, action: () => Promise<unknown>) {
    if (busy) return
    setBusy(key)
    setError('')
    try {
      await action()
    } catch {
      setError(SAVE_FAILED)
    } finally {
      setBusy(null)
    }
  }
  const link = (key: NonNullable<typeof busy>, label: string, busyLabel: string, action: () => Promise<unknown>) => (
    <button type="button" className="env2-goal-link" disabled={!!busy} onClick={() => void run(key, action)}>
      {busy === key ? busyLabel : label}
    </button>
  )

  let line: ReactNode = goalLine(progress, money)
  if (onPull && progress.status === 'behind' && progress.monthlyNeed !== undefined && progress.by && progress.behindBy) {
    const short = progress.behindBy
    line = <>Behind by {money(short)} · <button type="button" className="env2-goal-link" disabled={!!busy} onClick={() => onPull(category, short)}>
      {/* One pass of the shimmer as it arrives, so a behind goal's Set catches the eye once. */}
      <span className="text-shimmer text-shimmer--once">Set {money(progress.monthlyNeed)}/mo</span>
    </button> to make it by {shortMonth(progress.by)}</>
  } else if (onPull && progress.status === 'done') {
    line = <>
      Done
      {goal.by && <> · {link('repeat', 'Repeat next year', 'Saving…', () => update.mutateAsync({ name: category, updates: { goal: { ...goal, by: nextGoalMonth(progress.by ?? goal.by!, month) } } }))}</>}
      {' · '}{link('remove', 'Back to spending', 'Saving…', () => update.mutateAsync({ name: category, updates: { goal: null } }))}
    </>
  }
  return (
    <span className={`env2-meta env2-goal-line is-${progress.status}`}>
      {line}
      {error && <span role="alert" className="env2-goal-error"> {error}</span>}
    </span>
  )
}
