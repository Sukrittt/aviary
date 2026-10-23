import { after } from 'next/server'

/**
 * Server-side PostHog capture for events only the server can see (a new
 * account, a referral reward). Plain `fetch` to the capture API, no SDK.
 * Same project and key as the clients, so `distinctId` (the WorkOS id) joins
 * the person the apps already identify. Production deploys only, like the
 * clients, and never throws: losing an event isn't worth a failed sign-in.
 */
export async function captureServer(distinctId: string, event: string, properties: Record<string, unknown> = {}): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || process.env.VERCEL_ENV !== 'production') return false
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
  try {
    const res = await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: key, event, distinct_id: distinctId, properties: { ...properties, $lib: 'aviary-server' }, timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

/** `captureServer` after the response is sent. Outside a request (scripts, tests) it just runs. */
export function captureLater(distinctId: string, event: string, properties: Record<string, unknown> = {}): void {
  try {
    after(() => captureServer(distinctId, event, properties))
  } catch {
    void captureServer(distinctId, event, properties)
  }
}
