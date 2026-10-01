'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { MoneyBrainDrawer, type OpenChat } from '@/src/components/MoneyBrainDrawer'
import { useMoneyBrief } from '@/src/hooks/useMoneyBrief'

interface MoneyBrainContextValue {
  /** No argument resumes the last open chat; `null` starts a new one; an id opens that saved chat. */
  openMoneyBrain: (sessionId?: string | null) => void
  closeMoneyBrain: () => void
  isMoneyBrainOpen: boolean
}

const MoneyBrainContext = createContext<MoneyBrainContextValue | null>(null)

export function MoneyBrainProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{ key: number; sessionId: string | null } | null>(null)
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
  const closeMoneyBrain = useCallback(() => setRequest(null), [])
  const value = useMemo(
    () => ({ openMoneyBrain, closeMoneyBrain, isMoneyBrainOpen: request !== null }),
    [closeMoneyBrain, openMoneyBrain, request],
  )

  return (
    <MoneyBrainContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {request && (
          <MoneyBrainDrawer
            key={request.key}
            initialSessionId={request.sessionId}
            openChat={openChat}
            onClose={closeMoneyBrain}
          />
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
