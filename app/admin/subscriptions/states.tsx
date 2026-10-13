import { SealCheckIcon, ProhibitIcon, GiftIcon, HourglassIcon, type PhosphorIcon } from '@/src/components/icons'
import type { Access } from '@/lib/billing/access'

/** The four things an account can be, in the order they appear everywhere on this page. */
export type State = 'trial' | 'paid' | 'gift' | 'expired'
export const STATE_ORDER: State[] = ['trial', 'paid', 'gift', 'expired']

/**
 * One hue per state, carried by a `--tone` custom property rather than a
 * per-component colour. The KPI card, the share bar, the runway chart, the
 * table badge and the dialog then all read the same variable, so a state can
 * never be blue in one place and orange in another.
 */
export const STATES: Record<State, { label: string; icon: PhosphorIcon; note: string }> = {
  trial: { label: 'Trial', icon: HourglassIcon, note: 'Inside the free 45 days' },
  paid: { label: 'Paid', icon: SealCheckIcon, note: 'Verified store purchase' },
  gift: { label: 'Gifted', icon: GiftIcon, note: 'Granted here, nothing paid' },
  expired: { label: 'Expired', icon: ProhibitIcon, note: 'Locked out once enforced' },
}

/** The resolved mode with gifts split out of `paid` — a gift is access, not revenue. */
export function stateOf(access: Access): State {
  if (access.gifted) return 'gift'
  if (access.mode === 'paid') return 'paid'
  if (access.mode === 'trial') return 'trial'
  return 'expired'
}

export function StateBadge({ state, size = 13 }: { state: State; size?: number }) {
  const { label, icon: Icon } = STATES[state]
  return (
    <span className={`adm-badge adm-tone t-${state}`}>
      <Icon size={size} /> {label}
    </span>
  )
}
