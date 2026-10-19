/**
 * Where sign-in sends you back to, for a page that needed you signed in
 * (the join page). A short-lived cookie rather than a `?next=` param, so it
 * survives Google's round trip and the email → code pages without threading
 * it through each of them.
 */
export const RETURN_COOKIE = 'aviary-return'

/** Only same-site paths: never `//evil.com` or a full URL. */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null
  let path: string
  try {
    path = decodeURIComponent(raw)
  } catch {
    return null
  }
  return /^\/(?![/\\])/.test(path) ? path : null
}

export function setReturnTo(path: string): void {
  document.cookie = `${RETURN_COOKIE}=${encodeURIComponent(path)}; path=/; max-age=1800; SameSite=Lax`
}

/** Reads and clears it. Client side, for the email code page. */
export function takeReturnTo(): string | null {
  if (typeof document === 'undefined') return null
  const raw = new RegExp(`(?:^|;\\s*)${RETURN_COOKIE}=([^;]*)`).exec(document.cookie)?.[1]
  if (raw) document.cookie = `${RETURN_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  return safeReturnTo(raw)
}
