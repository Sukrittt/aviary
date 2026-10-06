import { useCallback, useEffect } from 'react'
import { usePersistentState } from './usePersistentState'
import { AMOUNTS_COOKIE, readPref } from '../lib/localPref'

const KEY = 'expense-hide-amounts'

/**
 * Whether money is masked on screen. Web counterpart of Mobile's
 * PrivacyContext, and like it a device preference rather than account data:
 * hiding amounts is about who can see this screen, not about the account.
 *
 * The key predates the `mc-` preference prefix, so it is left as-is and
 * therefore survives clearLocalPrefs on sign-out. That is the right behaviour
 * for the same reason the theme survives: a shoulder-surfing setting belongs
 * to the room you are in, not the account you are signed into.
 */
export function useHideAmounts() {
  const [hidden, setStored] = usePersistentState<boolean>(
    KEY,
    false,
    (raw) => raw === 'true',
    (value) => String(value),
  )
  useEffect(() => {
    // From storage, not `hidden`: during hydration that briefly holds the
    // server default (shown), which must never reach the cookie.
    const stored = readPref(KEY) === 'true'
    document.cookie = `${AMOUNTS_COOKIE}=${stored ? 'hidden' : 'shown'}; path=/; max-age=31536000; samesite=lax`
  }, [hidden])
  const setHidden = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => setStored(next),
    [setStored],
  )
  return [hidden, setHidden] as const
}
