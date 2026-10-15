import { describe, expect, it } from 'vitest'
import { splitEmoji } from './emoji'

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
