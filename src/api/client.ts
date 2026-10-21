/**
 * Twin of Mobile/src/api/client.ts. Same job, different transport.
 *
 * There is no Authorization header and no BASE_URL: these are same-origin
 * requests, so the AuthKit session cookie rides along automatically and the
 * access token never touches JavaScript. Signed-out callers simply have no
 * cookie and `lib/access.ts::getAuth` answers as the read-only demo user.
 *
 * Mobile's `handleUnauthorized` has no counterpart here on purpose. A 401
 * needs a token the server rejects; web sends no token, and an absent or
 * unusable cookie falls through to the demo user at 200. The demo user's
 * writes are refused with 403 (`readOnlyGuard`), which is an ordinary
 * rejection each caller surfaces as a message, not a session to drop.
 */

const REQUEST_TIMEOUT_MS = 15_000

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Browser fetch has no default timeout — without one a hung connection pins
  // a screen's loading state forever. Callers already surface a thrown error
  // as a generic "check your connection" state, so the AbortError this throws
  // needs no special handling here.
  //
  // Presence of the key, not its value, decides: passing `signal: null` is how
  // a caller says "this one runs untimed" (streamChat, whose response is open
  // for as long as the model is talking). `init?.signal ?? timeout` would hand
  // that caller the 15s timeout it was trying to avoid.
  const signal = init && 'signal' in init ? init.signal : AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const resp = await fetch(path, { ...init, signal })
  if (resp.status === 403) await leaveLostBudget(resp)
  if (resp.status === 402) await flagReadOnly(resp)
  return resp
}

/** Fired when a write comes back 402 BUDGET_READ_ONLY: the owner's plan lapsed. BudgetNotices shows the banner. */
export const BUDGET_READ_ONLY_EVENT = 'aviary:budget-read-only'
/** `{id, name}` of the open budget, kept fresh by useSpaces so a lost one can still be named after the reload. */
export const ACTIVE_BUDGET_KEY = 'aviary-active-budget'
/** sessionStorage: the budget we were just thrown out of, for the "You're no longer in…" notice. */
export const LOST_BUDGET_KEY = 'aviary-lost-budget'

async function flagReadOnly(resp: Response) {
  const body = await resp.clone().json().catch(() => null)
  if (body?.error === 'BUDGET_READ_ONLY') window.dispatchEvent(new Event(BUDGET_READ_ONLY_EVENT))
}

/**
 * The budget cookie names one this person was removed from (or that's gone):
 * every data route answers 403 NOT_A_MEMBER for it. Drop the cookie and
 * reload into the personal budget. Only when the denied id is the cookie's,
 * so a move into a lost budget doesn't throw you out of this one.
 */
async function leaveLostBudget(resp: Response) {
  const cookie = budgetCookie()
  if (!cookie) return
  const body = await resp.clone().json().catch(() => null)
  if (body?.error !== 'NOT_A_MEMBER' || body.spaceId !== cookie) return
  try {
    const last = JSON.parse(localStorage.getItem(ACTIVE_BUDGET_KEY) ?? 'null')
    if (last?.id === cookie) sessionStorage.setItem(LOST_BUDGET_KEY, JSON.stringify(last))
  } catch {
    // storage blocked: reload without the notice
  }
  setBudgetCookie(null)
  window.location.reload()
}

/** The budget the `aviary-budget` cookie picks, or null for the personal one. */
export function budgetCookie(): string | null {
  if (typeof document === 'undefined') return null
  const raw = /(?:^|;\s*)aviary-budget=([^;]*)/.exec(document.cookie)?.[1]
  try {
    return raw ? decodeURIComponent(raw) : null
  } catch {
    return raw ?? null
  }
}

/** Remembers the active budget on this device; the server reads it on every request. null = personal. */
export function setBudgetCookie(id: string | null): void {
  document.cookie = id
    ? `aviary-budget=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`
    : 'aviary-budget=; path=/; max-age=0; SameSite=Lax'
}

/**
 * Thrown by an API wrapper on a non-ok response, carrying the HTTP status so a
 * caller can tell "the server rejected this" apart from a transport failure
 * (which apiFetch above lets propagate as the original thrown error).
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Reads a `{error}` JSON body if present, falling back to a generic message. */
export async function apiErrorMessage(resp: Response, fallback: string): Promise<string> {
  try {
    const body = await resp.json()
    if (body && typeof body.error === 'string') return body.error
  } catch {
    // non-JSON body, fall through
  }
  return `${fallback}: ${resp.status}`
}
