import { describe, expect, it } from 'vitest'
import { brandColor, presetsFor, suggestPresets } from './subscriptionPresets'

describe('presetsFor', () => {
  it('mixes global services with the currency region', () => {
    const inr = presetsFor('INR').map((p) => p.name)
    const usd = presetsFor('USD').map((p) => p.name)
    expect(inr).toEqual(expect.arrayContaining(['Netflix', 'Spotify', 'JioHotstar', 'Swiggy One']))
    expect(inr).not.toContain('Hulu')
    expect(usd).toEqual(expect.arrayContaining(['Netflix', 'Hulu', 'Peacock']))
    expect(usd).not.toContain('JioHotstar')
  })

  it('falls back to global services for an unlisted currency', () => {
    const names = presetsFor('THB').map((p) => p.name)
    expect(names).toContain('Netflix')
    expect(names).not.toContain('Hulu')
    expect(names).not.toContain('JioHotstar')
  })
})

describe('suggestPresets', () => {
  it('ranks prefix matches before substring matches', () => {
    const pe = suggestPresets('USD', 'pe')
    expect(pe.slice(0, 3)).toEqual(['Peacock', 'Perplexity Pro', 'Peloton'])
    expect(pe).toContain('Duolingo Super')
    expect(suggestPresets('INR', 'you')).toEqual(['YouTube Premium', 'YouTube Music'])
  })

  it('drops only the preset the name already matches exactly', () => {
    expect(suggestPresets('INR', 'Netflix')).toEqual([])
    expect(suggestPresets('INR', 'Jio')).toEqual(['JioHotstar', 'JioSaavn'])
  })

  it('keeps longer names when the typed text is itself a preset', () => {
    expect(suggestPresets('INR', 'jio')).toEqual(['Jio', 'JioHotstar', 'JioSaavn'])
  })

  it('leads with popular services when nothing is typed', () => {
    expect(suggestPresets('INR', '').slice(0, 5)).toEqual(['Netflix', 'Amazon Prime', 'YouTube Premium', 'Disney+', 'JioHotstar'])
    expect(suggestPresets('USD', '')).toEqual(expect.arrayContaining(['Hulu', 'Spotify']))
  })

  it('caps the list', () => {
    expect(suggestPresets('USD', '', 5)).toHaveLength(5)
  })
})

describe('brandColor', () => {
  it('prefers the longest matching key', () => {
    expect(brandColor('Apple Music')?.solid).toBe('#FA2D48')
    expect(brandColor('YouTube')?.solid).toBe('#FF0000')
  })

  it('matches whole words only', () => {
    expect(brandColor('Movies club')).toBeNull()
    expect(brandColor('Snowflake')).toBeNull()
    expect(brandColor('Vi postpaid')?.solid).toBe('#EE1C25')
  })

  it('derives a translucent soft tone', () => {
    expect(brandColor('Netflix')?.soft).toBe('rgba(229, 9, 20, 0.22)')
  })
})
