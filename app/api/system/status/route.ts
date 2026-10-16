import { json } from '@/lib/http'
import { getSystemSettings } from '@/lib/systemSettings'

export const dynamic = 'force-dynamic'

// The same for everyone, so Vercel's CDN can answer it without waking a
// function. A switch flipped in admin reaches clients within about a minute
// (CDN 30s, stale 30s, settings' own 30s in-process cache). The AI kill switch
// is still enforced on the AI routes themselves; this only drives the UI.
// Only requests without an Authorization header are cached: Mobile sends this
// one anonymously, older builds still send a token and keep missing.
const CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=30'

/** Public, unauthenticated: what every client needs to know about system state before calling anything else. */
export async function GET() {
  const { aiDisabled, maintenance, appUpdate } = await getSystemSettings()
  return json(
    {
      aiDisabled,
      maintenance: maintenance.on ? { on: true, message: maintenance.message } : { on: false, message: '' },
      appUpdate,
    },
    { headers: { 'Cache-Control': CACHE_CONTROL } },
  )
}
