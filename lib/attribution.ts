/**
 * Where a new account came from. Captured on first landing (middleware sets
 * `aviary_attr`) or from the Play install referrer (Mobile sends it as the
 * `x-aviary-attribution` header), stored once on the user doc when the account
 * is created, and sent to PostHog as `user_signed_up`.
 *
 * Runs in middleware too, so nothing here may touch Node APIs.
 */
export const ATTRIBUTION_COOKIE = 'aviary_attr'
export const ATTRIBUTION_HEADER = 'x-aviary-attribution'
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'

const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'referrer_domain', 'landing_path', 'referral_code'] as const
type Field = (typeof FIELDS)[number]
export type Attribution = Partial<Record<Field, string>>
export type Platform = 'web' | 'android'
export type SignupSource = Attribution & { platform: Platform }

const MAX = 64
/** A referral or creator code: letters and digits only, compared uppercase. */
export const REFERRAL_CODE = /^[A-Z0-9]{3,16}$/

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.replace(/[^\w.:/ +-]/g, '').trim().slice(0, MAX)
  return v || undefined
}

function compact(a: Attribution): Attribution {
  const out: Attribution = {}
  for (const f of FIELDS) {
    const v = clean(a[f])
    if (v) out[f] = v
  }
  return out
}

function domainOf(url: string | null): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, '') || undefined
  } catch {
    return undefined
  }
}

/** What this page view says about where the visitor came from. */
export function attributionFromRequest(url: URL, referer: string | null): Attribution {
  const q = url.searchParams
  const a: Attribution = {
    utm_source: q.get('utm_source') ?? undefined,
    utm_medium: q.get('utm_medium') ?? undefined,
    utm_campaign: q.get('utm_campaign') ?? undefined,
    landing_path: url.pathname,
  }
  const from = domainOf(referer)
  if (from && from !== url.hostname.replace(/^www\./, '')) a.referrer_domain = from

  const ref = q.get('ref')?.trim().toUpperCase()
  // The pre-referral "Invite a friend" link shares `/?ref=invite`.
  if (ref === 'INVITE') {
    a.utm_source ??= 'invite'
    a.utm_medium ??= 'share'
  } else if (ref && REFERRAL_CODE.test(ref)) {
    a.referral_code = ref
  }
  return compact(a)
}

/** A visit whose link carries any utm tag or a code. An untagged visit only says where the browser was before. */
function isTagged(a: Attribution): boolean {
  return !!(a.utm_source || a.utm_medium || a.utm_campaign || a.referral_code)
}

/**
 * The cookie to write for this visit, or null to leave the current one.
 * A tagged link wins (the paid post or code that brought them back), an
 * untagged visit only fills an empty cookie.
 */
export function nextAttribution(current: Attribution | null, visit: Attribution): Attribution | null {
  if (isTagged(visit)) return visit
  return current ? null : visit
}

export function parseAttribution(raw: string | null | undefined): Attribution {
  if (!raw || raw.length > 1024) return {}
  try {
    const v: unknown = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? compact(v as Attribution) : {}
  } catch {
    return {}
  }
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(cookieHeader ?? '')
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}

/**
 * What a sign-in request knows about the new account's source: the app's
 * header first (it carries the Play install referrer), else the web cookie.
 * `platform` comes from who's asking: the app sends the header or a Bearer
 * token, a browser sends neither.
 */
export function readAttribution(req: Request, platform?: Platform): SignupSource {
  const header = req.headers.get(ATTRIBUTION_HEADER)
  if (header !== null) return { ...parseAttribution(header), platform: 'android' }
  const isApp = platform === 'android' || /^Bearer\s/i.test(req.headers.get('authorization') ?? '')
  if (isApp) return { platform: 'android' }
  return { ...parseAttribution(readCookie(req.headers.get('cookie'), ATTRIBUTION_COOKIE)), platform: 'web' }
}

/** One value to break signups down by. */
export function sourceOf(a: Attribution): string {
  return a.utm_source ?? (a.referral_code ? 'referral' : a.referrer_domain ?? 'direct')
}

/**
 * The Play listing, carrying this visitor's source in the install referrer
 * so an Android signup that started on the web still knows where it began.
 */
export function playStoreUrl(a: Attribution = {}): string {
  const p = new URLSearchParams()
  const source = a.utm_source ?? a.referrer_domain ?? (a.referral_code ? 'referral' : undefined)
  if (!source) return PLAY_STORE_URL
  p.set('utm_source', source)
  if (a.utm_medium) p.set('utm_medium', a.utm_medium)
  if (a.utm_campaign) p.set('utm_campaign', a.utm_campaign)
  if (a.referral_code) p.set('ref', a.referral_code)
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(p.toString())}`
}
