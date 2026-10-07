import { describe, expect, it } from 'vitest'
import { transactionalTemplate } from './transactionalTemplate'

const base = { subject: 'Hello', paragraphs: ['One.'], cta: 'Go', url: 'https://useaviary.com/', reason: 'Because.' }

describe('transactionalTemplate', () => {
  it('paints the *starred* word accent and keeps the title text intact', () => {
    const { html } = transactionalTemplate({ ...base, title: 'Payment *received*' })
    const h1 = new DOMParser().parseFromString(html, 'text/html').querySelector('h1')
    expect(h1?.textContent).toBe('Payment received')
    expect(h1?.querySelector('span')?.textContent).toBe('received')
  })
  it('renders kicker, details and the secondary link in both html and text, escaped', () => {
    const { html, text } = transactionalTemplate({ ...base, kicker: 'Receipt', details: [['Paid via', '<Play>']], secondary: { label: 'Web', url: 'https://useaviary.com/account' } })
    expect(html).toContain('Receipt')
    expect(html).toContain('&lt;Play&gt;')
    expect(text).toContain('Paid via: <Play>')
    expect(text).toContain('Web: https://useaviary.com/account')
  })
})
