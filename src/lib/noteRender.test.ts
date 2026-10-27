import { describe, expect, it } from 'vitest'
import { addTodo, checklistCount, dayLabel, firstLine, goalFit, noteAmounts, parseNote, toggleLine, type Segment } from './noteRender'

const TODAY = '2026-10-28'
const kinds = (segments: Segment[]) => segments.filter((s) => s.kind !== 'text').map((s) => [s.kind, s.text])

describe('checklists', () => {
  const note = 'Diwali\n- buy gifts\n[x] book train\n  [ ] sweets'

  it('reads "- ", "[ ]" and "[x]" lines as items', () => {
    const lines = parseNote(note, TODAY)
    expect(lines.map((l) => l.check)).toEqual([undefined, false, true, false])
    expect(lines[1].segments).toEqual([{ kind: 'text', text: 'buy gifts' }])
    expect(lines[3].segments).toEqual([{ kind: 'text', text: 'sweets' }])
    expect(checklistCount(note)).toEqual({ done: 1, total: 3 })
    expect(checklistCount('no list here')).toEqual({ done: 0, total: 0 })
  })

  it('ticks and unticks a line, leaving the rest alone', () => {
    const ticked = toggleLine(note, 1)
    expect(ticked).toBe('Diwali\n[x] buy gifts\n[x] book train\n  [ ] sweets')
    expect(toggleLine(ticked, 1)).toBe('Diwali\n[ ] buy gifts\n[x] book train\n  [ ] sweets')
    expect(toggleLine(note, 2)).toBe('Diwali\n- buy gifts\n[ ] book train\n  [ ] sweets')
    expect(toggleLine(note, 3)).toBe('Diwali\n- buy gifts\n[x] book train\n  [x] sweets')
    expect(toggleLine(note, 0)).toBe(note)
  })

  it('takes a capital X and a "- [x]" bullet', () => {
    expect(parseNote('[X] done\n- [x] also\n- [ ] not', TODAY).map((l) => l.check)).toEqual([true, true, false])
    expect(toggleLine('- [x] also', 0)).toBe('[ ] also')
  })
})

describe('highlights', () => {
  it('finds dates in three shapes, with how far away they are', () => {
    const [line] = parseNote('due 15 Nov, then 15/11, renew 2027-03-01, paid 1 Oct', TODAY)
    expect(line.segments.filter((s) => s.kind === 'date').map((s) => [s.text, s.kind === 'date' && s.days])).toEqual([
      ['15 Nov', 18], ['15/11', 18], ['2027-03-01', 124], ['1 Oct', -27],
    ])
  })

  it('takes a yearless date as its nearest one, so January is next year', () => {
    const [line] = parseNote('5 Jan', TODAY)
    expect(line.segments[0]).toMatchObject({ kind: 'date', days: 69 })
  })

  it("doesn't borrow the next date's year", () => {
    const [line] = parseNote('missed 1 Oct, 2027-03-01', TODAY)
    expect(line.segments.filter((s) => s.kind === 'date').map((s) => s.text)).toEqual(['1 Oct', '2027-03-01'])
  })

  it('skips things that only look like dates', () => {
    expect(kinds(parseNote('31/02 and 2026-13-01 and 40 Nov', TODAY)[0].segments).filter(([k]) => k === 'date')).toEqual([])
  })

  it('says how far a day is', () => {
    expect([0, 1, -1, 18, -27].map(dayLabel)).toEqual(['today', 'tomorrow', 'yesterday', 'in 18 days', '27 days ago'])
  })

  it('finds amounts with a symbol, commas or a k', () => {
    expect(noteAmounts('₹5,000 and 5000 and 20k and Rs. 1.5L and $12.50', TODAY)).toEqual([5000, 5000, 20000, 150000, 12.5])
    // A lone digit or two is a count, not money.
    expect(noteAmounts('2 tickets, 15 people', TODAY)).toEqual([])
  })

  it('links URLs and phone numbers', () => {
    const [line] = parseNote('pay at https://bescom.in/pay. or call +91 98765 43210', TODAY)
    expect(line.segments.filter((s) => s.kind === 'url' || s.kind === 'phone')).toEqual([
      { kind: 'url', text: 'https://bescom.in/pay', href: 'https://bescom.in/pay' },
      { kind: 'phone', text: '+91 98765 43210', href: 'tel:+919876543210' },
    ])
    expect(parseNote('www.lic.in', TODAY)[0].segments[0]).toEqual({ kind: 'url', text: 'www.lic.in', href: 'https://www.lic.in' })
  })

  it('keeps every character, so the read view says what the note says', () => {
    const text = 'call 1800-425-3800 by 15 Nov <script>alert(1)</script> ✅ 🪔 ₹5,000'
    expect(parseNote(text, TODAY)[0].segments.map((s) => s.text).join('')).toBe(text)
  })
})

describe('goal fit', () => {
  it('needs two amounts to add up', () => {
    expect(goalFit('gifts 20k', 60000, TODAY)).toBeNull()
  })
  it('matches, falls short of, or goes over the goal', () => {
    expect(goalFit('gifts 20k, sweets 5k, travel 35k', 60000, TODAY)).toEqual({ sum: 60000, diff: 0 })
    expect(goalFit('gifts 20k, sweets 5k, travel 30k', 60000, TODAY)).toEqual({ sum: 55000, diff: -5000 })
    expect(goalFit('gifts 20k, sweets 10k, travel 35k', 60000, TODAY)).toEqual({ sum: 65000, diff: 5000 })
  })
})

it('shows the first line that has words', () => {
  expect(firstLine('\n  Policy 88231 \nrenew')).toBe('Policy 88231')
})

describe('addTodo', () => {
  // `|` marks the caret: where it is before, and where it lands after.
  const run = (marked: string) => {
    const at = marked.indexOf('|')
    const next = addTodo(marked.replace('|', ''), at)
    return next && next.text.slice(0, next.caret) + '|' + next.text.slice(next.caret)
  }

  it('starts an empty note or an empty line as a to-do', () => {
    expect(run('|')).toBe('- |')
    expect(run('Diwali\n|')).toBe('Diwali\n- |')
  })
  it('turns a line of words into a to-do, keeping the caret on its words', () => {
    expect(run('Diwali\nbuy di|yas')).toBe('Diwali\n- buy di|yas')
  })
  it('adds the next to-do under one that is already there', () => {
    expect(run('- buy diyas|\nafter')).toBe('- buy diyas\n- |\nafter')
    expect(run('[x] bo|ok train')).toBe('[x] book train\n- |')
  })
  it('does nothing past the cap', () => {
    expect(addTodo('a'.repeat(1999), 1999, 2000)).toBeNull()
    expect(addTodo('a'.repeat(1998), 1998, 2000)?.text).toBe('- ' + 'a'.repeat(1998))
  })
})
