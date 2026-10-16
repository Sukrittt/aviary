'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import { CATEGORIES, CATEGORIES_INTL } from './mobile/demo'
import { BowlSteamIcon, BusIcon, ChartLineIcon, CoffeeIcon, CookieIcon, GameControllerIcon, HouseIcon, LightbulbIcon, MopedIcon, PizzaIcon, ShoppingCartIcon, TaxiIcon, type PhosphorIcon } from '@/src/components/icons'

/**
 * The landing's sample data, by where the visitor is. India sees rupees, chai and UPI;
 * everyone else sees dollars and examples that read anywhere. Screen recordings
 * come in both: public/landing/ is the India set and public/landing/intl/ the
 * dollar one. `media()` falls back to the India file for any not yet recorded in
 * dollars, so add a file to INTL_MEDIA once its intl copy exists.
 */

/** A notice row's icon, drawn on the tint Nudges puts behind it. */
const tile = (Icon: PhosphorIcon) => <Icon />

const INTL_MEDIA = new Set([
  'clip-log.mp4', 'poster-log.webp', 'clip-added.mp4', 'poster-added.webp', 'clip-scan.mp4', 'poster-scan.webp',
  'clip-insights.mp4', 'poster-insights.webp', 'clip-invest.mp4', 'poster-invest.webp', 'subscriptions.png',
  'clip-ask.mp4', 'poster-ask.webp',
])

const IN = {
  media: (file: string) => `/landing/${file}`,
  categories: CATEGORIES,
  habits: ['4pm chai', 'Friday cab home', 'Sunday groceries', 'office lunch', 'Swiggy Saturdays', 'phone bill'],
  learns: {
    item: 'Chai', amount: 20, envelope: <><CookieIcon aria-hidden style={{ verticalAlign: '-0.125em' }} /> Snacks</>, of: 600, pay: 'UPI',
    ask: 'Afternoon chai?', body: 'Time for your Tuesday chai fix? Tap Log and it’s in.', done: 'Chai is in. Nice one.',
    habit: 'Chai on Tuesdays, around 4pm', other: ['Metro card', 100] as [string, number],
  },
  cabHome: 240,
  investments: 'Mutual funds, FDs, PPF and gold',
  playItem: 'Coffee with Sam', playAmount: ['1', '8', '0'],
  // Mobile's capture tip example (log-expense.tsx CAPTURE_TIP_COPY).
  starters: ['Chai', 'Uber home', 'Groceries', 'Netflix'],
  widgetToday: [{ item: 'Coffee with Sam', amount: 180 }, { item: 'Metro card', amount: 100 }],
  statement: [
    ['06 Oct', 'UPI/DR/6021843/SWIGGY/YESB/swiggy@ybl', '349.00'],
    ['06 Oct', 'POS 4419XXXXXXXX2231 ZEPTO MUMBAI', '612.00'],
    ['06 Oct', 'UPI/DR/6021977/PAYTM/PYTM/paytmqr28', '20.00'],
    ['05 Oct', 'NACH DR ACH-91X8820 CULTFIT', '1,299.00'],
    ['05 Oct', 'IMPS/P2A/88123/XXXXXX4410/JAKE', '500.00'],
    ['05 Oct', 'UPI/DR/6019022/BLINKIT/ICIC/blinkit', '486.00'],
    ['04 Oct', 'ATM WDL 0442 HSR LAYOUT BLR', '2,000.00'],
    ['04 Oct', 'UPI/DR/6017718/UBER/HDFC/uber.rides', '231.00'],
    ['04 Oct', 'POS 4419XXXXXXXX2231 SHELL FUEL', '1,800.00'],
    ['03 Oct', 'UPI/DR/6016004/PAYTM/PYTM/paytmqr91', '40.00'],
    ['03 Oct', 'NETFLIX.COM SI 0310 AUTOPAY', '649.00'],
    ['03 Oct', 'UPI/DR/6015530/SWIGGY/YESB/swiggy@ybl', '412.00'],
    ['02 Oct', 'IMPS/P2A/87990/XXXXXX9012/EMMA', '1,200.00'],
    ['02 Oct', 'UPI/DR/6014471/AMAZON/AXIS/amazon', '1,149.00'],
  ] as [string, string, string][],
  // What each recording shows, for the cards around it and screen readers.
  scan: {
    copy: 'Point your camera at a receipt. Aviary reads every line, taxes included.',
    rows: [['Med Brownie', 'Split 2 ways', '₹48.57'], ['Coke Float', 'Split 2 ways', '₹20'], ['CGST @ 2.5%', 'Split 2 ways', '₹1.72']] as [string, string, string][],
    bill: '₹144', shared: '2 ways', share: '₹72', envelope: 'Eating out',
    sr: 'A ₹144 McDonald’s bill is scanned. Aviary reads every line, you mark the brownie and the Coke float as shared two ways, and it logs your ₹72 share to Eating out.',
  },
  added: 'Added ₹250 for Rapido. Cabs & Auto has ₹1,890 left of ₹3,500.',
  notice: {
    quote: '“Rapido? Log it while it’s fresh.”',
    steps: ['Noticed it’s Friday, 9:15am, like the last three', 'Filled in Rapido · Cabs & Auto · ₹250 · UPI', 'Logged with one tap on the notification', 'Cabs & Auto has ₹1,890 left this month'],
    label: 'Today in Aviary',
    // First row is the one the nudge just logged; it slides in once the steps finish.
    // The rest mirrors the demo account's Activity list (demo-recordings/india/activity.jpeg).
    rows: [[tile(MopedIcon), '#d4e5ea', 'Rapido', '16 Oct ’26 · Cabs & Auto', '₹250'], [tile(TaxiIcon), '#d4e5ea', 'Namma Yatri', '15 Oct ’26 · Cabs & Auto', '₹270'], [tile(CoffeeIcon), '#f8d9cf', 'Filter coffee', '15 Oct ’26 · Coffee & snacks', '₹100'], [tile(BowlSteamIcon), '#d6e7d8', 'Vidyarthi Bhavan', '15 Oct ’26 · Eating out', '₹690'], [tile(ChartLineIcon), '#f6ecd2', 'PPF deposit', '15 Oct ’26 · Investments', '₹5,000'], [tile(LightbulbIcon), '#f6ecd2', 'BWSSB water', '12 Oct ’26 · Utilities', '₹320']] as [ReactNode, string, string, string, string][],
  },
  headsUp: '₹649 due in 3 days (Nov 12).',
  ask: {
    chips: ['What can I cut back on?', 'How does this month compare?', 'Can I afford 90k iPhone?'],
    left: '₹43,640', bar: 0.34,
    sr: 'You ask “Can I afford a 90k iPhone?” and Aviary answers from your budget: yes, if you use your unspent money and savings. You have ₹43,640 unspent across categories this month, and it suggests covering the remaining ₹50,859 from savings.',
  },
}

export type Sample = typeof IN

const INTL: Sample = {
  media: (file) => `/landing/${INTL_MEDIA.has(file) ? 'intl/' : ''}${file}`,
  categories: CATEGORIES_INTL,
  habits: ['4pm coffee', 'Friday ride home', 'Sunday groceries', 'office lunch', 'takeout Saturdays', 'phone bill'],
  learns: {
    item: 'Coffee', amount: 4, envelope: <><CookieIcon aria-hidden style={{ verticalAlign: '-0.125em' }} /> Snacks</>, of: 60, pay: 'Card',
    ask: 'Afternoon coffee?', body: 'Time for your Tuesday coffee fix? Tap Log and it’s in.', done: 'Coffee is in. Nice one.',
    habit: 'Coffee on Tuesdays, around 4pm', other: ['Bus fare', 2.75] as [string, number],
  },
  cabHome: 18,
  investments: 'Stocks, a 401(k), savings and crypto',
  playItem: 'Coffee with Sam', playAmount: ['6'],
  starters: ['Coffee', 'Uber home', 'Groceries', 'Netflix'],
  widgetToday: [{ item: 'Coffee with Sam', amount: 6 }, { item: 'Bus fare', amount: 2.75 }],
  statement: [
    ['06 Oct', 'SQ *BLUE BOTTLE COFFEE SF', '6.50'],
    ['06 Oct', 'POS DEBIT 4419 TRADER JOE S #552', '48.72'],
    ['06 Oct', 'UBER *EATS PENDING', '24.18'],
    ['05 Oct', 'ACH DEBIT PLANET FITNESS', '24.99'],
    ['05 Oct', 'ZELLE TO JAKE M 88123', '40.00'],
    ['05 Oct', 'TST* SWEETGREEN 0419', '15.85'],
    ['04 Oct', 'ATM WITHDRAWAL 0442 MISSION ST', '60.00'],
    ['04 Oct', 'UBER *TRIP HELP.UBER.COM', '18.40'],
    ['04 Oct', 'SHELL OIL 57444218', '42.10'],
    ['03 Oct', 'SQ *JOE S PIZZA', '9.00'],
    ['03 Oct', 'NETFLIX.COM 866-579-7172', '15.49'],
    ['03 Oct', 'DOORDASH*CHIPOTLE', '21.36'],
    ['02 Oct', 'VENMO PAYMENT 1029384 EMMA', '30.00'],
    ['02 Oct', 'AMAZON MKTPLACE PMTS', '34.99'],
  ],
  scan: {
    copy: 'Point your camera at a receipt. Aviary reads every line, fees and tip included.',
    rows: [['Cheeseburger', 'Split 2 ways', '$12.50'], ['Fries', 'Split 2 ways', '$2'], ['Small soda', 'All yours', '$2']],
    bill: '$46.79', shared: '2 ways', share: '$24.40', envelope: 'Food Delivery',
    sr: 'A $46.79 DoorDash bill is scanned. Aviary reads every line, you mark the cheeseburger and fries as shared two ways, and it logs your $24.40 share to Food Delivery.',
  },
  added: 'Added $50 for Movie Tickets. Entertainment has $50 left of $150.',
  notice: {
    quote: '“Coffee with Sam? Log it while it’s fresh.”',
    steps: ['Noticed it’s Friday, 4:15pm, like the last three', 'Filled in Coffee with Sam · Eating out · $6 · Card', 'Logged with one tap on the notification', 'Eating out has $240 left this month'],
    label: 'This week in Aviary',
    rows: [[tile(BowlSteamIcon), '#d6e7d8', 'Coffee with Sam', '9 Oct ’26 · Eating out', '$6'], [tile(BusIcon), '#ead2f2', 'Bus Fare', '9 Oct ’26 · Commute', '$3'], [tile(PizzaIcon), '#f6ecd2', 'DoorDash', '9 Oct ’26 · Food Delivery', '$24.40'], [tile(ShoppingCartIcon), '#f8d9cf', 'Milk', '10 Oct ’26 · Groceries', '$3.49'], [tile(GameControllerIcon), '#d6e7d8', 'Movie tickets', '16 Oct ’26 · Entertainment', '$50'], [tile(HouseIcon), '#f8d9cf', 'Rent', '5 Oct ’26 · Rent', '$1,500']] as [ReactNode, string, string, string, string][],
  },
  headsUp: '$15.49 due in 3 days (Oct 28).',
  ask: {
    chips: ['What can I cut back on?', 'How does this month compare?', 'Can I afford a $900 iPhone?'],
    left: '$2,497', bar: 0.55,
    sr: 'You ask “Can I afford a $900 iPhone?” and Aviary answers from your budget: yes, if it comes out of Savings. Your Savings category has $1,160 this month, so it suggests moving $900 from there.',
  },
}

const SampleContext = createContext(IN)

/** `intl` is any visitor outside India (see app/page.tsx). */
export function SampleScope({ intl, children }: { intl: boolean; children: ReactNode }) {
  return <SampleContext.Provider value={intl ? INTL : IN}>
    <CurrencyScope code={intl ? 'USD' : 'INR'}>{children}</CurrencyScope>
  </SampleContext.Provider>
}
export function useSample() { return useContext(SampleContext) }
