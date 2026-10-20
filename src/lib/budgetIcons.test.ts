import { describe, expect, it } from 'vitest'
import { BUDGET_ICON_KEYS, budgetEmoji, budgetIconKey } from './budgetIcons'
import { isCategoryIconKey } from './categoryIcons'

describe('budget icons', () => {
  it('uses the picked icon, else the emoji a budget from before icons has', () => {
    expect(budgetIconKey({ icon: 'Car', emoji: '🏠' })).toBe('Car')
    expect(budgetIconKey({ emoji: '🏠' })).toBe('House')
    expect(budgetIconKey({ emoji: '🐦' })).toBe('Bird')
    expect(budgetIconKey({ emoji: '✈️' })).toBe('Airplane')
    expect(budgetIconKey({ icon: 'Nope' })).toBe('Wallet')
  })

  it('only offers icons the catalog can draw, each with an emoji for older apps', () => {
    for (const key of BUDGET_ICON_KEYS) {
      expect(isCategoryIconKey(key)).toBe(true)
      expect(budgetEmoji(key)).not.toBe('')
    }
    expect(budgetEmoji('Bird')).toBe('🐦')
  })
})
