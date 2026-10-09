import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every API route must be a deliberate decision: gated behind a subscription,
 * or explicitly open. The failure mode this exists to prevent is silent — a
 * route added six months from now that nobody remembers to gate, leaking full
 * app access to an expired account, with no test going red to say so.
 *
 * A new route fails this test until it is either given `requireAccess` or
 * listed below with a reason. That is the point: the list is the record of
 * why each open route is open.
 */

/** Routes with no subscription gate, and why each one stays reachable. */
const OPEN: Record<string, string> = {
  // Server-to-server. No user session at all; each does its own secret check.
  'cron/billing': 'cron, CRON_SECRET',
  'cron/gc': 'cron, CRON_SECRET',
  'cron/emails': 'transactional email retry cron, CRON_SECRET',
  'cron/evening-check': 'evening check push cron, CRON_SECRET',
  'notifications/run': 'cron, CRON_SECRET',
  'billing/webhooks/revenuecat': 'provider webhook, shared secret',
  'billing/webhooks/razorpay': 'provider webhook, HMAC signature',
  'billing/webhooks/paypal': 'provider webhook, verified with PayPal',

  // Signing in cannot require a subscription — that is how someone reaches
  // the screen that sells them one.
  'auth/google': 'sign-in',
  'auth/google/callback': 'sign-in',
  'auth/magic-auth/send': 'sign-in',
  'auth/magic-auth/verify': 'sign-in',
  'auth/verify': 'session check',

  // The purchase path itself, and the action that starts the trial.
  'billing/status': 'tells the client it needs to subscribe',
  'billing/sync': 'how a purchase is recognised',
  'billing/razorpay/plans': 'public prices, shown before anyone buys',
  'billing/razorpay/subscribe': 'how an expired account pays',
  'billing/razorpay/verify': 'how a web purchase is recognised',
  'billing/razorpay/cancel': 'stopping renewal must work while expired too',
  'billing/paypal/subscribe': 'how an expired account outside India pays',
  'billing/paypal/verify': 'how a PayPal purchase is recognised',
  'onboarding/complete': 'starts the trial; gating it would need the trial it creates',

  // Account controls stay available to someone who has stopped paying.
  user: 'profile, and account deletion',
  'user/email': 'account control',
  'user/email/resend': 'account control',
  'user/email/verify': 'account control',
  'user/identities': 'account control',
  'user/restore': 'undo an account deletion',
  'user/sessions': 'sign out of a lost device',

  // The exit route. pricing.md promises export without a subscription, so
  // every step of it — request, list, download — has to work while expired.
  'data/export': 'exit route (pricing.md)',
  'data/exports': 'exit route (pricing.md)',
  'data/exports/[id]/download': 'exit route (pricing.md)',

  // The two reads an expired user is still entitled to.
  'privacy/proof': 'shows how their data is stored; no budgeting content',
  'system/status': 'public; maintenance banner and update prompt',
  'changelog/latest': 'signed-in release notes; no budgeting content',
  'changelog/[id]/seen': 'account-level release announcement tracking, available while expired',
  waitlist: 'public landing-page signup; no session, no budgeting content',
  'notifications/register': 'a device must be able to register to receive the "your trial ended" push',
}

function routeDirs(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeDirs(full, prefix ? `${prefix}/${entry}` : entry))
    else if (entry === 'route.ts') out.push(prefix)
  }
  return out
}

const API_DIR = join(import.meta.dirname, '../../app/api')
const routes = routeDirs(API_DIR)
const isGated = (route: string) => readFileSync(join(API_DIR, route, 'route.ts'), 'utf8').includes('requireAccess')

describe('subscription enforcement coverage', () => {
  it('finds the API routes at all', () => {
    expect(routes.length).toBeGreaterThan(40)
  })

  it.each(routes)('%s is either gated or listed as open', (route) => {
    const listed = route in OPEN
    const gated = isGated(route)
    expect(
      gated !== listed,
      gated && listed
        ? `${route} calls requireAccess but is also listed as open — remove one.`
        : `${route} has no subscription gate. Add requireAccess(auth) to each handler, or add it to OPEN in this file with the reason it must stay reachable.`,
    ).toBe(true)
  })

  it('has no stale entries in the open list', () => {
    expect(Object.keys(OPEN).filter((r) => !routes.includes(r))).toEqual([])
  })

  it('gates every handler in a gated route, not just the first', () => {
    const missed = routes.filter((route) => {
      if (!isGated(route)) return false
      const source = readFileSync(join(API_DIR, route, 'route.ts'), 'utf8')
      // Every handler resolves the caller with getAuth; each of those must be
      // followed by a gate. A route that gates GET but forgets DELETE is the
      // easy mistake, and it is the expensive one.
      return (source.match(/await getAuth\(req\)/g) ?? []).length !== (source.match(/await requireAccess\(auth(?:, \{ setup: true \})?\)/g) ?? []).length
    })
    expect(missed).toEqual([])
  })
})
