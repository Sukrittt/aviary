'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Scrim, Sheet } from './MotionSheet'
import { ReadOnlyNotice } from './BudgetNotices'
import { useSpaces } from '../hooks/useSpaces'
import { useAddCategory } from '../hooks/useCategories'
import { useAddGroup, useGroupIcons, useGroups } from '../hooks/useGroups'
import { categoryColor, colorStyle, splitEmoji } from '../lib/emoji'
import type { CategoryColor } from '../lib/categoryColors'
import { categoryIconKey, type CategoryIconKey } from '../lib/categoryIcons'
import { CategoryIcon } from './CategoryIcon'
import { CategoryIconPicker, ColorSwatches } from './CategoryIconPicker'
import type { CategoryRow } from '../types'
import { GoalFields, goalOf, type GoalDraft } from './GoalSheet'
import { goalTemplate, type GoalTemplateKey } from '../lib/goal'
import { currentMonthKey } from '../lib/envelope'
import { useCurrency } from '@/src/context/CurrencyContext'

/** The festive pick follows the budget's currency: Diwali for rupees, the year-end holidays elsewhere. */
const goalPicks = (currencyCode: string): { key: GoalTemplateKey | 'custom'; label: string }[] => [
  { key: 'emergency', label: 'Emergency fund' },
  currencyCode === 'INR' ? { key: 'diwali', label: 'Diwali' } : { key: 'holidays', label: 'Holidays' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'custom', label: 'Custom' },
]

/** Where a new goal lands unless you pick a group yourself. Made on first use. */
const GOALS_GROUP = 'Goals'

export function AddCategoryModal({ onClose, onCreated, initialGroup = '' }: {
  onClose: () => void
  onCreated: (category: CategoryRow) => void
  initialGroup?: string
}) {
  const groups = useGroups().data ?? []
  const groupIcons = useGroupIcons()
  const addCategory = useAddCategory()
  const addGroup = useAddGroup()
  const { readOnly } = useSpaces()
  const GOAL_PICKS = goalPicks(useCurrency().currencyCode)
  const [name, setName] = useState('')
  const [group, setGroup] = useState(initialGroup)
  // A group tapped here wins; otherwise a goal goes to Goals, even from another group's add button.
  const [groupPicked, setGroupPicked] = useState(false)
  const groupChips = groups.includes(GOALS_GROUP) || group !== GOALS_GROUP ? groups : [...groups, GOALS_GROUP]
  // Follows the name until the user picks one ("Fuel" gets the pump).
  const [pickedIcon, setPickedIcon] = useState<CategoryIconKey | null>(null)
  const icon = pickedIcon ?? categoryIconKey(name, undefined, group)
  // Same: follows the name's hash until the user picks one.
  const [pickedColor, setPickedColor] = useState<CategoryColor | null>(null)
  const color = categoryColor(splitEmoji(name).text, pickedColor ?? undefined)
  // A savings goal, started from a template or from scratch. Null: no goal.
  const [goalPick, setGoalPick] = useState<GoalTemplateKey | 'custom' | null>(null)
  const [goalDraft, setGoalDraft] = useState<GoalDraft>({ amount: '', by: '', yearly: false })
  const goal = goalPick ? goalOf(goalDraft) : null
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const inputId = useId()
  const previousFocus = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement)

  useEffect(() => {
    const trigger = previousFocus.current
    return () => trigger?.focus()
  }, [])

  function pickGoal(key: GoalTemplateKey | 'custom' | null) {
    setGoalPick(key)
    if (!groupPicked) setGroup(key ? GOALS_GROUP : initialGroup)
    if (!key || key === 'custom') return
    const t = goalTemplate(key, currentMonthKey())
    setGoalDraft((d) => ({ ...d, by: t.by, yearly: t.yearly }))
    // Names the category too, unless you've typed your own.
    if (!name.trim() || GOAL_PICKS.some((p) => p.label === name.trim())) setName(t.name)
  }

  function close() {
    if (!pending.current) onClose()
  }

  async function save() {
    if (!name.trim() || pending.current || (goalPick && !goal)) return
    const created = { name: name.trim(), group, icon, ...(pickedColor ? { color: pickedColor } : {}), ...(goal ? { goal } : {}) }
    pending.current = true
    setSaving(true)
    setError('')
    try {
      if (group && !groups.includes(group)) {
        // Someone else may have just made it; a 409 there is fine.
        await addGroup.mutateAsync({ name: group }).catch((err) => { if (!/already exists/i.test(String(err))) throw err })
      }
      await addCategory.mutateAsync(created)
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error && /already exists/i.test(err.message)
        ? 'That category already exists.' : "That didn't save. Try again.")
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <Scrim className="erd-modal-overlay" onClick={close}>
      <Sheet className="erd-modal-card env-sheet env-sheet--add" role="dialog" aria-modal="true" aria-label="Add category"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}>
        {readOnly ? <ReadOnlyNotice onClose={onClose} /> : <form style={{ display: 'flex', flexDirection: 'column', gap: 'inherit' }} onSubmit={(e) => { e.preventDefault(); void save() }}>
          <div className="env-sheet-title">Add category</div>
          <p className="env-sheet-copy">Categories live inside a group. Pick where this one belongs.</p>
          <label className="env-sheet-section-label" htmlFor={inputId}>Name</label>
          <CategoryIconPicker value={icon} onChange={setPickedIcon} tint={colorStyle(color)} disabled={saving}>
            <input id={inputId} className="env-input" autoFocus placeholder="Groceries, fuel, gym…" value={name}
              disabled={saving} onChange={(e) => setName(e.target.value)} />
          </CategoryIconPicker>
          <ColorSwatches value={color} onChange={setPickedColor} disabled={saving} />
          <p className="env-sheet-section-label">GROUP</p>
          <div className="env-pct-row">
            <button type="button" className={`env-pct${group === '' ? ' is-on' : ''}`} aria-pressed={group === ''}
              disabled={saving} onClick={() => { setGroup(''); setGroupPicked(true) }}>Other</button>
            {groupChips.map((g) => (
              <button type="button" key={g} className={`env-pct${group === g ? ' is-on' : ''}`} aria-pressed={group === g}
                disabled={saving} onClick={() => { setGroup(g); setGroupPicked(true) }}><CategoryIcon kind="group" name={g} icon={groupIcons.get(g)} /> {splitEmoji(g).text}</button>
            ))}
          </div>
          <p className="env-sheet-section-label">SAVING FOR SOMETHING?</p>
          <div className="env-pct-row">
            <button type="button" className={`env-pct${goalPick === null ? ' is-on' : ''}`} aria-pressed={goalPick === null}
              disabled={saving} onClick={() => pickGoal(null)}>No goal</button>
            {GOAL_PICKS.map((p) => (
              <button type="button" key={p.key} className={`env-pct${goalPick === p.key ? ' is-on' : ''}`} aria-pressed={goalPick === p.key}
                disabled={saving} onClick={() => pickGoal(p.key)}>{p.label}</button>
            ))}
          </div>
          {goalPick && <GoalFields compact draft={goalDraft} onChange={setGoalDraft} />}
          {error && <p className="env-sheet-hint" role="alert">{error}</p>}
          <div className="env-sheet-actions">
            <button type="button" className="auth-btn auth-btn--outline" disabled={saving} onClick={close}>Cancel</button>
            <button type="submit" className="auth-btn auth-btn--primary" disabled={saving || !name.trim() || (!!goalPick && !goal)}>
              {saving ? 'Saving…' : 'Add category'}
            </button>
          </div>
        </form>}
      </Sheet>
    </Scrim>
  )
}
