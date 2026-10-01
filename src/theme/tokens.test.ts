import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { darkTokens, lightTokens } from './tokens'

// tokens.css is generated from tokens.ts. If someone edits the palette and
// forgets `npm run gen:tokens`, every stylesheet keeps the old colours while
// tokens.ts claims the new ones — silently, since nothing else reads the .ts.
describe('tokens.css', () => {
  it('uses light for the initial page palette before preferences are restored', () => {
    const css = readFileSync('src/theme/tokens.css', 'utf8')
    const root = css.match(/:root\s*\{([^}]+)\}/)?.[1]
    expect(root).toContain(`--tk-bg: ${lightTokens.bg};`)
    expect(root).toContain(`--tk-text: ${lightTokens.text};`)
  })
  it('is in sync with tokens.ts', () => {
    const before = readFileSync('src/theme/tokens.css', 'utf8')
    execFileSync('node', ['scripts/generate-tokens.mjs'], { stdio: 'pipe' })
    const after = readFileSync('src/theme/tokens.css', 'utf8')
    expect(after, 'run `npm run gen:tokens` and commit the result').toBe(before)
  })

  it('emits every token of both schemes', () => {
    const css = readFileSync('src/theme/tokens.css', 'utf8')
    for (const name of Object.keys(darkTokens)) {
      const cssName = `--tk-${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`
      expect(css, `${name} is missing from tokens.css`).toContain(`${cssName}:`)
    }
    expect(Object.keys(lightTokens)).toEqual(Object.keys(darkTokens))
  })

  it('keeps the accent/accentInk contrast split mobile relies on', () => {
    // accent is for fills and large text only; accentInk is the one that
    // clears 4.5:1 for small text and icons. Collapsing them re-introduces
    // the contrast failure the split exists to avoid.
    expect(lightTokens.accent).not.toBe(lightTokens.accentInk)
    expect(darkTokens.accent).not.toBe(darkTokens.accentInk)
  })
})

// The accent is only half a fix if the stylesheets keep painting text with it.
// These two aliases are what the sheets actually write, so they are what the
// guard has to look for.
const ACCENT_ALIASES = [
  { file: 'src/expense-redesign.css', raw: '--gold', ink: '--gold-ink' },
  { file: 'src/App.css', raw: '--accent', ink: '--accent-strong' },
]

describe('accent text contrast', () => {
  it('never paints text with the raw accent', () => {
    for (const { file, raw, ink } of ACCENT_ALIASES) {
      const css = readFileSync(file, 'utf8')
      // The alias has to still point at the token, or this guard is watching
      // a name that no longer means what it did.
      expect(css, `${file} no longer aliases ${raw}`).toMatch(
        new RegExp(`^\\s*\\${raw}:\\s*var\\(--tk-accent\\);`, 'm'),
      )
      expect(css, `${file} no longer aliases ${ink}`).toMatch(
        new RegExp(`^\\s*\\${ink}:\\s*var\\(--tk-accent-ink\\);`, 'm'),
      )
      const offenders = css
        .split('\n')
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => new RegExp(`^\\s*color:\\s*var\\(\\${raw}\\);`).test(line))
        .map(([n]) => `${file}:${n}`)
      expect(offenders, `use var(${ink}) for text; var(${raw}) is for fills`).toEqual([])
    }
  })

  it('clears 4.5:1 with accentInk on each scheme background', () => {
    const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    for (const scheme of [lightTokens, darkTokens]) {
      expect(contrast(scheme.accentInk, scheme.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(scheme.accentInk, scheme.cardSolid)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
