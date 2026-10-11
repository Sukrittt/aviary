'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import { CATEGORIES, CATEGORIES_INTL } from './mobile/demo'

/**
 * The landing's sample data, by where the visitor is. India sees rupees, chai and UPI;
 * everyone else sees dollars and examples that read anywhere. Screen recordings
 * come in both: public/landing/ is the India set and public/landing/intl/ the
 * dollar one. `media()` falls back to the India file for any not yet recorded in
 * dollars, so add a file to INTL_MEDIA once its intl copy exists.
 */

const INTL_MEDIA = new Set([
  'clip-log.mp4', 'poster-log.jpg', 'clip-added.mp4', 'poster-added.jpg', 'clip-scan.mp4', 'poster-scan.jpg',
  'clip-insights.mp4', 'poster-insights.jpg', 'clip-invest.mp4', 'poster-invest.jpg', 'activity-today.png', 'subscriptions.png',
])

const IN = {
  media: (file: string) => `/landing/${file}`,
  categories: CATEGORIES,
  habits: ['4pm chai', 'Friday cab home', 'Sunday groceries', 'morning metro'],
  learns: {
    item: 'Chai', amount: 20, envelope: '🍪 Snacks', of: 600, pay: 'UPI',
    ask: 'Afternoon chai?', body: 'Time for your Tuesday chai fix? Tap Log and it’s in.', done: 'Chai is in. Nice one.',
    habit: 'Chai on Tuesdays, around 4pm', other: ['Metro card', 100] as [string, number],
  },
  cabHome: 240,
  investments: 'Equity, FDs, gold and crypto',
  playItem: 'Coffee with Sam', playAmount: ['1', '8', '0'],
  // Mobile's capture tip example (log-expense.tsx CAPTURE_TIP_COPY).
  batchExample: 'auto 240, lunch 150',
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
    rows: [['Paneer Biryani', 'Split 3 ways', '₹380'], ['Gobi Manchurian', 'Split 2 ways', '₹155'], ['Coke Tin 330 ML', 'Split 2 ways', '₹133']] as [string, string, string][],
    bill: '₹1,725.70', shared: '2 or 3 ways', share: '₹672.96', envelope: 'Eating out',
    sr: 'A ₹1,725.70 Meghana Foods bill is scanned. Aviary reads every line, you mark which items were shared two or three ways, and it logs your ₹672.96 share to Eating out.',
  },
  added: 'Added ₹150 for Bike to office. Metro has ₹960 left of ₹1,110.',
  notice: {
    quote: '“Bike to office? Log it while it’s fresh.”',
    steps: ['Noticed it’s Friday, 9:15am, like the last three', 'Filled in Bike to office · Metro · ₹150 · UPI', 'Logged with one tap on the notification', 'Metro has ₹960 left this month'],
    label: 'Today in Aviary',
    alt: 'Today’s logs in the app: Bike to office ₹150, Shopping ₹1,500, Trip with friends ₹1,500, Electricity ₹6,000, Groceries ₹5,000, Gym membership ₹1,500.',
  },
  headsUp: '₹199 due in 3 days (Oct 28).',
}

export type Sample = typeof IN

const INTL: Sample = {
  media: (file) => `/landing/${INTL_MEDIA.has(file) ? 'intl/' : ''}${file}`,
  categories: CATEGORIES_INTL,
  habits: ['4pm coffee', 'Friday ride home', 'Sunday groceries', 'morning bus'],
  learns: {
    item: 'Coffee', amount: 4, envelope: '🍪 Snacks', of: 60, pay: 'Card',
    ask: 'Afternoon coffee?', body: 'Time for your Tuesday coffee fix? Tap Log and it’s in.', done: 'Coffee is in. Nice one.',
    habit: 'Coffee on Tuesdays, around 4pm', other: ['Bus fare', 2.75] as [string, number],
  },
  cabHome: 18,
  investments: 'Stocks, savings, gold and crypto',
  playItem: 'Coffee with Sam', playAmount: ['6'],
  batchExample: 'bus 3, lunch 15',
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
    alt: 'This week’s logs in the app: Coffee with Sam $6, Bus Fare $3, Movie tickets $50, Commute $20, Coffee $4, Rent $1,500.',
  },
  headsUp: '$15.49 due in 3 days (Oct 28).',
}

const SampleContext = createContext(IN)

/** `intl` is any visitor outside India (see app/page.tsx). */
export function SampleScope({ intl, children }: { intl: boolean; children: ReactNode }) {
  return <SampleContext.Provider value={intl ? INTL : IN}>
    <CurrencyScope code={intl ? 'USD' : 'INR'}>{children}</CurrencyScope>
  </SampleContext.Provider>
}
export function useSample() { return useContext(SampleContext) }
