import { describe, it, expect } from 'vitest'
import { CATEGORY_CHART_COLORS, categoryChartColor } from './chartColors'

describe('categoryChartColor', () => {
  const order = ['Rent', 'Groceries', 'Fuel', 'Investments', 'Dining out', 'Emergency fund', 'Travel', 'Football', 'Gifts']

  it('gives each of the first eight categories its own slot, by list position', () => {
    const colors = order.slice(0, 8).map((name) => categoryChartColor(name, order))
    expect(colors).toEqual([...CATEGORY_CHART_COLORS])
  })

  it('wraps back to the first slot past eight', () => {
    expect(categoryChartColor('Gifts', order)).toBe(CATEGORY_CHART_COLORS[0])
  })

  it('still picks a palette colour for a key missing from the list', () => {
    const color = categoryChartColor('Other', order)
    expect(CATEGORY_CHART_COLORS).toContain(color)
    expect(categoryChartColor('Other', order)).toBe(color)
  })
})
