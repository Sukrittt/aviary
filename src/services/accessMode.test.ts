import { describe, expect, it } from 'vitest'
import { ACTIVE_BUDGET_KEY, budgetCookie, setBudgetCookie } from '../api/client'
import { clearAccess } from './accessMode'

describe('clearAccess', () => {
  it("doesn't leave this account's open budget for the next one signed in here", () => {
    setBudgetCookie('sp_home')
    localStorage.setItem(ACTIVE_BUDGET_KEY, JSON.stringify({ id: 'sp_home', name: 'Home' }))

    clearAccess()

    expect(budgetCookie()).toBeNull()
    expect(localStorage.getItem(ACTIVE_BUDGET_KEY)).toBeNull()
  })
})
