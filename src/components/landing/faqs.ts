/**
 * The landing FAQ, shared by the landing page (accordion + FAQPage JSON-LD) and
 * the public /help page. Answers stay plain text so structured data matches
 * what's on the page word for word; `link` renders after the answer.
 * `intl` swaps rupee examples for dollar ones; `price` is the monthly price the
 * page shows, left out when billing couldn't be reached.
 */
export interface FaqItem { q: string; a: string; link?: { href: string; label: string } }

export function landingFaqs(intl: boolean, price?: string): FaqItem[] {
  return [
    { q: 'Do I connect my bank? How do expenses get added?', a: 'There’s no bank connection. You log purchases yourself, which makes spending a deliberate check-in. Habit nudges, the home-screen widget, recurring expenses, receipt scanning and typing a few spends at once keep that quick. If you fall behind, upload screenshots of your payments app or a bank statement and Aviary reads the payments for you to check.' },
    { q: 'Can my partner or flatmates share my budget?', a: 'Yes. Make a budget, tap Invite, and send the link or the six-letter code. Up to 6 people can be in one budget, each on their own phone, logging into the same categories. Every spend shows who logged it, and you can get a notification when someone else logs. Your personal budget stays separate.' },
    { q: 'Does everyone in a shared budget need to pay?', a: 'No. One subscription covers a budget and everyone in it. Only the person who made the budget needs a plan; the others join free and never see a paywall for it. How you split that cost between you is up to you.' },
    { q: 'Can I upload a bank statement instead of logging?', a: 'For catching up, yes. Upload screenshots of GPay, PhonePe, Paytm or your bank app, or a CSV, Excel or PDF statement. Aviary reads the payments, suggests a category for each, and you tick the ones to log. Credits are skipped and anything already logged is left alone, so uploading the same screen twice doesn’t double anything.' },
    { q: 'How is Aviary different from an expense tracker?', a: 'An expense tracker tells you where your money went. Aviary helps you decide where it goes before you spend it. You give your money jobs in categories, like rent, groceries and fun, and every log shows what’s left for that job. It’s the method YNAB made popular, built for logging on your phone in one tap.' },
    { q: 'How does Aviary learn my habits?', a: 'It looks at what you’ve logged. Log the same thing on the same weekday, around the same time, three times in eight weeks, and Aviary treats it as a habit. It then nudges you 15 minutes after your usual time with the details filled in. You can turn nudges off in notification settings.' },
    { q: 'What if I miss a few days?', a: `Nothing breaks. Open Ask Aviary and type whatever you remember, like ${intl ? '“bus 3, lunch 15, Friday dinner 60”' : '“auto 240, lunch 150, Friday dinner 900”'}. Aviary turns it into separate spends, picks the categories, and you check them before they’re logged. Two missed days take about a minute.` },
    { q: 'Can I bring my data from YNAB or another app?', a: 'Yes. When you set up Aviary, pick “Switching apps? Bring your data” and upload the export from YNAB, Goodbudget, Wallet, Monefy, Money Manager, Spendee or axio. Any csv or xlsx with a date, an amount and a description works too. Your categories and transaction history come along.' },
    { q: 'What if I lose my phone?', a: 'Your budget lives in your account, not on the phone. Sign in on a new phone or in a browser and everything is there. Only expenses logged offline that hadn’t synced yet stay on the old handset. You can also export everything to CSV any time from account settings.' },
    { q: 'How much does Aviary cost?', a: `Every account starts with a free 30-day trial of the whole app, and you don’t need a card to start. After that it’s ${price ? `${price} a month, or less if you pay yearly` : 'a monthly or yearly subscription'}. One plan also covers a shared budget with up to 6 people. Cancel any time. There are no ads, and your data is never sold.`, link: { href: '/legal/pricing', label: 'See plans and pricing' } },
    { q: 'Is there an iPhone app?', a: 'Not yet. Aviary is on Android and the web today, and the web app works in Safari on iPhone. Join the iPhone waitlist at the bottom of the home page and you’ll hear when it’s ready.' },
    { q: 'Can I use it on my phone and computer?', a: 'Yes. Android and web share your account’s budgets and transactions. Android also offers a home-screen widget and notifications. New expenses can be logged offline on mobile and sync when you reconnect; other actions need a connection.' },
    { q: 'What happens to my financial data?', a: 'Amounts, notes and other sensitive fields are encrypted with AES-256-GCM, and the key is kept apart from the database. The server decrypts them to run the app; this isn’t end-to-end encryption. Ask Aviary and AI briefs send relevant transaction and budget context to Google Gemini, and bill scanning sends receipt photos. There are no ads, and your data is never sold. You can export or delete your data in account settings.', link: { href: '/legal/privacy', label: 'Read the privacy policy' } },
    { q: 'What’s a category?', a: 'A category is a slice of your money set aside for one purpose, like rent, groceries or fun. Your bank balance mixes all of those together. Categories show what’s available for each one before you spend. Savings is a purpose too: you don’t have to spend everything you set aside.' },
    { q: `I’ve put every ${intl ? 'dollar' : 'rupee'} in a category. Am I out of money?`, a: 'No. It means all your money has a purpose. It’s still yours until you spend it. Check each category to see what’s left for that purpose.' },
    { q: 'Why not just use a spreadsheet?', a: 'A spreadsheet can do the math. The hard part is keeping it up on your phone, at the counter, every day. Aviary has the method built in, and most logs take one tap.' },
    { q: 'Does it work if my income changes every month?', a: 'Yes. You only budget money you already have. When a payment lands, give it jobs: rent first, then essentials. A slow month just fills fewer categories.' },
    { q: 'What if Aviary shuts down?', a: 'You won’t get stuck. Export your data to CSV any time, even without a subscription. And the code stays open source on GitHub.' },
    { q: 'Can I use another currency?', a: 'Yes. Choose your display currency during setup or change it in More. One currency applies to your whole budget; changing it doesn’t convert amounts.' },
  ]
}

/** The method in one paragraph, shared by /help and the signed-in /account/help. */
export const HOW_CATEGORIES_WORK = 'All income gets assigned to a category: rent, food, subscriptions, whatever you spend on. Money that hasn’t been assigned yet sits in Ready to Assign. Overspend a category and you move money into it from another one; the total never lies, it just moves. At the start of a new month, each category keeps the amount you assigned last month, so you don’t set it all up again. Unspent money stays in its category and rolls into next month, and anything you haven’t assigned rolls into next month’s Ready to Assign.'

/** The quick ways to log, shared by /help and the Ask Aviary product guide. */
export const LOGGING_WAYS: Array<{ title: string; text: string }> = [
  { title: 'Habit nudges.', text: 'Log the same thing around the same time on the same weekday a few times, and Aviary nudges you 15 minutes after, details filled in. One tap logs it.' },
  { title: 'Catch up in one line.', text: 'Missed a day? Open Ask Aviary and type “auto 240, lunch 150”. You check the spends before they’re logged.' },
  { title: 'Scan a bill.', text: 'Snap a receipt and Aviary reads every line, and splits it if you shared.' },
  { title: 'Recurring expenses.', text: 'Rent and subscriptions log themselves on their due date.' },
  { title: 'The widget.', text: 'On Android, see what’s left from your home screen and tap + to log.' },
]
