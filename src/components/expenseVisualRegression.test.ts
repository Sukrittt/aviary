import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const expenseCss = readFileSync(join(root, 'src/expense-redesign.css'), 'utf8')
const insightsCss = readFileSync(join(root, 'src/insights.css'), 'utf8')
const expensePage = readFileSync(join(root, 'src/views/ExpensePage.tsx'), 'utf8')
const transactions = readFileSync(join(root, 'src/components/TransactionsView.tsx'), 'utf8')
const insights = readFileSync(join(root, 'src/views/InsightsPage.tsx'), 'utf8')
const subscriptions = readFileSync(join(root, 'src/views/SubscriptionsPage.tsx'), 'utf8')

describe('expense screen visual regressions', () => {
  it('renders recent activity navigation without default link underlines', () => {
    expect(insightsCss).toMatch(/\.expense-redesign \.home-recent a\s*\{[^}]*text-decoration:\s*none/)
  })

  it('keeps the subscription add button on the solid accent and the selected period on the soft tint', () => {
    expect(subscriptions).toContain('erd-log-btn txn-page-log-btn')
    expect(transactions).toContain('period === key ? "is-active" : ""')
    expect(expenseCss).toMatch(
      /\.expense-redesign \.mc-filter-chips \.action-button\.is-active\s*{[^}]*background:\s*var\(--gold-soft\)/,
    )
    expect(expenseCss).toMatch(
      /\.expense-redesign \.action-button\.is-active\.erd-accent-action\s*{[\s\S]*?background:\s*var\(--gold\)/,
    )
  })

  it('centers Pitch an idea in the height it stretches to beside the status select', () => {
    const ideasPage = readFileSync(join(root, 'src/views/IdeasBoardPage.tsx'), 'utf8')
    expect(ideasPage).toMatch(/className="[^"]*\bideas-pitch\b[^"]*"/)
    expect(expenseCss).toMatch(/\.ideas-toolbar \.ideas-pitch\s*{[^}]*align-self:\s*stretch[^}]*display:\s*inline-flex[^}]*align-items:\s*center/)
  })

  it('keeps the bulk return CTA solid and its description close to the title', () => {
    expect(expensePage).toContain('className="is-active erd-accent-action"')
    expect(expenseCss).toMatch(
      /\.expense-redesign \.bulk-return-modal \.move-money-desc\s*{[^}]*margin-top:\s*-14px/,
    )
  })

  it('keeps the transaction card as a flex column so loading cannot stretch the log button', () => {
    expect(expenseCss).toMatch(
      /\.expense-redesign \.txn-timeline\s*{[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column/,
    )
    expect(expenseCss).toMatch(/\.erd-log-btn\s*{[\s\S]*?flex:\s*0 0 auto/)
  })

  it('keeps biggest-spend rows isolated from Activity transaction styles', () => {
    expect(insights).not.toContain('txn-timeline-list ins-top-list')
    expect(insights).not.toContain('txn-timeline-row ins-top-row')
    expect(insightsCss).toMatch(/\.ins-top-list\s*{[\s\S]*?gap:\s*0/)
    expect(insightsCss).toMatch(/\.expense-redesign \.ins-top-row\s*{[\s\S]*?border:\s*0/)
  })
})


it('keeps the disabled expense save button on the theme accent', () => {
  expect(expenseCss).toMatch(/\.erd-log-submit:disabled\s*\{[^}]*background:\s*var\(--gold\)/)
  expect(expenseCss).toMatch(/\.erd-log-submit:disabled\s*\{[^}]*color:\s*var\(--erd-on-accent\)/)
})
