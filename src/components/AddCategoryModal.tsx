'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Scrim, Sheet } from './MotionSheet'
import { useAddCategory } from '../hooks/useCategories'
import { useGroupIcons, useGroups } from '../hooks/useGroups'
import { avatarStyleFor, splitEmoji } from '../lib/emoji'
import { categoryIconKey, type CategoryIconKey } from '../lib/categoryIcons'
import { CategoryIcon } from './CategoryIcon'
import { CategoryIconPicker } from './CategoryIconPicker'
import type { CategoryRow } from '../types'

export function AddCategoryModal({ onClose, onCreated, initialGroup = '' }: {
  onClose: () => void
  onCreated: (category: CategoryRow) => void
  initialGroup?: string
}) {
  const groups = useGroups().data ?? []
  const groupIcons = useGroupIcons()
  const addCategory = useAddCategory()
  const [name, setName] = useState('')
  const [group, setGroup] = useState(initialGroup)
  // Follows the name until the user picks one ("Fuel" gets the pump).
  const [pickedIcon, setPickedIcon] = useState<CategoryIconKey | null>(null)
  const icon = pickedIcon ?? categoryIconKey(name, undefined, group)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const inputId = useId()
  const previousFocus = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement)

  useEffect(() => {
    const trigger = previousFocus.current
    return () => trigger?.focus()
  }, [])

  function close() {
    if (!pending.current) onClose()
  }

  async function save() {
    if (!name.trim() || pending.current) return
    const created = { name: name.trim(), group, icon }
    pending.current = true
    setSaving(true)
    setError('')
    try {
      await addCategory.mutateAsync(created)
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error && /already exists/i.test(err.message)
        ? 'That category already exists.' : 'That did not save. Try again.')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <Scrim className="erd-modal-overlay" onClick={close}>
      <Sheet className="erd-modal-card env-sheet" role="dialog" aria-modal="true" aria-label="Add category"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}>
        <form style={{ display: 'flex', flexDirection: 'column', gap: 'inherit' }} onSubmit={(e) => { e.preventDefault(); void save() }}>
          <div className="env-sheet-title">Add category</div>
          <p className="env-sheet-copy">Categories live inside a group. Pick where this one belongs.</p>
          <label className="env-sheet-section-label" htmlFor={inputId}>Name</label>
          <CategoryIconPicker value={icon} onChange={setPickedIcon} tint={avatarStyleFor(splitEmoji(name).text)} disabled={saving}>
            <input id={inputId} className="env-input" autoFocus placeholder="Groceries, fuel, gym…" value={name}
              disabled={saving} onChange={(e) => setName(e.target.value)} />
          </CategoryIconPicker>
          <p className="env-sheet-section-label">GROUP</p>
          <div className="env-pct-row">
            <button type="button" className={`env-pct${group === '' ? ' is-on' : ''}`} aria-pressed={group === ''}
              disabled={saving} onClick={() => setGroup('')}>Other</button>
            {groups.map((g) => (
              <button type="button" key={g} className={`env-pct${group === g ? ' is-on' : ''}`} aria-pressed={group === g}
                disabled={saving} onClick={() => setGroup(g)}><CategoryIcon kind="group" name={g} icon={groupIcons.get(g)} /> {splitEmoji(g).text}</button>
            ))}
          </div>
          {error && <p className="env-sheet-hint" role="alert">{error}</p>}
          <div className="env-sheet-actions">
            <button type="button" className="auth-btn auth-btn--outline" disabled={saving} onClick={close}>Cancel</button>
            <button type="submit" className="auth-btn auth-btn--primary" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Add category'}
            </button>
          </div>
        </form>
      </Sheet>
    </Scrim>
  )
}
