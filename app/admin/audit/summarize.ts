export interface Change {
  label: string
  from: unknown
  to: unknown
}

export type Tone = 'good' | 'bad' | 'warn' | undefined

/** Friendly name and badge tone for each action recorded by `audit()`. Unknown actions fall back to the raw string. */
export const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  'system.settings': { label: 'System settings', tone: undefined },
  'job.run': { label: 'Job run', tone: undefined },
  'user.update': { label: 'User edited', tone: undefined },
  'user.revoke_sessions': { label: 'Sessions revoked', tone: 'warn' },
  'user.soft_delete': { label: 'Deletion scheduled', tone: 'warn' },
  'user.restore': { label: 'Account restored', tone: 'good' },
  'user.hard_delete': { label: 'Account deleted', tone: 'bad' },
  'billing.extend_trial': { label: 'Trial extended', tone: 'good' },
  'billing.gift_grant': { label: 'Plan gifted', tone: 'good' },
  'billing.gift_revoke': { label: 'Gift revoked', tone: 'warn' },
  'billing.tester': { label: 'Billing tester', tone: undefined },
  'billing.resync': { label: 'Purchases re-synced', tone: undefined },
}

const LABELS: Record<string, string> = {
  aiDisabled: 'AI kill switch',
  aiMonthlyCostUsd: 'AI monthly cap (USD)',
  'maintenance.on': 'Maintenance banner',
  'maintenance.message': 'Banner message',
  'appUpdate.android.latestVersion': 'Android latest version',
  'appUpdate.android.minVersion': 'Android minimum version',
  'appUpdate.android.storeUrl': 'Play Store URL',
  'billing.enforced': 'Billing enforced',
  'billing.purchaseEnabled': 'Purchases enabled',
  'billing.audience': 'Billing audience',
  'billing.retentionDeleteEnabled': 'Retention deletes',
  billingTester: 'Billing tester',
  name: 'Name',
  currencyCode: 'Currency',
  notifyCadence: 'Digest cadence',
  notifyBillLeadDays: 'Bill lead days',
  notifyThresholds: 'Budget alerts',
  notifyBills: 'Bill reminders',
  notifyCoach: 'Coach nudges',
  notifyWrapped: 'Wrapped',
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Every leaf of `value` keyed by dotted path. Arrays count as leaves. */
function flatten(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (isObject(value)) for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  else if (prefix) out[prefix] = value
  return out
}

const label = (path: string) => LABELS[path] ?? path

/** Leaves that differ between two objects, in `to`'s key order. A leaf missing on one side reads as `undefined`. */
export function diff(from: unknown, to: unknown): Change[] {
  const a = flatten(from)
  const b = flatten(to)
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((path) => JSON.stringify(a[path]) !== JSON.stringify(b[path]))
    .map((path) => ({ label: label(path), from: a[path], to: b[path] }))
}

/** Changes for the actions that carry a before/after: system.settings ({from,to}) and user.update ({changes}). */
export function changesOf(action: string, detail: Record<string, unknown>): Change[] | null {
  if (action === 'system.settings') return diff(detail.from, detail.to)
  if (action === 'user.update' && isObject(detail.changes)) {
    return Object.entries(detail.changes).map(([key, c]) => ({ label: label(key), from: isObject(c) ? c.from : undefined, to: isObject(c) ? c.to : c }))
  }
  return null
}

/** Remaining detail as label/value pairs, for actions without a before/after. */
export function factsOf(detail: Record<string, unknown>): { label: string; value: string }[] {
  return Object.entries(flatten(detail)).map(([path, v]) => ({ label: path, value: fmtValue(v) }))
}

export function fmtValue(v: unknown): string {
  if (v === undefined) return 'unset'
  if (v === null) return 'none'
  if (v === '') return 'empty'
  if (typeof v === 'boolean') return v ? 'on' : 'off'
  return typeof v === 'string' ? v : JSON.stringify(v)
}
