import type { ReactNode } from 'react'
import type { PagePath } from '@/lib/seo'
import { jsonLd } from '@/src/components/JsonLd'
import { lakhs } from '@/lib/tools/money'
import { ContentPage, SoftCta } from './ContentPage'
import { SalaryPlanner } from './Calculators'
import { postLinks } from '@/lib/blog'

const SALARY_PAGES: [number, PagePath][] = [
  [15000, '/tools/budget-for-15000-salary'], [20000, '/tools/budget-for-20000-salary'], [25000, '/tools/budget-for-25000-salary'], [30000, '/tools/budget-for-30000-salary'], [40000, '/tools/budget-for-40000-salary'], [50000, '/tools/budget-for-50000-salary'],
  [60000, '/tools/budget-for-60000-salary'], [80000, '/tools/budget-for-80000-salary'], [100000, '/tools/budget-for-1-lakh-salary'],
]

/**
 * A pre-filled salary budget page. The copy is each page's own; this is just the frame.
 * `faqs` are plain text so the FAQPage JSON-LD matches what's on the page word for word.
 */
export function SalaryBudget({ salary, path, intro, faqs, children }: { salary: number; path: PagePath; intro: ReactNode; faqs: { q: string; a: string }[]; children: ReactNode }) {
  const others = SALARY_PAGES.filter(([, p]) => p !== path).map(([, p]) => p)
  return <ContentPage section="tools" path={path} title={`How to budget a ${lakhs(salary)} salary`} lede={intro} related={[...postLinks('first-salary-budget', '50-30-20-rule-india'), '/tools/salary-budget-planner', ...others, '/tools/emergency-fund-calculator']}>
    <h2>A starting plan for {lakhs(salary)} a month</h2>
    <p>This uses take-home pay and puts rent at 30%. Got a different rent? Type it in and the rest adjusts: wants shrink first, savings last.</p>
    <SalaryPlanner initial={salary} />
    {children}
    <h2>Questions about a {lakhs(salary)} budget</h2>
    {faqs.map(({ q, a }) => <section key={q}><h3>{q}</h3><p>{a}</p></section>)}
    {jsonLd({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })}
    <SoftCta title="Make this month’s plan real" placement={`tool_salary_${salary}`}>Set these up as categories in Aviary and log as you go. You’ll see what’s left in each one before you spend.</SoftCta>
  </ContentPage>
}
