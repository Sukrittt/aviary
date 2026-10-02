import { describe, expect, it } from 'vitest'
import { welcomeTemplate } from './welcomeTemplate'

describe('welcomeTemplate', () => {
  it('uses account-related copy without remote fonts', () => {
    const email = welcomeTemplate('Alex')
    expect(email.subject).toBe('Welcome to Aviary')
    expect(email.text).toContain('Thanks for signing up. Your Aviary account is ready.')
    expect(email.html).not.toContain('@import')
  })
  it('escapes the recipient’s name and never treats it as HTML', () => {
    const { html, text } = welcomeTemplate('<img/src=x/onerror=alert(1)>')
    expect(html).toContain('&lt;img/src=x/onerror=alert(1)&gt;')
    expect(html).not.toContain('<img/src=x')
    expect(text).toContain('Hi <img/src=x/onerror=alert(1)>,')
  })

  it.each([null, '', '   '])('has a natural greeting without a name (%s)', name => {
    expect(welcomeTemplate(name).html).toContain('Hi there,')
  })

  it('includes a working CTA, support link and plain-text equivalent', () => {
    const { html, text } = welcomeTemplate('Alex Smith')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelector('h1')?.textContent).toBe('Welcome to Aviary')
    expect([...doc.querySelectorAll('a')].find(a => a.textContent?.includes('Open Aviary'))?.href).toBe('https://useaviary.com/')
    expect(doc.querySelector('a[href^="mailto:"]')).not.toBeNull()
    expect(doc.querySelector('script')).toBeNull()
    expect(text).toContain('Hi Alex,')
    expect(text).toContain('https://useaviary.com/')
    expect(text).not.toContain('<table')
  })
})
