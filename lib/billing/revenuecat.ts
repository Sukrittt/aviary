/**
 * RevenueCat, server side.
 *
 * The only place that talks to the provider. Clients never authorize
 * anything: a device's `CustomerInfo` is a hint that something changed, and
 * this is what the change is checked against.
 *
 * Uses the v1 subscriber endpoint deliberately. It is keyed by the app user
 * id — which for us is the WorkOS user id — so no project id or customer
 * lookup is needed, and it returns the computed `entitlements` map rather
 * than raw store receipts.
 */
import { BillingProviderError } from './providerError'

/** RevenueCat entitlement identifier, configured in the RevenueCat dashboard. */
export const ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID ?? 'aviary_pro'

const API_BASE = 'https://api.revenuecat.com/v1'
const TIMEOUT_MS = 10_000

/** The subscriber fields this app reads. RevenueCat returns considerably more. */
export interface RcEntitlement {
  expires_date: string | null
  purchase_date: string
  product_identifier: string
  product_plan_identifier?: string | null
  grace_period_expires_date?: string | null
}

export interface RcSubscription {
  expires_date: string | null
  purchase_date: string
  original_purchase_date: string
  store: string
  is_sandbox: boolean
  unsubscribe_detected_at: string | null
  billing_issues_detected_at: string | null
  auto_resume_date?: string | null
  refunded_at?: string | null
  period_type: string
  product_plan_identifier?: string | null
  store_transaction_id?: string | null
  original_store_transaction_id?: string | null
}

export interface RcSubscriber {
  original_app_user_id: string
  entitlements: Record<string, RcEntitlement>
  subscriptions: Record<string, RcSubscription>
  management_url: string | null
}

export class RevenueCatError extends BillingProviderError {}

function secretKey(): string {
  const key = process.env.REVENUECAT_SECRET_KEY
  if (!key) throw new RevenueCatError('REVENUECAT_SECRET_KEY is not set', 0)
  return key
}

/**
 * Current provider truth for one app user id.
 *
 * Returns null only for 404 — RevenueCat genuinely has no record of this
 * customer, which is the normal answer for anyone who has never purchased.
 * Every other failure throws: a timeout or a 500 means we do not know, and
 * "we do not know" must never be written down as "not subscribed".
 */
export async function fetchSubscriber(appUserId: string): Promise<RcSubscriber | null> {
  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${secretKey()}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (err) {
    throw new RevenueCatError(`RevenueCat request failed: ${(err as Error).message}`, 0)
  }

  if (resp.status === 404) return null
  if (!resp.ok) throw new RevenueCatError(`RevenueCat responded ${resp.status}`, resp.status)

  const body = (await resp.json()) as { subscriber?: RcSubscriber }
  if (!body.subscriber) throw new RevenueCatError('RevenueCat response had no subscriber', resp.status)
  return body.subscriber
}
