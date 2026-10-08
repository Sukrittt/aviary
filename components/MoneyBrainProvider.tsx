'use client'

import { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { MoneyBrainDrawer, type OpenChat } from '@/src/components/MoneyBrainDrawer'
import { LogExpenseModal } from '@/src/components/LogExpenseModal'
import { useAppearance } from '@/components/AppearanceProvider'
import { useMoneyBrief } from '@/src/hooks/useMoneyBrief'

import { MoneyBrainContext } from './moneyBrainContext'

export function MoneyBrainProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{ key: number; sessionId: string | null; capture?: boolean } | null>(null)
  // Manual entry, offered from the drawer when a typed spend couldn't be read.
  const [manual, setManual] = useState(false)
  const { theme } = useAppearance()
  // Warms the brief while the user reads the page, so opening the drawer shows
  // it straight away instead of waiting on two model calls. Signed-in only:
  // every signed-out visitor shares the demo account, and they should not all
  // be rebuilding its brief.
  const { user } = useAuth()
  useMoneyBrief({ enabled: Boolean(user) })

  // Outlives the drawer, so closing and reopening it lands back in the same chat.
  const openChat = useRef<OpenChat>({ sessionId: null, messages: [] })

  const openMoneyBrain = useCallback((sessionId?: string | null) => {
    if (sessionId === null) openChat.current = { sessionId: null, messages: [] }
    setRequest({ key: Date.now(), sessionId: sessionId ?? null })
  }, [])
  const openCapture = useCallback(() => {
    openChat.current = { sessionId: null, messages: [] }
    setRequest({ key: Date.now(), sessionId: null, capture: true })
  }, [])
  const closeMoneyBrain = useCallback(() => setRequest(null), [])
  const value = useMemo(
    () => ({ openMoneyBrain, openCapture, closeMoneyBrain, isMoneyBrainOpen: request !== null }),
    [closeMoneyBrain, openCapture, openMoneyBrain, request],
  )

  return (
    <MoneyBrainContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {request && (
          <MoneyBrainDrawer
            key={request.key}
            initialSessionId={request.sessionId}
            capture={request.capture}
            onLogManually={() => {
              setRequest(null)
              setManual(true)
            }}
            openChat={openChat}
            onClose={closeMoneyBrain}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {manual && (
          // A sibling of AppShell like the drawer, so it needs its own theme scope.
          <div className={`expense-redesign${theme ? ` theme-${theme}` : ''}`}>
            <LogExpenseModal onClose={() => setManual(false)} onSaved={() => {}} />
          </div>
        )}
      </AnimatePresence>
    </MoneyBrainContext.Provider>
  )
}

export function useMoneyBrain() {
  const value = useContext(MoneyBrainContext)
  if (!value) throw new Error('useMoneyBrain must be used inside MoneyBrainProvider')
  return value
}
