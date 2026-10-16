import { json } from '@/lib/http'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

/**
 * Pinged every 5 minutes by .github/workflows/keep-warm.yml so the function
 * serving the core API stays booted, with its Mongo pool connected. Without it
 * the first request after ~10 idle minutes paid a 1.9s cold start.
 *
 * Public on purpose: it reads nothing and returns nothing but `ok`, so a
 * stranger calling it only keeps the function warm for us. A failed DB ping
 * still answers 200, so the pinger never pages anyone about Atlas.
 */
export async function GET() {
  const db = await (await getDb()).command({ ping: 1 }).then(() => true, () => false)
  return json({ ok: true, db }, { headers: { 'Cache-Control': 'no-store' } })
}
