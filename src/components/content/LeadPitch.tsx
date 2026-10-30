'use client'

import { TrackedLink } from '@/src/components/TrackedLink'
import { useIntlMarket } from '@/src/hooks/useIntlMarket'

/**
 * The one email signup on the public site: a line pointing at the planner that
 * emails your split. Landing hero and close, and every content page's SoftCta.
 * `intl`, or an intl visitor on any other page, gets the currency-free paycheck
 * planner. Never call it a newsletter.
 */
export function LeadPitch({ intl = false, placement }: { intl?: boolean; placement: string }) {
  const paycheck = useIntlMarket() || intl
  return <span className="lp-hero-note lp-hero-note--tight">
    Not ready yet? <TrackedLink href={paycheck ? '/tools/paycheck-budget-planner' : '/tools/salary-budget-planner'} event="lead_pitch_clicked" properties={{ placement }}>Get your {paycheck ? 'paycheck' : 'salary'} split by email</TrackedLink> in a minute, without a spreadsheet.
  </span>
}
