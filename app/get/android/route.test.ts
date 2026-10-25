import { expect, it } from 'vitest'
import { GET } from './route'

const referrerOf = (res: Response) => Object.fromEntries(new URLSearchParams(new URL(res.headers.get('location')!).searchParams.get('referrer') ?? ''))

it('sends an untagged visitor to the plain listing', () => {
  const res = GET(new Request('https://www.useaviary.com/get/android', { headers: { referer: 'https://www.useaviary.com/' } }))
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe('https://play.google.com/store/apps/details?id=com.sukrit04.envelope')
})

it('carries the landing cookie into the install referrer', () => {
  const res = GET(new Request('https://www.useaviary.com/get/android', { headers: { cookie: 'aviary_attr=%7B%22utm_source%22%3A%22reddit%22%2C%22utm_campaign%22%3A%22r%2Fx%22%7D' } }))
  expect(referrerOf(res)).toEqual({ utm_source: 'reddit', utm_campaign: 'r/x' })
})

it('lets a tagged link work without a prior visit', () => {
  expect(referrerOf(GET(new Request('https://www.useaviary.com/get/android?utm_source=instagram&utm_medium=bio')))).toEqual({ utm_source: 'instagram', utm_medium: 'bio' })
})
