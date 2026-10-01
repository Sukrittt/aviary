/**
 * One-shot hand-off from the sign-in code page to /expense. Sign-in ends in a
 * full navigation, so nothing in memory survives it; sessionStorage does, and
 * a refresh or a new tab never replays the flight because it's read once.
 */

const KEY = 'aviary-sign-in-flight'
/** Stale after this: e.g. onboarding took the user elsewhere first. */
export const PENDING_TTL_MS = 10 * 60 * 1000

export function markSignInFlight(now = Date.now()) {
  try {
    sessionStorage.setItem(KEY, String(now))
  } catch {
    // Storage blocked: the user just doesn't get the flourish.
  }
}

/** True once per sign-in, and clears the flag either way. */
export function takeSignInFlight(now = Date.now()): boolean {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return false
    sessionStorage.removeItem(KEY)
    const at = Number(raw)
    return Number.isFinite(at) && now - at >= 0 && now - at < PENDING_TTL_MS
  } catch {
    return false
  }
}
