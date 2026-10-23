import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CONTENT_SECTIONS } from '@/lib/content'
import { LandingFooter } from '@/src/components/landing/Chrome'
import YnabPage from '@/app/(site)/compare/ynab-alternative-india/page'
import YnabGlobalPage from '@/app/(site)/compare/ynab-alternative/page'
import SpreadsheetPage from '@/app/(site)/compare/budget-spreadsheet/page'
import Budget15kPage from '@/app/(site)/tools/budget-for-15000-salary/page'
import Budget25kPage from '@/app/(site)/tools/budget-for-25000-salary/page'
import Budget30kPage from '@/app/(site)/tools/budget-for-30000-salary/page'
import Budget50kPage from '@/app/(site)/tools/budget-for-50000-salary/page'
import Budget80kPage from '@/app/(site)/tools/budget-for-80000-salary/page'
import SinkingFundPage from '@/app/(site)/tools/sinking-fund-calculator/page'
import { Calculator503020, RentCalculator, SalaryPlanner, SinkingFundCalculator } from './Calculators'

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
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.useaviary.com/' },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://www.useaviary.com/compare' },
        { '@type': 'ListItem', position: 3, name: 'YNAB alternative in India', item: 'https://www.useaviary.com/compare/ynab-alternative-india' },
      ],
    })
  })

  it('give the global YNAB page dollar prices, the YNAB import steps and a link to the India page', () => {
    const html = renderToStaticMarkup(<YnabGlobalPage />)
    expect(html).toContain('$14.99 a month or $109 a year')
    expect(html).toContain('Export plan')
    expect(html).toContain('href="/sign-in"')
    expect(html).toContain('href="/compare/ynab-alternative-india"')
    expect(html.split('lp-related')[0]).not.toMatch(/₹|UPI|rupee/i)
    expect(renderToStaticMarkup(<YnabPage />)).toContain('href="/compare/ynab-alternative"')
  })

  it('pre-fill salary pages so crawlers see the worked plan', () => {
    const html = renderToStaticMarkup(<Budget25kPage />)
    expect(html).toContain('How to budget a ₹25k salary')
    expect(html).toMatch(/Rent<\/th><td>₹7,500/)
    expect(html).toContain('href="/tools/budget-for-1-lakh-salary"')
  })

  it('show salary FAQs word for word in FAQPage JSON-LD', () => {
    const html = renderToStaticMarkup(<Budget15kPage />)
    const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(([, json]) => JSON.parse(json))
    const faq = ld.find((d) => d['@type'] === 'FAQPage')
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(3)
    for (const { name, acceptedAnswer } of faq.mainEntity) {
      expect(html).toContain(`<h3>${name}</h3>`)
      expect(html).toContain(`<p>${acceptedAnswer.text}</p>`)
    }
    expect(html.match(/<h1/g)).toHaveLength(1)
  })

  it('have em-dash-free copy', () => {
    for (const Page of [YnabPage, YnabGlobalPage, SpreadsheetPage, Budget15kPage, Budget25kPage, Budget30kPage, Budget50kPage, Budget80kPage, SinkingFundPage]) expect(renderToStaticMarkup(<Page />)).not.toContain('—')
  })

  it('link a spreadsheet template whose envelopes add up to the ₹45,000 salary', () => {
    expect(renderToStaticMarkup(<SpreadsheetPage />)).toContain('href="/templates/aviary-envelope-budget-template.csv"')
    const rows = readFileSync('public/templates/aviary-envelope-budget-template.csv', 'utf8').trim().split('\n').slice(1, -1).map((r) => r.split(','))
    expect(rows).toHaveLength(11)
    expect(rows.reduce((sum, r) => sum + Number(r[1]), 0)).toBe(45000)
    rows.forEach((r, i) => expect(r[3]).toBe(`=B${i + 2}-C${i + 2}`))
  })

  it('are all linked from the footer', () => {
    const html = renderToStaticMarkup(<LandingFooter />)
    for (const section of Object.values(CONTENT_SECTIONS)) {
      for (const path of [section.path, ...section.pages.map(([p]) => p)]) expect(html).toContain(`href="${path}"`)
    }
  })
})

describe('calculators', () => {
  it('total a monthly set-aside for yearly costs, and update as you edit or remove one', async () => {
    render(<SinkingFundCalculator />)
    expect(screen.getByText('₹6,300')).toBeInTheDocument()
    const diwali = screen.getByLabelText('Months until Diwali is due')
    await userEvent.clear(diwali)
    await userEvent.type(diwali, '1')
    expect(screen.getByRole('row', { name: /Diwali/ })).toHaveTextContent('₹15,000')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Diwali' }))
    expect(screen.getByText('₹4,400')).toBeInTheDocument()
  })

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

  it('treats a rent of 0 as no rent, not as "use 30%"', async () => {
    render(<SalaryPlanner initial={40000} />)
    const rent = screen.getByLabelText('Your rent (leave empty to use 30%)')
    expect(screen.getByRole('row', { name: /Rent/ })).toHaveTextContent('₹12,000')
    await userEvent.type(rent, '0')
    expect(rent).toHaveValue('0')
    expect(screen.getByRole('row', { name: /Rent/ })).toHaveTextContent('₹0')
    expect(screen.getByRole('row', { name: /Emergency fund/ })).toHaveTextContent('₹10,000')
    await userEvent.clear(rent)
    expect(screen.getByRole('row', { name: /Rent/ })).toHaveTextContent('₹12,000')
  })
})
