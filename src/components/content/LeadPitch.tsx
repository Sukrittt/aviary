import { TrackedLink } from '@/src/components/TrackedLink'

/**
 * The one email signup on the public site: a line pointing at the planner that
 * emails your split. Landing hero and close, and every content page's SoftCta.
 * `intl` points at the currency-free paycheck planner. Never call it a newsletter.
 */
export function LeadPitch({ intl = false, placement }: { intl?: boolean; placement: string }) {
  return <span className="lp-hero-note lp-hero-note--tight">
    Not ready yet? <TrackedLink href={intl ? '/tools/paycheck-budget-planner' : '/tools/salary-budget-planner'} event="lead_pitch_clicked" properties={{ placement }}>Get your {intl ? 'paycheck' : 'salary'} split by email</TrackedLink> in a minute, without a spreadsheet.
  </span>
}
