'use client'

import { ACTIVE_BUDGET_KEY, setBudgetCookie } from '../api/client'
import { clearLocalPrefs } from '../lib/localPref'

/**
 * Log out. Full navigation, since the session cookie is cleared server-side.
 * Browser-local preferences go first, or the next account signed in here
 * inherits this one's collapsed groups, recent categories and open budget.
 */
export function clearAccess(): void {
  clearLocalPrefs()
  setBudgetCookie(null)
  try {
    localStorage.removeItem(ACTIVE_BUDGET_KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
  window.location.href = '/logout'
}
