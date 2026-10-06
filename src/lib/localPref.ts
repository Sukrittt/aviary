/**
 * Device-local UI preferences. Web counterpart of the `expo-secure-store`
 * calls in Mobile's preference hooks (useCollapsedGroups, useRecentCategories,
 * useTourProgress, useDismissedRolloverBanner).
 *
 * Two deliberate differences from the mobile twins:
 *
 * 1. Reads stay async-shaped even though localStorage is synchronous. Reading
 *    during render would desync server and client markup — the same trap
 *    AppearanceProvider documents — so the hooks hydrate in an effect exactly
 *    as mobile's do, and the shapes stay diffable.
 *
 * 2. Mobile clears these through `accessMode.subscribeLogout`. Web signs out
 *    by navigating to /logout, so there is no in-page event to subscribe to
 *    and localStorage survives the navigation. `clearLocalPrefs()` below is
 *    that guard, called from the sign-out controls before they navigate.
 *    Without it the next account signed into this browser inherits the
 *    previous one's collapsed groups and recently-used categories.
 *
 * Every key is prefixed so clearLocalPrefs can find them all without a
 * registry to keep in sync.
 */
const PREFIX = 'mc-'

/**
 * The hide-amounts preference, mirrored into a cookie the server can read
 * (written by useHideAmounts). Server-rendered pages (app/expense/page.tsx)
 * put real amounts in their HTML, so they only do that when this cookie says
 * "shown"; without it they leave the amounts to the client, as before. Missing
 * counts as hidden, so the first visit after this shipped can't flash amounts
 * at someone who had them hidden. Lives here, not in the hook, so a server
 * component can import it.
 */
export const AMOUNTS_COOKIE = 'mc-amounts'

/** Prefixed key for a preference. Mobile's keys already carry the `mc-` prefix inline. */
export function prefKey(name: string): string {
  return name.startsWith(PREFIX) ? name : `${PREFIX}${name}`
}

export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(prefKey(key))
  } catch {
    // Private mode, or storage disabled. A missing preference is not an error.
    return null
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(prefKey(key), value)
  } catch {
    // Quota or disabled storage — losing a UI preference is not worth a throw.
  }
  notify()
}

export function removePref(key: string): void {
  try {
    window.localStorage.removeItem(prefKey(key))
  } catch {
    // As above.
  }
  notify()
}

/**
 * Drops every `mc-`-prefixed preference. Call before navigating to /logout.
 *
 * The theme is the deliberate exception, matching mobile: clearing it flipped
 * a user who had picked Light on a dark-mode device into dark mid-sign-out.
 * Theme belongs to the browser, not the account.
 */
const KEEP_ON_LOGOUT = new Set(['mc-theme', 'mc-theme-pref', 'mc-density'])

export function clearLocalPrefs(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(PREFIX) && !KEEP_ON_LOGOUT.has(key)) doomed.push(key)
    }
    for (const key of doomed) window.localStorage.removeItem(key)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
  notify()
}

/**
 * Change notification, so several hooks reading the same key stay in step and
 * `useSyncExternalStore` has something to subscribe to. `storage` events only
 * fire in *other* tabs, so writes from this one are announced here by hand.
 */
const listeners = new Set<() => void>()

export function subscribePrefs(onChange: () => void): () => void {
  listeners.add(onChange)
  const onStorage = () => onChange()
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function notify(): void {
  for (const fn of listeners) fn()
}
