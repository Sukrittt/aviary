import type { ReactNode } from 'react'
import type { PagePath } from '@/lib/seo'
import { lakhs } from '@/lib/tools/money'
import { ContentPage, SoftCta } from './ContentPage'
import { SalaryPlanner } from './Calculators'

const SALARY_PAGES: [number, PagePath][] = [
  [25000, '/tools/budget-for-25000-salary'], [30000, '/tools/budget-for-30000-salary'], [40000, '/tools/budget-for-40000-salary'], [50000, '/tools/budget-for-50000-salary'],
  [60000, '/tools/budget-for-60000-salary'], [80000, '/tools/budget-for-80000-salary'], [100000, '/tools/budget-for-1-lakh-salary'],
]

/** A pre-filled salary budget page. The copy is each page's own; this is just the frame. */
export function SalaryBudget({ salary, path, intro, children }: { salary: number; path: PagePath; intro: ReactNode; children: ReactNode }) {
  const others = SALARY_PAGES.filter(([, p]) => p !== path).map(([, p]) => p)
  return <ContentPage section="tools" path={path} title={`How to budget a ${lakhs(salary)} salary`} lede={intro} related={['/tools/salary-budget-planner', ...others, '/tools/emergency-fund-calculator']}>
    <h2>A starting plan for {lakhs(salary)} a month</h2>
    <p>This uses take-home pay and puts rent at 30%. Got a different rent? Type it in and the rest adjusts: wants shrink first, savings last.</p>
    <SalaryPlanner initial={salary} />
    {children}
    <SoftCta title="Make this month’s plan real" placement={`tool_salary_${salary}`}>Set these up as categories in Aviary and log as you go. You’ll see what’s left in each one before you spend.</SoftCta>
  </ContentPage>
}
