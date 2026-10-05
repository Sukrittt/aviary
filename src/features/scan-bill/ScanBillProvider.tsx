'use client'

import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'
import { useScanBillController, type ScanBillState } from './useScanBillController'

type ScanBillContextValue = {
  state: ScanBillState
  registerOnDone: (callback: () => void) => () => void
}

const ScanBillContext = createContext<ScanBillContextValue | null>(null)

/** Owned by the root layout: survives dialog and page unmounts, but not reloads. */
export function ScanBillProvider({ children }: { children: ReactNode }) {
  const onDone = useRef<(() => void) | null>(null)
  const registerOnDone = useCallback((callback: () => void) => {
    onDone.current = callback
    return () => {
      if (onDone.current === callback) onDone.current = null
    }
  }, [])
  const state = useScanBillController({ onDone: () => onDone.current?.() })

  return <ScanBillContext.Provider value={{ state, registerOnDone }}>{children}</ScanBillContext.Provider>
}

export function useScanBillDraft() {
  const context = useContext(ScanBillContext)
  if (!context) throw new Error('useScanBillDraft must be used within ScanBillProvider')
  return context
}
