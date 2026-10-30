import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { ContentPage, Screen, SoftCta } from '@/src/components/content/ContentPage'
import { postLinks } from '@/lib/blog'

export const metadata = pageMetadata('/features/shared-budgets')

export default function SharedBudgetsPage() {
  return <ContentPage section="features" path="/features/shared-budgets" title="One budget for the two of you, or the whole flat" lede={<>Rent, groceries and the weekend come out of one pot, so the budget should be one pot too. Invite your partner or flatmates, and whoever paid logs it. Everyone sees what’s left, and who spent it.</>} related={[...postLinks('split-expenses-with-flatmates', 'couples-budget-india'), '/features/budget-without-bank-linking', '/compare/goodbudget', '/compare/budget-spreadsheet']}>
    <Screen src="/landing/poster-members.webp" alt="Aviary’s Activity list in a shared budget called Family, each spend marked with the face of the person who logged it." caption="Every spend in a shared budget carries who logged it." />

    <h2>How it works</h2>
    <ol>
      <li>Open Account, then New budget. Name it, pick an icon and a currency, and choose whether to copy your personal categories across.</li>
      <li>Tap Invite. Aviary gives you a link and a six-letter code. Send either on WhatsApp.</li>
      <li>They tap the link, or type the code into Join with a code. They’re in, on their own phone, with their own sign-in.</li>
      <li>Everyone logs into the same categories. Groceries is one jar, and it goes down whoever paid.</li>
    </ol>

    <h2>One plan covers everyone</h2>
    <p>Only the person who made the budget needs a subscription. Up to 5 others join free and never see a paywall for it. There’s no family tier and no per-seat price. If you want to split the cost between you, that’s between you.</p>

    <h2>See who logged what</h2>
    <p>Every spend shows the face of the person who logged it, in Activity and in each category. Switch on “Tell me when others log” and Aviary sends a notification the moment someone else logs, like “Sara logged in Family · Puja Shopping · ₹900 · Shopping”. It’s off by default.</p>

    <h2>Yours stays yours</h2>
    <p>Your personal budget is separate and private. Switch between budgets at the top of Home. Each person can be in up to 5 budgets, so the flat, a trip and the wedding can each have their own, with different people in each.</p>

    <h2>Leaving, handing over, deleting</h2>
    <p>Anyone can leave a budget from Family members. The owner can remove someone, or make someone else the owner. If the owner deletes the budget, members see who deleted it, and the owner can restore it within 30 days.</p>

    <h2>Still no bank link</h2>
    <p>A shared budget is logged the same way as a personal one: by the person who spent. Nudges, bill scanning and <Link href="/features/catch-up-from-statements">catching up from a statement</Link> all work inside it. Read why Aviary works that way on <Link href="/features/budget-without-bank-linking">budgeting without linking your bank</Link>.</p>
    <SoftCta title="Start one for your home" placement="feature_shared">Make a budget in the free trial, invite one person, and log the next grocery run together.</SoftCta>
  </ContentPage>
}
