import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(join(process.cwd(), 'src/expense-redesign.css'), 'utf8')

describe('legal page scrolling', () => {
  it('lets long legal documents grow beyond the fixed dashboard viewport', () => {
    const legalRule = stylesheet.match(/\.legal-page\s*\{([^}]*)\}/)?.[1]

    expect(legalRule).toBeDefined()
    expect(legalRule).toMatch(/height:\s*auto/)
    expect(legalRule).toMatch(/overflow:\s*visible/)
  })
})
