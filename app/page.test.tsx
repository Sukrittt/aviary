import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlanPrices } from '@/lib/billing/razorpay'
import Home from './page'

vi.mock('@/lib/billing/razorpay', () => ({ getPlanPrices: vi.fn() }))

// Static markup: the landing page's client effects (IntersectionObserver etc.) don't matter here.
const html = async () => renderToStaticMarkup(await Home()).replace(/<!-- -->/g, '')

beforeEach(() => {
  vi.mocked(getPlanPrices).mockReset()
})

describe('landing hero note', () => {
  it('shows the post-trial monthly price in the hero and closing CTA', async () => {
    vi.mocked(getPlanPrices).mockResolvedValue([
      { period: 'monthly', amount: 19900, currency: 'INR' },
      { period: 'yearly', amount: 199900, currency: 'INR' },
    ])
    expect((await html()).match(/Free for 45 days · Then ₹199\/month/g)).toHaveLength(2)
  })

  it('leaves the price out when Razorpay is unreachable', async () => {
    vi.mocked(getPlanPrices).mockRejectedValue(new Error('down'))
    const out = await html()
    expect(out).not.toContain('/month')
    expect(out.match(/Free for 45 days · No card needed/g)).toHaveLength(2)
  })
})
