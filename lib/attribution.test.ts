import { describe, expect, it } from 'vitest'
import { ATTRIBUTION_COOKIE, attributionFromRequest, nextAttribution, parseAttribution, playStoreUrl, readAttribution, sourceOf } from './attribution'

const HOST = 'www.useaviary.com'
const at = (path: string, referer?: string) => attributionFromRequest(new URL(`https://${HOST}${path}`), referer ?? null)

describe('attributionFromRequest', () => {
  it('reads utm tags and the landing path', () => {
    expect(at('/compare/ynab?utm_source=reddit&utm_medium=comment&utm_campaign=r/IndiaInvestments')).toEqual({
      utm_source: 'reddit', utm_medium: 'comment', utm_campaign: 'r/IndiaInvestments', landing_path: '/compare/ynab',
    })
  })

  it('keeps an external referrer as its bare domain and ignores our own', () => {
    expect(at('/', 'https://www.reddit.com/r/foo/comments/1')).toEqual({ referrer_domain: 'reddit.com', landing_path: '/' })
    expect(at('/', `https://${HOST}/pricing`)).toEqual({ landing_path: '/' })
    expect(at('/', 'not a url')).toEqual({ landing_path: '/' })
  })

  it('treats a code-shaped ?ref as a referral code and the old invite link as a share', () => {
    expect(at('/?ref=k7qm4p')).toMatchObject({ referral_code: 'K7QM4P' })
    expect(at('/?ref=invite')).toMatchObject({ utm_source: 'invite', utm_medium: 'share' })
    expect(at('/?ref=<script>')).not.toHaveProperty('referral_code')
  })

  it('drops characters that have no business in a tag and clips long values', () => {
    const a = at(`/?utm_source=${encodeURIComponent('red"dit<>')}&utm_campaign=${'x'.repeat(200)}`)
    expect(a.utm_source).toBe('reddit')
    expect(a.utm_campaign).toHaveLength(64)
  })
})

describe('nextAttribution', () => {
  const tagged = { utm_source: 'instagram', landing_path: '/' }
  const plain = { referrer_domain: 'google.com', landing_path: '/' }

  it('lets a tagged visit replace whatever came before', () => {
    expect(nextAttribution({ utm_source: 'reddit', landing_path: '/a' }, tagged)).toEqual(tagged)
  })

  it('keeps the first untagged touch', () => {
    expect(nextAttribution(tagged, plain)).toBeNull()
    expect(nextAttribution(null, plain)).toEqual(plain)
  })
})

describe('readAttribution', () => {
  const cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify({ utm_source: 'reddit' }))}`

  it('reads the web cookie as a web signup', () => {
    expect(readAttribution(new Request('https://x/api', { headers: { cookie: `a=1; ${cookie}` } }))).toEqual({ utm_source: 'reddit', platform: 'web' })
  })

  it('prefers the app header and marks it android', () => {
    const header = JSON.stringify({ utm_source: 'google-play', utm_medium: 'organic', platform: 'web', junk: 1 })
    expect(readAttribution(new Request('https://x/api', { headers: { cookie, 'x-aviary-attribution': header } }))).toEqual({
      utm_source: 'google-play', utm_medium: 'organic', platform: 'android',
    })
  })

  it('knows a bearer-token request is the app even with nothing to report', () => {
    expect(readAttribution(new Request('https://x/api', { headers: { authorization: 'Bearer t' } }))).toEqual({ platform: 'android' })
    expect(readAttribution(new Request('https://x/api'))).toEqual({ platform: 'web' })
    expect(readAttribution(new Request('https://x/api'), 'android')).toEqual({ platform: 'android' })
  })

  it('survives garbage', () => {
    expect(parseAttribution('{nope')).toEqual({})
    expect(parseAttribution(JSON.stringify(['a']))).toEqual({})
    expect(readAttribution(new Request('https://x/api', { headers: { 'x-aviary-attribution': 'x'.repeat(5000) } }))).toEqual({ platform: 'android' })
  })
})

describe('sourceOf', () => {
  it('falls back from utm to referral to referrer to direct', () => {
    expect(sourceOf({ utm_source: 'reddit', referral_code: 'K7QM4P' })).toBe('reddit')
    expect(sourceOf({ referral_code: 'K7QM4P', referrer_domain: 'x.com' })).toBe('referral')
    expect(sourceOf({ referrer_domain: 'x.com' })).toBe('x.com')
    expect(sourceOf({})).toBe('direct')
  })
})

describe('playStoreUrl', () => {
  it('is the plain listing with nothing to pass on', () => {
    expect(playStoreUrl()).toBe('https://play.google.com/store/apps/details?id=com.sukrit04.envelope')
    expect(playStoreUrl({ landing_path: '/' })).toBe('https://play.google.com/store/apps/details?id=com.sukrit04.envelope')
  })

  it('hands the source to the install referrer', () => {
    const url = new URL(playStoreUrl({ utm_source: 'reddit', utm_campaign: 'r/x', referral_code: 'K7QM4P' }))
    const referrer = new URLSearchParams(url.searchParams.get('referrer') ?? '')
    expect(Object.fromEntries(referrer)).toEqual({ utm_source: 'reddit', utm_campaign: 'r/x', ref: 'K7QM4P' })
  })

  it('names a web-only visit by its referrer so the install is not organic', () => {
    const url = new URL(playStoreUrl({ referrer_domain: 'reddit.com' }))
    expect(new URLSearchParams(url.searchParams.get('referrer') ?? '').get('utm_source')).toBe('reddit.com')
  })
})
