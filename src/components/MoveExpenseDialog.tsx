'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getBudgetCategories, moveExpense } from '../api/spaces'
import { HttpError } from '../api/client'
import { useSpaces } from '../hooks/useSpaces'
import { splitEmoji } from '../lib/emoji'
import { Scrim, Sheet } from './MotionSheet'
import { CategoryIcon } from './CategoryIcon'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { BudgetIcon } from './CategoryIcon'

const plainKey = (name: string) => splitEmoji(name).text.toLowerCase()

function moveError(err: unknown, budgetName: string): string {
  if (err instanceof HttpError) {
    if (err.status === 400) return `${budgetName} doesn't have that category anymore. Pick another.`
    if (err.status === 404) return 'This expense was deleted on another device.'
    if (err.status === 409) return 'This expense changed on another device. Close it and try again.'
    if (err.status === 402) return `${budgetName} can't take new expenses right now.`
    if (err.status === 403) return "You're not in that budget anymore."
  }
  return 'Check your connection and try again.'
}

/**
 * "Move to another budget", for an expense logged in the wrong one: pick the
 * budget, then one of its categories (the same name preselected when it has
 * one), then move. Render inside <AnimatePresence>.
 */
export function MoveExpenseDialog({ id, version, category, onClose, onMoved }: {
  id: string
  version: number
  category: string
  onClose: () => void
  onMoved: () => void
}) {
  const { budgets, active } = useSpaces()
  const others = budgets.filter((b) => b.id !== active?.id)
  const [pickedTo, setTo] = useState<string | null>(null)
  // With just one other budget there's nothing to choose.
  const to = pickedTo ?? (others.length === 1 ? others[0].id : '')
  const target = others.find((b) => b.id === to)
  const categoriesQ = useQuery({ queryKey: ['spaces', to, 'categories'], queryFn: () => getBudgetCategories(to), enabled: !!to })
  const [picked, setPicked] = useState<string | null>(null)
  const same = categoriesQ.data?.find((c) => plainKey(c.name) === plainKey(category))?.name ?? ''
  const chosen = picked ?? same
  const [error, setError] = useState('')
  const button = useButtonPhase()
  const busy = button.saving || button.success
  const qc = useQueryClient()

  async function submit() {
    if (!target || !chosen || busy) return
    setError('')
    button.start()
    try {
      await moveExpense({ id, version, to: target.id, category: chosen })
      for (const key of ['expenses', 'budgets', 'ai-brief', 'category-map']) void qc.invalidateQueries({ queryKey: [key] })
      button.succeed(onMoved)
    } catch (err) {
      setError(moveError(err, target.name))
      button.fail()
    }
  }

  return (
    <Scrim className="erd-modal-overlay" onClick={busy ? undefined : onClose}>
      <Sheet className="erd-modal-card" role="dialog" aria-modal="true" aria-label="Move to another budget" onClick={(e) => e.stopPropagation()}>
        <div className="erd-modal-head">
          <h3>Move to another budget</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
        </div>

        <div className="erd-log-label">Budget</div>
        <div className="erd-chip-row" role="radiogroup" aria-label="Budget">
          {others.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={to === b.id}
              className={`erd-chip${to === b.id ? ' is-selected' : ''}`}
              onClick={() => { setTo(b.id); setPicked(null); setError('') }}
              disabled={busy}
            >
              <BudgetIcon budget={b} /> {b.name}
            </button>
          ))}
        </div>

        {target && (
          <>
            <div className="erd-log-label">{`Category in ${target.name}`}</div>
            {categoriesQ.isPending ? (
              <p className="account-row-meta" role="status">Loading categories…</p>
            ) : categoriesQ.isError ? (
              <p className="erd-log-error" role="alert">{"Couldn't load its categories. Check your connection and try again."}</p>
            ) : categoriesQ.data.length === 0 ? (
              <p className="account-row-meta">{`${target.name} has no categories yet. Add one there first.`}</p>
            ) : (
              <div className="erd-chip-row" role="radiogroup" aria-label="Category">
                {categoriesQ.data.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    role="radio"
                    aria-checked={chosen === c.name}
                    className={`erd-chip erd-chip--icon${chosen === c.name ? ' is-selected' : ''}`}
                    onClick={() => setPicked(c.name)}
                    disabled={busy}
                  >
                    <span className="erd-chip-icon" aria-hidden="true">
                      <CategoryIcon name={c.name} icon={c.icon} group={c.group} />
                    </span>
                    {splitEmoji(c.name).text}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {error && <p className="erd-log-error" role="alert">{error}</p>}

        <div className="archive-confirm-actions">
          <button type="button" className="account-pill-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <SuccessButton
            type="button"
            className="is-active erd-accent-action"
            saving={button.saving}
            success={button.success}
            savingLabel="Moving…"
            successLabel="Moved"
            disabled={!target || !chosen || busy}
            onClick={() => void submit()}
          >
            {target ? <>Move to <BudgetIcon budget={target} /> {target.name}</> : 'Move'}
          </SuccessButton>
        </div>
      </Sheet>
    </Scrim>
  )
}
