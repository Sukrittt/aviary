import { NextResponse } from 'next/server'
import { getDb } from './mongodb'
import { scoped, type ScopedCollection } from './scoped'
import type { Auth } from './access'

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init)
}

export function error(msg: string, status = 400): NextResponse {
  return NextResponse.json({ error: msg }, { status })
}

/** Escape a string for safe use inside a RegExp literal. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Parse a JSON request body, tolerating empty/malformed bodies (as the legacy
 * middleware did). Typed as `Record<string, unknown>` — the old
 * `Record<string, string | number>` return type was a lie: `req.json()` can
 * return an array, a nested object, or anything else JSON allows, so callers
 * got false static assurance about the shape. Every call site already
 * `String(...)`-coerces before using a value (or explicitly narrows with a
 * `typeof` check), so this widening doesn't change behavior.
 */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json()
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Resolve a Mongo collection, scoped to the requesting user. The returned
 * handle injects `user_id` into every filter and insert, so handlers cannot
 * reach another user's documents — see `lib/scoped.ts`.
 */
export async function getCollection(base: string, auth: Auth): Promise<ScopedCollection> {
  const db = await getDb()
  return scoped(db.collection(base), auth.userId)
}

/** Force handlers to run dynamically (never prerendered at build time). */
export const dynamic = 'force-dynamic'

/** Parsed `page`/`limit` query params, 1-based page, clamped `limit`. */
export type PageParams = { page: number; limit: number }

/** Parse `?page=&limit=` off a URL, clamping limit to `[1, maxLimit]`. */
export function parsePageParams(url: URL, opts: { defaultLimit: number; maxLimit: number }): PageParams {
  const rawPage = Number(url.searchParams.get('page'))
  const page = Number.isSafeInteger(rawPage) ? Math.min(Math.floor(Number.MAX_SAFE_INTEGER / opts.maxLimit), Math.max(1, rawPage)) : 1
  const limit = Math.min(
    opts.maxLimit,
    Math.max(1, Math.floor(Number(url.searchParams.get('limit'))) || opts.defaultLimit),
  )
  return { page, limit }
}

/** `{page, pageCount}` for a `total`-row result under the given `page`/`limit`. */
export function pageMeta(total: number, page: number, limit: number): { page: number; pageCount: number } {
  return { page, pageCount: Math.max(1, Math.ceil(total / limit)) }
}

/** Zone used for users with no `timezone` on their doc — every account predating per-user zones was IST. */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function zoneParts(tz: string | undefined, at: Date): Record<string, string> {
  const zone = isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

/**
 * Current instant as wall-clock date/timestamp strings in `tz` (an IANA name),
 * offset-suffixed like `2026-04-01T01:30:00+05:30`. Unset/invalid `tz` is IST.
 */
// Keep in sync with Mobile/src/lib/date.ts.
export function nowIn(tz?: string, at: Date = new Date()): { date: string; timestamp: string } {
  const p = zoneParts(tz, at)
  const local = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
  const offsetMin = Math.round((Date.parse(`${local}Z`) - Math.floor(at.getTime() / 1000) * 1000) / 60000)
  const sign = offsetMin < 0 ? '-' : '+'
  const abs = Math.abs(offsetMin)
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return { date: `${p.year}-${p.month}-${p.day}`, timestamp: `${local}${offset}` }
}

/** IST now — for system-level stamps with no owning user (admin, exports, GC). Per-user code uses `nowIn(user.timezone)`. */
export function nowIST(): { date: string; timestamp: string } {
  return nowIn(DEFAULT_TIMEZONE)
}
