import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, SoftCta } from '@/src/components/content/ContentPage'
import { SalaryPlanner } from '@/src/components/content/Calculators'

export const metadata = pageMetadata('/tools/salary-budget-planner')

export default function SalaryPlannerPage() {
  return <ContentPage section="tools" path="/tools/salary-budget-planner" title="Salary budget planner" lede={<>Type your monthly take-home salary and your rent. You’ll get a month split into categories, every rupee accounted for.</>} related={['/tools/budget-for-25000-salary', '/tools/budget-for-40000-salary', '/tools/budget-for-60000-salary', '/tools/budget-for-1-lakh-salary']}>
    <SalaryPlanner />

    <h2>How the plan is built</h2>
    <p>It starts from the <Link href="/tools/50-30-20-calculator">50/30/20 rule</Link> and breaks each part down:</p>
    <ul>
      <li><strong>Needs, 50%.</strong> Rent up to 30% of your salary. The other 20% goes to groceries (half), bills and phone (a quarter) and transport (the rest).</li>
      <li><strong>Wants, 30%.</strong> Eating out, shopping, and fun and subscriptions.</li>
      <li><strong>Savings, 20%.</strong> Half to an emergency fund, half to investments.</li>
    </ul>
    <p>Amounts are rounded to ₹100 so they’re easy to remember. Whatever’s left over from rounding goes to investments.</p>

    <h2>When your rent is higher</h2>
    <p>Type your real rent. If it’s more than 30%, the planner takes the extra from wants first. Savings only shrink once wants hit zero, because cutting back on dinners out is easier to undo than skipping your emergency fund. If your rent is lower, or you live with family, the difference goes to savings.</p>

    <h2>Turning the plan into a budget</h2>
    <p>A plan you make once and never check is a wish. Copy the categories into whatever you use, a notebook, a spreadsheet or an app, and write spends down the day they happen. At the end of the month, compare. Most people find two or three categories way off the first time. That’s the useful part.</p>
    <p>Not sure where to start? See worked examples for <Link href="/tools/budget-for-15000-salary">₹15k</Link>, <Link href="/tools/budget-for-20000-salary">₹20k</Link>, <Link href="/tools/budget-for-25000-salary">₹25k</Link>, <Link href="/tools/budget-for-40000-salary">₹40k</Link>, <Link href="/tools/budget-for-60000-salary">₹60k</Link> and <Link href="/tools/budget-for-1-lakh-salary">₹1 lakh</Link> salaries.</p>
    <SoftCta title="Your plan, with what’s left after every spend" placement="tool_salary_planner">Aviary turns these categories into a live budget. Log a spend in one tap and see what’s left for the month.</SoftCta>
  </ContentPage>
}
