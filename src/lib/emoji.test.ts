import { describe, expect, it } from 'vitest'
import { avatarStyleFor, categoryColor, groupColor, splitEmoji } from './emoji'

describe('splitEmoji', () => {
  it('splits a leading emoji from text', () => {
    expect(splitEmoji('🏠 Rent')).toEqual({ icon: '🏠', text: 'Rent' })
  })

  it('handles a ZWJ sequence emoji (cook)', () => {
    expect(splitEmoji('👨‍🍳 Cook')).toEqual({ icon: '👨‍🍳', text: 'Cook' })
  })

  it('passes through text with no leading emoji', () => {
    expect(splitEmoji('Plain Name')).toEqual({ icon: '', text: 'Plain Name' })
  })

  it('falls back to the full trimmed string when the emoji is the whole value', () => {
    expect(splitEmoji('🏠')).toEqual({ icon: '', text: '🏠' })
  })
})

describe('category and group colours', () => {
  it('wears a picked colour over the name hash, and ignores an unknown one', () => {
    expect(avatarStyleFor('Rent', 'coral')).toEqual({ background: 'var(--coral-soft)', color: 'var(--coral)' })
    expect(categoryColor('Rent', 'red')).toBe(categoryColor('Rent'))
  })

  it('maps the accent key to the gold tint, the hash slot it always had', () => {
    expect(avatarStyleFor('anything', 'accent')).toEqual({ background: 'var(--gold-soft)', color: 'var(--gold-ink)' })
  })

  it('defaults a group to the accent', () => {
    expect(groupColor()).toBe('accent')
    expect(groupColor('mint')).toBe('mint')
    expect(groupColor('#fff')).toBe('accent')
  })
})
