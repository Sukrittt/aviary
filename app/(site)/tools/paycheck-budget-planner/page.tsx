import { pageMetadata } from '@/lib/seo'
import { ContentPage, SoftCta } from '@/src/components/content/ContentPage'
import { SalaryPlanner } from '@/src/components/content/Calculators'

export const metadata = pageMetadata('/tools/paycheck-budget-planner')

/** The salary planner without rupees, for everyone outside India (/intl's signup pitch lands here). */
export default function PaycheckPlannerPage() {
  return <ContentPage section="tools" path="/tools/paycheck-budget-planner" title="Paycheck budget planner" lede={<>Type your monthly take-home pay and your rent, in whatever currency you’re paid in. You’ll get a month split into categories, every bit of it accounted for.</>} related={['/compare/ynab-alternative']}>
    <SalaryPlanner initial={4000} intl />

    <h2>How the plan is built</h2>
    <p>It starts from the 50/30/20 rule and breaks each part down:</p>
    <ul>
      <li><strong>Needs, 50%.</strong> Rent up to 30% of your pay. The other 20% goes to groceries (half), bills and phone (a quarter) and transport (the rest).</li>
      <li><strong>Wants, 30%.</strong> Eating out, shopping, and fun and subscriptions.</li>
      <li><strong>Savings, 20%.</strong> Half to an emergency fund, half to investments.</li>
    </ul>
    <p>Amounts are rounded to the nearest 100 so they’re easy to remember. Whatever’s left over from rounding goes to investments.</p>

    <h2>When your rent is higher</h2>
    <p>Type your real rent. If it’s more than 30%, the planner takes the extra from wants first. Savings only shrink once wants hit zero, because cutting back on dinners out is easier to undo than skipping your emergency fund. If your rent is lower, or you live with family, the difference goes to savings.</p>

    <h2>Turning the plan into a budget</h2>
    <p>A plan you make once and never check is a wish. Copy the categories into whatever you use, a notebook, a spreadsheet or an app, and write spends down the day they happen. “uber 12, lunch 15” is enough. At the end of the month, compare. Most people find two or three categories way off the first time. That’s the useful part.</p>
    <SoftCta title="Your plan, with what’s left after every spend" placement="tool_paycheck_planner" pitch={false}>Aviary turns these categories into a live budget. Log a spend in one tap and see what’s left for the month.</SoftCta>
  </ContentPage>
}
