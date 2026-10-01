'use client'

import { useMemo, useState } from 'react'
import { useCategories } from '../hooks/useCategories'
import { useRecentExpenses } from '../hooks/useExpenses'
import { useRecentCategories } from '../hooks/useRecentCategories'
import { deriveRecentsFromExpenses } from '../lib/recentCategories'
import { categoryEmoji, splitEmoji } from '../lib/emoji'
import { EMPTY } from '../lib/constants'
import type { CategoryRow, ExpenseRow } from '../types'

/** Above this many categories the search box earns its place; below it, skip it. */
const SEARCH_MIN_CATEGORIES = 12

interface Props {
  value: string
  onChange: (category: string) => void
}

/** Plain category name (leading emoji stripped, lowercased) — the dedupe + match key. */
const plainKey = (name: string) => splitEmoji(name).text.toLowerCase()

/**
 * Flatten groups into one de-duplicated list, then rank it: device MRU list
 * first (seeded from expense history before that exists), the rest by most
 * recently spent on, then alphabetically. Twin of Mobile's CategoryPickerSheet
 * ordering, but without group headers or a separate recents rail — the likely
 * choice is simply at the front of the wrap.
 */
function rankCategories(
  categories: CategoryRow[],
  expenses: ExpenseRow[],
  deviceRecents: string[],
): CategoryRow[] {
  const byKey = new Map<string, CategoryRow>()
  for (const c of categories) {
    const key = plainKey(c.name)
    if (!byKey.has(key)) byKey.set(key, c)
  }
  const flat = [...byKey.values()]

  const lastUsed = new Map<string, string>()
  for (const row of expenses) {
    const key = plainKey(row.category)
    const marker = row.timestamp || row.date
    const prev = lastUsed.get(key)
    if (marker && (!prev || marker > prev)) lastUsed.set(key, marker)
  }

  // The device's own MRU once it has one; expense history seeds it before that.
  const recentsList = deviceRecents.length > 0 ? deviceRecents : deriveRecentsFromExpenses(expenses, categories)
  const ordered: CategoryRow[] = []
  const used = new Set<string>()
  for (const name of recentsList) {
    const key = plainKey(name)
    const row = byKey.get(key)
    if (row && !used.has(key)) {
      ordered.push(row)
      used.add(key)
    }
  }

  const rest = flat
    .filter((c) => !used.has(plainKey(c.name)))
    .sort((a, b) => {
      const la = lastUsed.get(plainKey(a.name))
      const lb = lastUsed.get(plainKey(b.name))
      if (la && lb) return lb.localeCompare(la)
      if (la) return -1
      if (lb) return 1
      return splitEmoji(a.name).text.localeCompare(splitEmoji(b.name).text)
    })
  return [...ordered, ...rest]
}

/**
 * Flat category picker — one wrap of de-duplicated, MRU-sorted chips, each with
 * a single clear emoji. Self-contained (fetches categories/expenses/recents
 * itself) so any modal can drop it in without threading data through props.
 * Twin of Mobile's CategoryPickerSheet, flattened to match the log-expense
 * redesign (no group headers, no recents rail).
 */
export function CategoryPicker({ value, onChange }: Props) {
  const categoriesQ = useCategories()
  const expensesQ = useRecentExpenses()
  const { recents, record } = useRecentCategories()
  const [search, setSearch] = useState('')

  const ranked = useMemo(
    () => rankCategories(categoriesQ.data ?? EMPTY, expensesQ.data ?? EMPTY, recents),
    [categoriesQ.data, expensesQ.data, recents],
  )

  const q = search.trim().toLowerCase()
  const shown = q
    ? ranked.filter((c) => splitEmoji(c.name).text.toLowerCase().includes(q))
    : ranked
  const valueKey = plainKey(value)
  const hasResults = shown.length > 0
  const showSearch = ranked.length >= SEARCH_MIN_CATEGORIES

  function pick(category: string) {
    onChange(category)
    if (category) record(category)
  }

  return (
    <div className="category-picker category-picker--flat">
      {showSearch && (
        <input
          type="search"
          className="erd-search-input category-picker-search"
          placeholder="Search categories…"
          aria-label="Search categories"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="erd-chip-row">
        {shown.map((c) => {
          const name = c.name
          const text = splitEmoji(name).text
          const icon = categoryEmoji(name, c.group)
          const selected = valueKey !== '' && valueKey === plainKey(name)
          return (
            <button
              key={name}
              type="button"
              className={`erd-chip erd-chip--icon${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
              onClick={() => pick(name)}
            >
              {icon && (
                <span className="erd-chip-icon" aria-hidden="true">
                  {icon}
                </span>
              )}
              {text}
            </button>
          )
        })}
      </div>
      {q && !hasResults && <p className="category-picker-empty">No categories found</p>}
    </div>
  )
}