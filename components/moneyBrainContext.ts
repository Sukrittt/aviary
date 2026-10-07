'use client'

import { createContext, useContext } from 'react'

export interface MoneyBrainContextValue {
  /** No argument resumes the last open chat; `null` starts a new one; an id opens that saved chat. */
  openMoneyBrain: (sessionId?: string | null) => void
  /** A fresh chat for typing several spends at once ("Log several at once"). */
  openCapture: () => void
  closeMoneyBrain: () => void
  isMoneyBrainOpen: boolean
}

/**
 * Apart from MoneyBrainProvider so screens the provider itself renders (manual
 * entry) can reach it without importing the provider and its auth client.
 */
export const MoneyBrainContext = createContext<MoneyBrainContextValue | null>(null)

/** The drawer's controls, or null outside the provider (screens rendered on their own, as in tests). */
export function useOptionalMoneyBrain() {
  return useContext(MoneyBrainContext)
}
