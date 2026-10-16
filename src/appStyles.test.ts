import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const APP_SHEETS = /\/(App|expense-redesign)\.css$/

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(root, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null
  if (!base) return null
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (existsSync(base + ext)) return base + ext
  return null
}

/** The import chain from `entry` to an app stylesheet, following static imports only (next/dynamic is the way out). */
function chainToAppSheet(entry: string): string[] | null {
  const seen = new Set<string>()
  const queue: string[][] = [[join(root, entry)]]
  while (queue.length) {
    const chain = queue.shift()!
    const file = chain[chain.length - 1]
    if (seen.has(file)) continue
    seen.add(file)
    if (APP_SHEETS.test(file)) return chain.map((f) => relative(root, f))
    if (file.endsWith('.css')) continue
    for (const m of readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm)) {
      const next = resolve(file, m[1])
      if (next) queue.push([...chain, next])
    }
  }
  return null
}

// Next ships these files' CSS with every page, public ones included. App.css and
// expense-redesign.css are ~50KB gzipped that the landing page never uses, and they
// sat on its critical path; they load through src/appStyles.ts in the app layouts.
describe('app stylesheets stay off public pages', () => {
  it.each(['app/layout.tsx', 'app/global-error.tsx', 'app/not-found.tsx', 'app/error.tsx', 'app/(site)/layout.tsx', 'app/page.tsx', 'app/intl/page.tsx'])('%s never imports them', (entry) => {
    expect(chainToAppSheet(entry)).toBeNull()
  })

  it.each(['app/expense/layout.tsx', 'app/insights/layout.tsx', 'app/investments/layout.tsx', 'app/wrapped/layout.tsx', 'app/account/layout.tsx', 'app/onboarding/layout.tsx', 'app/admin/layout.tsx', 'app/(auth)/layout.tsx'])('%s loads them first, App.css before expense-redesign.css', (layout) => {
    expect(readFileSync(join(root, layout), 'utf8').trimStart().startsWith("import '@/src/appStyles'")).toBe(true)
  })
})
