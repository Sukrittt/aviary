import { describe, it, expect, vi } from 'vitest'

const generateJSON = vi.fn()
vi.mock('./gemini', () => ({ generateJSON: (...args: unknown[]) => generateJSON(...args) }))

import { cleanCopy, writeNudgeCopy } from './nudgeCopy'

describe('cleanCopy', () => {
  it('swaps dashes and three dots for the app glyphs', () => {
    expect(cleanCopy({ title: 'Football night?', bodies: ['Game on — log it now...'] })).toEqual({
      title: 'Football night?',
      bodies: ['Game on, log it now…'],
    })
  })

  it('drops lines that run long and caps at 4', () => {
    const bodies = ['a', 'x'.repeat(91), 'b', 'c', 'd', 'e']
    expect(cleanCopy({ title: 'Hi?', bodies })?.bodies).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops lines that mention money or use emoji', () => {
    expect(cleanCopy({ title: 'Snack time?', bodies: ['Log your $5 treat', 'Log your ₹200 run', 'Cookie break 🍪', '3 coffees today?', 'Log it while it’s fresh.'] })?.bodies)
      .toEqual(['Log it while it’s fresh.'])
    expect(cleanCopy({ title: 'Snack time? 🍪', bodies: ['ok'] })).toBeNull()
  })

  it('keeps digits that are part of the habit name', () => {
    expect(cleanCopy({ title: '5K run time?', bodies: ['Lace up for your 5k run, then log it.', 'Log your $5 snack'] }, '5K Run')).toEqual({
      title: '5K run time?',
      bodies: ['Lace up for your 5k run, then log it.'],
    })
  })

  it('gives up without a usable title or body', () => {
    expect(cleanCopy({ title: 'x'.repeat(41), bodies: ['ok'] })).toBeNull()
    expect(cleanCopy({ title: 'Hi?', bodies: [] })).toBeNull()
    expect(cleanCopy({ title: 3, bodies: 'nope' })).toBeNull()
  })
})

describe('writeNudgeCopy', () => {
  it('describes the habit without the amount and logs usage as nudge', async () => {
    generateJSON.mockResolvedValueOnce({ title: 'Football night?', bodies: ['Log it while it’s fresh.'] })
    const copy = await writeNudgeCopy({ item: 'Football', category: 'Fun', weekdays: [1, 3, 5], minute: 19 * 60 }, 'u1')
    expect(copy).toEqual({ title: 'Football night?', bodies: ['Log it while it’s fresh.'] })
    const [prompt, , caller] = generateJSON.mock.calls[0]
    expect(prompt).toContain('when: Monday, Wednesday, Friday, usually in the evening')
    expect(caller).toEqual({ userId: 'u1', feature: 'nudge' })
  })
})
