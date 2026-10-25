import { NextResponse } from 'next/server'
import { ATTRIBUTION_COOKIE, attributionFromRequest, nextAttribution, parseAttribution, playStoreUrl, readCookie } from '@/lib/attribution'

/**
 * The Play listing with this visitor's source in the install referrer, so an
 * Android signup that started on the web keeps its source. Landing CTAs link
 * here instead of straight to Play. Tagged links work on their own too:
 * `/get/android?utm_source=reddit` is a Play link that reports as reddit.
 */
export function GET(req: Request) {
  const url = new URL(req.url)
  const raw = readCookie(req.headers.get('cookie'), ATTRIBUTION_COOKIE)
  const current = raw ? parseAttribution(raw) : null
  const attr = nextAttribution(current, attributionFromRequest(url, req.headers.get('referer'))) ?? current ?? {}
  return NextResponse.redirect(playStoreUrl(attr), 302)
}
