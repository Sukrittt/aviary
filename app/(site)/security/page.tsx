import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { serifFont } from '@/src/components/content/serifFont'
import { GITHUB } from '@/src/components/landing/Chrome'

export const metadata = pageMetadata('/security')

const SUPPORT_EMAIL = 'support@useaviary.com'

/**
 * Every claim here traces to code or the privacy policy. The AI section mirrors
 * lib/ai/expenseContext.ts, lib/ai/jev.ts and their callers: when a prompt gains
 * a field, this page changes with it.
 */
export default function SecurityPage() {
  return (
    <article className={`legal-doc article-doc ${serifFont.variable}`}>
      <header className="article-head">
        <p className="article-kicker">Security</p>
        <h1>Security, plainly</h1>
        <p className="article-dek">What protects your money data, what goes to AI, and what hasn&apos;t been done yet. Aviary is built and run by one developer, so this page doesn&apos;t pretend there&apos;s a security team.</p>
      </header>

      <div className="article-body">
        <h2>No bank login, no bank connection</h2>
        <p>Aviary never asks for your bank login, doesn&apos;t connect to your bank, and doesn&apos;t read your SMS. You log spends yourself. If you fall behind, you can upload screenshots or a statement, but that&apos;s a file you choose to send.</p>
        <p>When you subscribe, your card, UPI or PayPal details stay with Razorpay, PayPal or Google Play. We keep the subscription&apos;s id, plan and renewal dates.</p>

        <h2>Encryption, and where it stops</h2>
        <p>Amounts, item names, notes and AI chat text are encrypted at rest with AES-256-GCM before they reach our database. Traffic between the app and our servers uses HTTPS.</p>
        <p><strong>This isn&apos;t end-to-end encryption.</strong> The server holds the key and decrypts your data to run your budget and answer AI questions. So it protects you if the database leaks, not if our server itself is compromised. It also means whoever runs the server, today one developer, could read your data.</p>
        <p>Dates, category names, payment methods, and subscription and holding names are stored as plain text so search and filtering work.</p>

        <h2>Export and delete</h2>
        <p>Export your data from account settings, up to 3 times a month. If your access has ended, you still get one final export, so a lapsed subscription doesn&apos;t trap your data.</p>
        <p>Delete your account from the app or the web, using <Link href="/legal/delete-account">these steps</Link>. Your data stays recoverable for 7 days, in case it was an accident. Then it&apos;s permanently deleted from our active systems. The one exception is your subscription record (its id, plan and payment dates, never your budgeting data), which we keep to match a late refund or renewal.</p>

        <h2 id="ai">What the AI sees</h2>
        <p>Two AI providers get your data. Google Gemini writes answers and reads bills and statements. TypeSafe AI, through Vercel&apos;s AI Gateway, makes quick decisions like which category fits.</p>
        <ul>
          <li><strong>Ask Aviary.</strong> What you type goes to TypeSafe to work out what you&apos;re asking, then to Gemini to answer, unless it&apos;s off-topic. Gemini also gets this month&apos;s income and category numbers and your biggest items. When the question needs them, it also gets up to 90 days of transactions (item, amount, category, date, payment method), six months of category totals, your subscriptions and your investments.</li>
          <li><strong>AI briefs.</strong> Opening Ask Aviary builds one, with nothing typed. TypeSafe gets this month&apos;s numbers, top items, trends and subscriptions to pick the cards. Gemini only gets your totals, transaction count and days left.</li>
          <li><strong>Bills and statements.</strong> Photos, screenshots and PDFs go to Gemini whole, so anything printed on them goes too, like your name or account number. Bill photos aren&apos;t stored afterward. With a CSV or Excel file, payee names go to TypeSafe to pick categories, and column names with sample values go too if we can&apos;t work out the columns.</li>
          <li><strong>Logging.</strong> Item names go to TypeSafe to suggest a category and to spot double logs. The first time you log a name, it goes with the amount and category, to judge whether it&apos;s a one-off.</li>
          <li><strong>Everything else.</strong> &ldquo;Why is this up?&rdquo; on Insights sends Gemini that category&apos;s figures and biggest spends. Wrapped sends TypeSafe your month&apos;s totals, category mix and biggest purchase. Setup and imports send TypeSafe category and holding names to sort them. Bug reports send it the title and details you wrote.</li>
        </ul>
        <p><strong>Your name and email.</strong> We don&apos;t add them to any prompt. But what you type, and what&apos;s printed on what you upload, goes as it is.</p>
        <p><strong>Your notes.</strong> Saved notes aren&apos;t in Ask Aviary or briefs. They go to TypeSafe in one place: when you tap to scan your expenses for recurring payments.</p>

        <h3>When it runs without you asking</h3>
        <ul>
          <li><strong>Coaching nudges.</strong> If you&apos;re on track to overspend, a scheduled job sends Gemini your full budget picture, including 90 days of transactions and your investments, to write a push notification. That&apos;s at most once a week, and it&apos;s on by default. Turn it off with the coaching switch in the Android app&apos;s notification settings, or by setting your daily summary to off.</li>
          <li><strong>Habit nudges.</strong> The Android app sends Gemini a habit&apos;s item, category and usual days and time, to write the nudge once. Turn nudges off in notification settings.</li>
          <li><strong>Logging.</strong> The category and one-off checks above run as you log.</li>
        </ul>
        <p>Turning Ask Aviary off in More &rarr; Features hides it, but it doesn&apos;t stop the nudges or the logging checks. There&apos;s no single switch for all AI yet.</p>

        <h3>Training and retention</h3>
        <p>Google does not use this data to train its models under our API agreement with them. For TypeSafe, every request sets the AI Gateway&apos;s option that disallows prompt training. We haven&apos;t turned on the gateway&apos;s zero data retention, so those requests don&apos;t come with a no-retention promise.</p>

        <h2>What we haven&apos;t done</h2>
        <ul>
          <li>No professional pen test yet.</li>
          <li>No outside security audit, and no security certifications.</li>
          <li>No end-to-end encryption.</li>
          <li>No zero data retention on the AI Gateway, and no single off switch for AI.</li>
        </ul>

        <h2>Check it yourself</h2>
        <p>The code is public: the <a href="https://github.com/Sukrittt/aviary">web app and server</a> and the <a href={GITHUB}>Android app</a>. The <Link href="/legal/privacy">privacy policy</Link> has the full list of providers. Found a security problem? Write to <strong>{SUPPORT_EMAIL}</strong>.</p>
      </div>
    </article>
  )
}
