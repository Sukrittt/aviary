'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { CurrencyScope } from '@/src/context/CurrencyContext'
import { CATEGORIES, CATEGORIES_INTL } from './mobile/demo'

/**
 * The landing's sample data, by where the visitor is. India sees rupees, chai and UPI;
 * everyone else sees dollars and examples that read anywhere. Screen recordings
 * (clip-*.mp4, activity-today.png, subscriptions.png) are still India-only, so the
 * copy that describes them stays with them in Nudges.tsx.
 */

const IN = {
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
}

export type Sample = typeof IN

const INTL: Sample = {
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
}

const SampleContext = createContext(IN)

/** `intl` is any visitor outside India (see app/page.tsx). */
export function SampleScope({ intl, children }: { intl: boolean; children: ReactNode }) {
  return <SampleContext.Provider value={intl ? INTL : IN}>
    <CurrencyScope code={intl ? 'USD' : 'INR'}>{children}</CurrencyScope>
  </SampleContext.Provider>
}
export function useSample() { return useContext(SampleContext) }
