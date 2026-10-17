import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// insights.css loads on /expense and /investments too, so a bare `.is-up` rule
// painted Investments' gains coral. Every trend selector has to name an Insights class.
describe('insights.css trend colours', () => {
  it('never styles a bare .is-up or .is-down', () => {
    const css = readFileSync(join(process.cwd(), 'src/insights.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()))
    const trend = selectors.filter((s) => /\.is-(up|down)\b/.test(s))
    expect(trend.length).toBeGreaterThan(0)
    expect(trend.filter((s) => !/\.ins-/.test(s))).toEqual([])
  })
})
