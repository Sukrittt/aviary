import { renderToStaticMarkup } from 'react-dom/server'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CONTENT_SECTIONS } from '@/lib/content'
import { LandingFooter } from '@/src/components/landing/Chrome'
import YnabPage from '@/app/(site)/compare/ynab-alternative-india/page'
import Budget25kPage from '@/app/(site)/tools/budget-for-25000-salary/page'
import { Calculator503020, RentCalculator } from './Calculators'

vi.mock('@/src/lib/analytics', () => ({ track: vi.fn() }))

const ldOf = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]))

describe('content pages', () => {
  it('server-render their body, one h1, breadcrumbs with BreadcrumbList JSON-LD, sources and a CTA', () => {
    const html = renderToStaticMarkup(<YnabPage />)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('Direct import for select US, Canadian, UK and EU banks')
    expect(html).toContain('Checked October 2026')
    expect(html).toContain('https://www.ynab.com/pricing')
    expect(html).toContain('Get it on Android')
    expect(ldOf(html)[0]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://useaviary.com/' },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://useaviary.com/compare' },
        { '@type': 'ListItem', position: 3, name: 'YNAB alternative in India', item: 'https://useaviary.com/compare/ynab-alternative-india' },
      ],
    })
  })

  it('pre-fill salary pages so crawlers see the worked plan', () => {
    const html = renderToStaticMarkup(<Budget25kPage />)
    expect(html).toContain('How to budget a ₹25k salary')
    expect(html).toMatch(/Rent<\/th><td>₹7,500/)
    expect(html).toContain('href="/tools/budget-for-1-lakh-salary"')
  })

  it('have em-dash-free copy', () => {
    expect(renderToStaticMarkup(<YnabPage />)).not.toContain('—')
    expect(renderToStaticMarkup(<Budget25kPage />)).not.toContain('—')
  })

  it('are all linked from the footer', () => {
    const html = renderToStaticMarkup(<LandingFooter />)
    for (const section of Object.values(CONTENT_SECTIONS)) {
      for (const path of [section.path, ...section.pages.map(([p]) => p)]) expect(html).toContain(`href="${path}"`)
    }
  })
})

describe('calculators', () => {
  it('recalculate in rupees with Indian grouping as you type', async () => {
    render(<Calculator503020 />)
    const input = screen.getByLabelText('Monthly take-home pay')
    await userEvent.clear(input)
    await userEvent.type(input, '150000')
    expect(input).toHaveValue('1,50,000')
    expect(screen.getByText('₹1.5 lakh')).toBeInTheDocument()
    expect(screen.getByText('₹75,000')).toBeInTheDocument()
    expect(screen.getByText('₹45,000')).toBeInTheDocument()
    expect(screen.getByText('₹30,000')).toBeInTheDocument()
  })

  it('counts EMIs in the rent you can afford', async () => {
    render(<RentCalculator />)
    await userEvent.type(screen.getByLabelText('EMIs you already pay a month'), '12000')
    expect(screen.getAllByText('₹12,000')).toHaveLength(2)
  })
})
