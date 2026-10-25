import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { SalaryBudget } from '@/src/components/content/SalaryBudget'

export const metadata = pageMetadata('/tools/budget-for-1-lakh-salary')

export default function Budget1LakhPage() {
  return <SalaryBudget salary={100000} path="/tools/budget-for-1-lakh-salary" faqs={[
    { q: 'How much should I save from a ₹1 lakh salary?', a: 'At least ₹20,000 a month, which is 20%. Pay ₹20,000 in rent instead of ₹30,000 and you’d save ₹30,000 a month, or ₹3.6 lakh a year.' },
    { q: 'How much rent can I afford on ₹1 lakh?', a: '₹25,000 is comfortable and ₹30,000 is a stretch, as long as rent and EMIs together stay within ₹40,000.' },
    { q: 'How do I stop lifestyle creep on a ₹1 lakh salary?', a: 'Cap wants at a fixed number, ₹30,000 in this plan, and send each raise to savings instead of spending it. Give big goals like a home down payment their own categories so the money isn’t spent by accident.' },
  ]} intro="A ₹1 lakh monthly salary should make money easy. For a lot of people it doesn’t, because spending rises to meet it. A budget at this level is less about cutting back and more about choosing on purpose.">
    <h2>Lifestyle creep is the real risk</h2>
    <p>Every raise brings a slightly nicer flat, a slightly better car, more dinners out. None of it feels like much. Then you’re earning ₹1 lakh and saving the same ₹5,000 you saved at ₹40,000. The plan above caps wants at ₹30,000. That’s generous, and it puts a ceiling on the creep.</p>

    <h2>₹20,000 a month, at least</h2>
    <p>The plan saves ₹20,000: ₹10,000 to the emergency fund and ₹10,000 to investments. With essentials at ₹50,000, a six-month fund is ₹3 lakh. At ₹10,000 a month that takes two and a half years, so think about sending the full ₹20,000 there until it’s built.</p>
    <p>If your rent is below ₹30,000, type it in. Every rupee you don’t spend on rent goes to savings, not wants. On ₹20,000 rent you’d save ₹30,000 a month. Over a year that’s ₹3.6 lakh.</p>

    <h2>Give big goals their own categories</h2>
    <p>At this salary you’re probably planning bigger things: a home down payment, a car, a wedding, a course abroad. Give each one a category and a monthly amount. A goal that shares a bank balance with everything else gets spent. A goal with its own number on screen doesn’t.</p>

    <h2>Don’t forget tax</h2>
    <p>Make sure the ₹1 lakh you plan with is after tax. If tax is taken from your salary each month, you’re fine. If you freelance or have income on the side, set aside a category for advance tax so March doesn’t surprise you.</p>
    <p>Compare with a <Link href="/tools/budget-for-60000-salary">₹60k budget</Link> to see where the extra ₹40,000 goes.</p>
  </SalaryBudget>
}
