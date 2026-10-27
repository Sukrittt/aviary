'use client'

import { useId, useState } from 'react'
import { AmountField, AmountSheet } from './AmountSheet'
import { ReadOnlyNotice } from './BudgetNotices'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { useSpaces } from '../hooks/useSpaces'
import { useUpdateCategory } from '../hooks/useCategories'
import { splitEmoji } from '../lib/emoji'
import { nextGoalMonth, type GoalProgress } from '../lib/goal'
import { currentMonthKey } from '../lib/envelope'
import type { CategoryGoal } from '../types'

/** A goal as typed: the amount as text, no deadline as ''. */
export interface GoalDraft {
  amount: string
  by: string
  yearly: boolean
}

export const draftOf = (goal?: CategoryGoal): GoalDraft => ({ amount: goal ? String(goal.amount) : '', by: goal?.by ?? '', yearly: goal?.repeat === 'yearly' })

/** The goal a draft describes, or null while it has no amount or its month is already over. */
export function goalOf(d: GoalDraft): CategoryGoal | null {
  const amount = Number(d.amount)
  if (!(amount > 0) || (d.by && d.by < currentMonthKey())) return null
  return { amount, ...(d.by ? { by: d.by } : {}), ...(d.by && d.yearly ? { repeat: 'yearly' as const } : {}) }
}

const SAVE_FAILED = "Couldn't save. Check your connection and try again."

/** Target, optional month, and once or every year. Shared by this sheet and Add category. */
export function GoalFields({ draft, onChange, autoFocus }: { draft: GoalDraft; onChange: (d: GoalDraft) => void; autoFocus?: boolean }) {
  const amountId = useId()
  const byId = useId()
  const thisMonth = currentMonthKey()
  return (
    <>
      <AmountField id={amountId} value={draft.amount} onChange={(amount) => onChange({ ...draft, amount })} hint="What you're saving up to." autoFocus={autoFocus} />
      <section className="erd-sub-section">
        <label className="erd-log-label" htmlFor={byId}>By</label>
        <input id={byId} type="month" min={thisMonth} className="env-input goal-month" value={draft.by} onChange={(e) => onChange({ ...draft, by: e.target.value })} />
        <p className="erd-sub-hint">{draft.by && draft.by < thisMonth ? "That month's over. Pick this one or later." : draft.by ? 'Need it again next year? Repeat it.' : 'Leave it empty to save at your own pace.'}</p>
        {draft.by && (
          <div className="erd-sub-picks">
            <button type="button" className={`erd-chip ${draft.yearly ? '' : 'is-selected'}`} aria-pressed={!draft.yearly} onClick={() => onChange({ ...draft, yearly: false })}>Just once</button>
            <button type="button" className={`erd-chip ${draft.yearly ? 'is-selected' : ''}`} aria-pressed={draft.yearly} onClick={() => onChange({ ...draft, yearly: true })}>Every year</button>
          </div>
        )}
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
 * The row's one-tap actions under a goal: set the monthly amount it needs, or
 * repeat or remove a done one. Never changes anything without the tap.
 */
export function GoalActions({ category, goal, progress, month, money, onSetMonthly }: {
  category: string
  goal: CategoryGoal
  progress: GoalProgress
  month: string
  money: (n: number) => string
  onSetMonthly: (category: string, amount: number) => Promise<void>
}) {
  const update = useUpdateCategory()
  const set = useButtonPhase()
  const repeat = useButtonPhase()
  const remove = useButtonPhase()
  const [error, setError] = useState('')
  // Held while the tick plays: the write itself flips the row to On track.
  const [need, setNeed] = useState<number | null>(null)
  const busy = [set, repeat, remove].some((p) => p.saving || p.success)

  async function run(phase: ReturnType<typeof useButtonPhase>, action: () => Promise<unknown>) {
    if (busy) return
    phase.start()
    setError('')
    try {
      await action()
      phase.succeed(() => setNeed(null))
    } catch {
      phase.fail()
      setNeed(null)
      setError(SAVE_FAILED)
    }
  }

  const shownNeed = need ?? progress.monthlyNeed
  const showSet = (progress.status === 'behind' || set.saving || set.success) && shownNeed !== undefined
  const showDone = progress.status === 'done' || repeat.saving || repeat.success
  if (!showSet && !showDone && !error) return null

  return (
    <div className="env2-goal-actions">
      {showSet && (
        <SuccessButton type="button" baseClass="account-pill-btn" saving={set.saving} success={set.success} savingLabel="Setting…" successLabel="Set" disabled={busy}
          onClick={() => { setNeed(shownNeed); void run(set, () => onSetMonthly(category, shownNeed)) }}>
          Set {money(shownNeed)}/mo
        </SuccessButton>
      )}
      {showDone && (
        <>
          {goal.by && (
            <SuccessButton type="button" baseClass="account-pill-btn" saving={repeat.saving} success={repeat.success} savingLabel="Saving…" successLabel="Repeated" disabled={busy}
              onClick={() => void run(repeat, () => update.mutateAsync({ name: category, updates: { goal: { ...goal, by: nextGoalMonth(progress.by ?? goal.by!, month) } } }))}>
              Repeat next year
            </SuccessButton>
          )}
          <SuccessButton type="button" baseClass="account-pill-btn" saving={remove.saving} success={remove.success} savingLabel="Saving…" successLabel="Done" disabled={busy}
            onClick={() => void run(remove, () => update.mutateAsync({ name: category, updates: { goal: null } }))}>
            Back to spending
          </SuccessButton>
        </>
      )}
      {error && <span role="alert" className="env2-goal-error">{error}</span>}
    </div>
  )
}
