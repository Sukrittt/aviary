import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlanPrices } from '@/lib/billing/razorpay'
import Home from './page'
import Intl from './intl/page'

vi.mock('@/lib/billing/razorpay', () => ({ getPlanPrices: vi.fn() }))
let country: string | null = null
vi.mock('next/headers', () => ({ headers: async () => new Headers(country ? { 'x-vercel-ip-country': country } : {}) }))

// Static markup: the landing page's client effects (IntersectionObserver etc.) don't matter here.
const html = async (page = Home) => renderToStaticMarkup(await page()).replace(/<!-- -->/g, '')

beforeEach(() => {
  vi.mocked(getPlanPrices).mockReset()
  country = null
})

describe('landing hero note', () => {
  it('shows the post-trial monthly price in the hero and closing CTA', async () => {
    vi.mocked(getPlanPrices).mockResolvedValue([
      { period: 'monthly', amount: 19900, currency: 'INR' },
      { period: 'yearly', amount: 199900, currency: 'INR' },
    ])
    expect((await html()).match(/Free for 30 days · Then ₹199\/month/g)).toHaveLength(2)
  })

  it('shows the USD price on /intl', async () => {
    expect((await html(Intl)).match(/Free for 30 days · Then \$4\.99\/month/g)).toHaveLength(2)
  })

  it('leaves the price out when Razorpay is unreachable', async () => {
    vi.mocked(getPlanPrices).mockRejectedValue(new Error('down'))
    const out = await html()
    expect(out).not.toContain('/month')
    expect(out.match(/Free for 30 days · No card needed/g)).toHaveLength(2)
  })
})

describe('landing sample data', () => {
  it('keeps rupees, chai and UPI for India', async () => {
    vi.mocked(getPlanPrices).mockResolvedValue([])
    const out = await html()
    expect(out).toContain('4pm chai')
    expect(out).toContain('Log ₹850')
    expect(out).toContain('UPI/DR/6021843/SWIGGY')
    expect(out).toContain('src="/landing/clip-log.mp4"')
    expect(out).not.toContain('/landing/intl/')
  })

  it('shows dollars and examples that read anywhere on /intl', async () => {
    const out = await html(Intl)
    expect(out).toContain('4pm coffee')
    expect(out).toContain('Log $64')
    expect(out).toContain('Cab home · $18')
    expect(out).toContain('SQ *BLUE BOTTLE COFFEE SF')
    expect(out).toContain('every dollar')
    expect(out).toContain('src="/landing/intl/clip-log.mp4"')
    expect(out).toContain('Added $50 for Movie Tickets')
    expect(out).toContain('Coffee with Sam · Eating out · $6')
    expect(out).toContain('intl%2Fwrapped-persona.png')
    expect(out).not.toMatch(/chai|UPI\/DR|NACH|metro card|every rupee in/i)
  })
})

describe('one URL per market', () => {
  // Googlebot crawls from the US: / has to stay the India page whatever the geo header says.
  it('keeps / on the India page for visitors outside India, with a link to /intl', async () => {
    country = 'US'
    vi.mocked(getPlanPrices).mockResolvedValue([{ period: 'monthly', amount: 19900, currency: 'INR' }])
    const out = await html()
    expect(out).toContain('4pm chai')
    expect(out).toContain('Then ₹199/month')
    expect(out).toContain('href="/intl"')
  })

  it('keeps /intl international for visitors in India, with a link back to /', async () => {
    country = 'IN'
    const out = await html(Intl)
    expect(out).toContain('4pm coffee')
    expect(out).toContain('Then $4.99/month')
    expect(out).toMatch(/href="\/"[^>]*>See the India page/)
  })

  it('puts real prices, the organization and the FAQ in JSON-LD', async () => {
    vi.mocked(getPlanPrices).mockResolvedValue([
      { period: 'monthly', amount: 19900, currency: 'INR' },
      { period: 'yearly', amount: 199900, currency: 'INR' },
    ])
    const out = await html()
    const graph = JSON.parse(out.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1])['@graph']
    const app = graph.find((n: { '@type': string }) => n['@type'] === 'SoftwareApplication')
    expect(app.offers).toEqual([
      expect.objectContaining({ price: '199', priceCurrency: 'INR' }),
      expect.objectContaining({ price: '1999', priceCurrency: 'INR' }),
    ])
    expect(app).not.toHaveProperty('aggregateRating')
    expect(graph.find((n: { '@type': string }) => n['@type'] === 'Organization').sameAs).toContain('https://play.google.com/store/apps/details?id=com.sukrit04.envelope')
    const faq = graph.find((n: { '@type': string }) => n['@type'] === 'FAQPage')
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(6)
    // Every structured answer is also on the page, so crawlers can match them.
    for (const { acceptedAnswer } of faq.mainEntity) expect(out).toContain(acceptedAnswer.text.slice(0, 40))
  })
})
