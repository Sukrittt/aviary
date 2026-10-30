import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { landingFaqs } from '@/src/components/landing/faqs'
import { LandingFooter } from '@/src/components/landing/Chrome'
import SecurityPage from './page'

const paths = ['monefy', 'wallet', 'money-manager', 'axio'].map((p) => `app/(site)/compare/${p}/page.tsx`)

describe('/security', () => {
  const html = renderToStaticMarkup(<SecurityPage />)

  it('says what it isn’t: no end-to-end encryption, no pen test', () => {
    expect(html).toContain('This isn&#x27;t end-to-end encryption')
    expect(html).toContain('No professional pen test yet')
    expect(html).toContain('AES-256-GCM')
  })

  it('names both AI providers, the background runs and the /security#ai anchor', () => {
    expect(html).toContain('Google Gemini')
    expect(html).toContain('TypeSafe AI')
    expect(html).toContain('When it runs without you asking')
    expect(html).toContain('id="ai"')
  })

  it('is in the footer, and the FAQ points at it', () => {
    expect(renderToStaticMarkup(<LandingFooter />)).toContain('href="/security"')
    expect(landingFaqs(true).find((f) => f.q === 'What does the AI see?')?.link?.href).toBe('/security#ai')
  })
})

describe('global copy', () => {
  it('has no rupee wording on the compare pages and the blog box', () => {
    for (const path of [...paths, 'app/(site)/blog/[slug]/page.tsx']) expect(readFileSync(path, 'utf8')).not.toMatch(/\brupee/i)
  })
})
