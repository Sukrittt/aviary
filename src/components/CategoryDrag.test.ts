import { describe, expect, it } from 'vitest'
import { dropSlot, type DropCard } from './CategoryDrag'

const cards: DropCard[] = [
  { group: 'Home', bottom: 200, rowMids: [100, 150], count: 2 },
  { group: 'Food', bottom: 400, rowMids: [300, 350], count: 2 },
  { group: 'Fun', bottom: 460, rowMids: null, count: 3 },
  { group: '', bottom: 600, rowMids: [], count: 0 },
]

describe('dropSlot', () => {
  it('counts the rows above the pointer', () => {
    expect(dropSlot(90, cards)).toEqual({ group: 'Home', index: 0, collapsed: false })
    expect(dropSlot(120, cards)).toEqual({ group: 'Home', index: 1, collapsed: false })
    expect(dropSlot(190, cards)).toEqual({ group: 'Home', index: 2, collapsed: false })
    expect(dropSlot(320, cards)).toEqual({ group: 'Food', index: 1, collapsed: false })
  })

  it('appends to a collapsed group', () => {
    expect(dropSlot(430, cards)).toEqual({ group: 'Fun', index: 3, collapsed: true })
  })

  it('takes an empty group, and the ungrouped bucket by its empty name', () => {
    expect(dropSlot(500, cards)).toEqual({ group: '', index: 0, collapsed: false })
  })

  it('gives a pointer past the last card to the last group', () => {
    expect(dropSlot(9000, cards)).toEqual({ group: '', index: 0, collapsed: false })
  })

  it('has no answer without groups', () => {
    expect(dropSlot(10, [])).toBeNull()
  })
})
