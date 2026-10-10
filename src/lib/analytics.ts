// Product analytics. Twin of Mobile/src/lib/analytics.ts: one PostHog client
// for the whole app, the same event names, and the same PostHog project, so a
// person who uses both apps is one person and every chart can split by
// `platform`.
//
// Differences from mobile, all deliberate:
// - No key or a non-production deploy means no analytics, not a thrown error.
//   Preview deploys and local runs should keep working, and nothing here is
//   worth breaking a page over.
// - Autocapture is off. It records the text of whatever was clicked, and on
//   this app that's amounts, item names and envelope names.
// - Pageviews carry the path only. Query strings can hold dates and ids, so
//   they're dropped from the URL after PostHog has read the UTM tags out of it.
// - posthog-js is imported lazily: it's ~290 KB of script that every page,
//   the landing page included, used to parse before it could respond to input.
//   Calls made while it loads are queued and replayed once it's ready.
import type { PostHog } from 'posthog-js'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ''
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
// Vercel sets this on every deploy: 'production', 'preview' (staging and PR
// branches) or unset locally. Only production reports, so test clicks never
// land in real funnels.
const IS_PRODUCTION = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'

/**
 * Every product event the app sends. A union rather than a bare string so a
 * typo becomes a type error instead of a junk event nobody notices for a
 * month. Add a name here first, then call track(). Kept identical to mobile's
 * union so one event means one thing across both apps, even where only one
 * app can send it (restore_* is Play only).
 */
export type AppEvent =
  // Sign-in. `method` is 'google' or 'email'; `reason` is a fixed slug, never
  // the raw error text.
  | 'sign_in_started'
  | 'sign_in_code_sent'
  | 'sign_in_failed'
  | 'sign_in_completed'
  // Setup wizard. One page with five internal steps, so pageviews alone can't
  // show which step people leave on. These can.
  | 'onboarding_started'
  | 'onboarding_step_viewed'
  | 'onboarding_step_completed'
  | 'onboarding_back_tapped'
  | 'onboarding_failed'
  | 'onboarding_completed'
  | 'tour_started'
  | 'tour_step_viewed'
  | 'tour_skipped'
  | 'tour_completed'
  // Money in and out
  | 'expense_logged'
  | 'expense_edited'
  | 'expense_deleted'
  | 'ai_category_suggested'
  | 'money_moved'
  | 'envelope_created'
  | 'duplicates_resolved'
  // Bill scanning, start to finish
  | 'bill_scan_started'
  | 'bill_scanned'
  | 'bill_scan_failed'
  // Ask Aviary
  | 'money_brain_opened'
  | 'money_brain_query'
  // Logging spends by typing them into Ask Aviary: a review card was shown,
  // logged, or dismissed. Row counts and edit counts only.
  | 'capture_proposed'
  | 'capture_logged'
  | 'capture_tip'
  | 'capture_dismissed'
  // The weekly balance check: what a check found and how many accounts it
  // totalled, and how a gap was explained. No amounts.
  | 'balance_checked'
  | 'balance_resolved'
  | 'money_brain_answered'
  | 'ai_allowance_hit'
  // Other features
  | 'recurring_created'
  | 'income_added'
  | 'recurring_income_created'
  | 'account_created'
  | 'recurring_suggestion_accepted'
  | 'recurring_suggestion_dismissed'
  | 'holding_added'
  | 'subscription_added'
  | 'wrapped_opened'
  | 'wrapped_card_viewed'
  | 'wrapped_shared'
  | 'week_recap_opened'
  | 'week_recap_finished'
  // Paying
  | 'paywall_viewed'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_cancelled'
  | 'purchase_failed'
  | 'restore_tapped'
  | 'restore_succeeded'
  // Notifications
  | 'push_permission_result'
  | 'push_registration_failed'
  | 'notification_opened'
  // Account
  | 'data_exported'
  | 'account_deleted'
  // Web only: the landing page's way into the app store
  | 'store_cta_clicked'
  // Web only: the landing page's iPhone waitlist form. `waitlist_platform` is
  // 'ios'. Not `platform`: that's the registered app split and stays 'web'.
  | 'waitlist_joined'

export type EventProperties = Record<string, string | number | boolean>

let client: PostHog | null = null
let loading: Promise<void> | null = null
const queued: ((posthog: PostHog) => void)[] = []

/**
 * Run against the client once it exists. Before init, or without a key, the
 * call is dropped; while the script is loading, it waits in line.
 * Telemetry never takes down the thing it's measuring: these calls sit in
 * mutation success handlers, where a throw would read as the save failing.
 */
function send(fn: (posthog: PostHog) => void): void {
  if (typeof window === 'undefined') return
  if (!client) {
    if (loading) queued.push(fn)
    return
  }
  try {
    fn(client)
  } catch {
    // Losing an event isn't worth a broken page.
  }
}

/**
 * Start the client. Called once from AnalyticsProvider on mount; a second call
 * is a no-op. Does nothing on the server, without a key, or outside production.
 */
export function initAnalytics(): Promise<void> {
  if (loading) return loading
  if (typeof window === 'undefined' || !KEY || !IS_PRODUCTION) return Promise.resolve()
  loading = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        // Next's router moves with pushState, which a plain page-load capture
        // would miss after the first page.
        capture_pageview: 'history_change',
        capture_pageleave: true,
        autocapture: false,
        disable_session_recording: true,
        // Nothing here uses surveys, and leaving them on downloads another
        // script from PostHog's CDN on every page load.
        disable_surveys: true,
        // Anonymous visitors (the landing page, the read-only demo) still count
        // in funnels, without each one costing a person profile.
        person_profiles: 'identified_only',
        before_send: (event) => {
          if (!event) return event
          // The sign-in flow carries the email in the URL (/code?email=…), and a
          // full navigation afterwards hands that URL on as the referrer.
          for (const bag of [event.properties, event.$set, event.$set_once]) {
            if (!bag) continue
            for (const key of URL_PROPERTIES) {
              if (typeof bag[key] === 'string') bag[key] = stripQuery(bag[key])
            }
          }
          return event
        },
      })
      posthog.register({ platform: 'web' })
      client = posthog
      for (const fn of queued.splice(0)) send(fn)
    })
    .catch(() => {
      // Blocked by an ad blocker or offline: analytics just stays off, and
      // later calls are dropped rather than queued for a client that won't come.
      queued.length = 0
      loading = null
    })
  return loading
}

/** Whether calls are being queued right now, waiting on the script to load. */
export function isAnalyticsLoading(): boolean {
  return loading !== null && client === null
}

/** Starts initialization if needed, including before the provider's effect. */
export function analyticsReady(): Promise<void> {
  return initAnalytics()
}

/** Every property PostHog fills with a URL, on the event or the person. */
const URL_PROPERTIES = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer'] as const

/** `https://x/expense?date=…` → `https://x/expense`. Leaves anything unparseable alone. */
export function stripQuery(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return url
  }
}

/**
 * Properties are for segmenting, never for identifying. Amounts, item names
 * and merchant strings stay out: they are the sensitive half of this app's
 * data and analytics is the wrong place for them.
 */
export function track(event: AppEvent, properties?: EventProperties): void {
  if (process.env.NODE_ENV === 'development') {
    console.info(`[analytics] ${event}`, properties ?? {})
  }
  send((posthog) => posthog.capture(event, properties))
}

/**
 * Stamp a person property the first time it happens and never again, e.g.
 * `first_expense_at`. Rides on an ordinary event through PostHog's `$set_once`.
 */
export function trackFirst(event: AppEvent, personProperty: string, properties?: EventProperties): void {
  // The timestamp is taken now, not when a queued call finally runs.
  const at = new Date().toISOString()
  send((posthog) => posthog.capture(event, { ...properties, $set_once: { [personProperty]: at } }))
}

/** Start a stopwatch; the returned function reads whole seconds elapsed. */
export function startTimer(): () => number {
  const startedAt = Date.now()
  return () => Math.round((Date.now() - startedAt) / 1000)
}

/** Properties sent with every event from now on (`plan_status`). */
export function setEventContext(properties: EventProperties): void {
  send((posthog) => posthog.register(properties))
}

/**
 * Tie events to the signed-in account. The id is the WorkOS user id, the same
 * one mobile identifies with, so both apps land on one person. Name and email
 * go on the person record so the dashboard shows a human.
 */
export function identifyUser(user: { id: string; email?: string | null; name?: string | null }): void {
  const properties: Record<string, string> = {}
  if (user.email) properties.email = user.email
  if (user.name) properties.name = user.name
  send((posthog) => posthog.identify(user.id, properties))
}

/** On sign-out: the next account on this browser starts clean. reset() also
 * clears registered properties, so platform goes straight back on. */
export function resetAnalytics(): void {
  send((posthog) => {
    posthog.reset()
    posthog.register({ platform: 'web' })
  })
}

/**
 * Google sign-in finishes on the server (app/api/auth/google/callback), where
 * there's no PostHog. The callback leaves the outcome in this short-lived
 * cookie, `completed` or a failure reason slug, and AnalyticsProvider reports it.
 */
export const SIGN_IN_OUTCOME_COOKIE = 'sign_in_outcome'

/** Whether analytics is currently allowed to send events. */
export function isAnalyticsEnabled(): boolean {
  return client !== null && !client.has_opted_out_capturing()
}

/** Turn analytics on or off for this browser. PostHog persists the choice. */
export function setAnalyticsEnabled(enabled: boolean): void {
  send((posthog) => (enabled ? posthog.opt_in_capturing() : posthog.opt_out_capturing()))
}
