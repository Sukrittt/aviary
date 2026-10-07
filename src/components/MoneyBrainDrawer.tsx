'use client'

import { useCurrency } from '@/src/context/CurrencyContext'
import { useAppearance } from '@/components/AppearanceProvider'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { STAGGER, popIn, staggerDelay } from './landing/mobile/kit'
import { ArrowLeft, ArrowUp, Clock3, Plus, Search, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useBudgets } from '@/src/hooks/useBudgets'
import { useCategories } from '@/src/hooks/useCategories'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { useGroups } from '@/src/hooks/useGroups'
import { useHideAmounts } from '@/src/hooks/useHideAmounts'
import { useMoneyBrief } from '@/src/hooks/useMoneyBrief'
import { useChatSessions, useChatSessionsCount } from '@/src/hooks/useChatSessions'
import { computeEnvelopeState, currentMonthKey } from '@/src/lib/envelope'

import { CAPTURE_FAILED_MESSAGE, getChatSession, streamChat, updateProposalStatus, type ChatMessage } from '@/src/api/ai'
import { track } from '@/src/lib/analytics'
import { LoadingCaption } from './LoadingCaption'
import { BirdMark, BirdThinking } from './BirdMark'
import { ChatMarkdown } from './ChatMarkdown'
import { BirdEmptyState } from './BirdEmptyState'
import { CaptureReview } from './CaptureReview'

export interface OpenChat {
  sessionId: string | null
  messages: ChatMessage[]
}

interface Props {
  initialSessionId?: string | null
  /** Opened from "Log several at once": a fresh chat focused on typing spends, without the money brief. */
  capture?: boolean
  /** Opens manual entry, offered when a typed message couldn't be read. */
  onLogManually?: () => void
  /** The chat left open last time; the drawer restores it and keeps it current. */
  openChat?: MutableRefObject<OpenChat>
  onClose: () => void
}

function timeAgo(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000))
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

/** A chat turn as the drawer holds it: `captureFailed` marks a reply that offers manual entry instead. */
type BrainMessage = ChatMessage & { captureFailed?: boolean }

export function MoneyBrainDrawer({ initialSessionId = null, capture = false, onLogManually, openChat, onClose }: Props) {
  const { formatCurrency } = useCurrency()
  const { theme } = useAppearance()

  const reduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const [hideAmounts] = useHideAmounts()
  const budgets = useBudgets()
  const expenses = useRecentExpenses()
  const categories = useCategories()
  const groups = useGroups()
  const brief = useMoneyBrief()
  const count = useChatSessionsCount()

  const [view, setView] = useState<'chat' | 'history'>('chat')
  // A reply cut off by closing mid-stream leaves an empty model bubble; drop it.
  const [messages, setMessages] = useState<BrainMessage[]>(() => openChat?.current.messages.filter((m) => m.text) ?? [])
  const [sessionId, setSessionId] = useState<string | null>(() => openChat?.current.sessionId ?? null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(1)
  const abortRef = useRef<AbortController | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const history = useChatSessions(view === 'history', { page, query: debouncedQuery })
  const historySessions = history.data?.sessions ?? []
  const historyPageCount = history.data?.pageCount ?? 1
  const envelope = useMemo(
    () => computeEnvelopeState(
      budgets.data ?? [],
      expenses.data ?? [],
      currentMonthKey(),
      categories.data ?? [],
      groups.data ?? [],
    ),
    [budgets.data, categories.data, expenses.data, groups.data],
  )
  const spentPct = envelope.totalAssigned > 0
    ? Math.min(100, (envelope.totalSpent / envelope.totalAssigned) * 100)
    : envelope.totalSpent > 0 ? 100 : 0

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    inputRef.current?.focus()
    return () => {
      abortRef.current?.abort()
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    if (!initialSessionId) return
    void openSession(initialSessionId)
  }, [initialSessionId])

  useEffect(() => {
    if (openChat) openChat.current = { sessionId, messages }
  }, [openChat, sessionId, messages])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [messages, reduceMotion])

  // Reopening the drawer or coming back from history lands on the latest message, not the top.
  useLayoutEffect(() => {
    if (view === 'chat') bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [view])

  function startNewChat() {
    abortRef.current?.abort()
    setMessages([])
    setSessionId(null)
    setInput('')
    setSending(false)
    setLoadError(false)
    setView('chat')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  async function openSession(id: string) {
    setLoadError(false)
    try {
      const detail = await getChatSession(id)
      setMessages(detail.messages)
      setSessionId(detail.id)
      setView('chat')
    } catch {
      setLoadError(true)
    }
  }

  async function send(text: string, source: 'chip' | 'typed') {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    track('money_brain_query', { source })
    const historyMessages: BrainMessage[] = [...messages, { role: 'user' as const, text: trimmed }]
    setMessages([...historyMessages, { role: 'model', text: '' }])
    setInput('')
    setSending(true)
    setLoadError(false)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const resolved = await streamChat(
        sessionId,
        historyMessages,
        (delta) => setMessages((current) => {
          const next = [...current]
          const last = next[next.length - 1]
          if (last?.role === 'model') next[next.length - 1] = { ...last, text: last.text + delta }
          return next
        }),
        controller.signal,
        (proposal) => {
          track('capture_proposed', { rows: proposal.items.length })
          setMessages((current) => {
            const next = [...current]
            const last = next[next.length - 1]
            if (last?.role === 'model') next[next.length - 1] = { ...last, proposal }
            return next
          })
        },
      )
      setSessionId(resolved)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chatSessions'] }),
        queryClient.invalidateQueries({ queryKey: ['chatSessionsCount'] }),
      ])
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        const captureFailed = (error as Error).message === CAPTURE_FAILED_MESSAGE
        setMessages((current) => {
          const next = [...current]
          next[next.length - 1] = captureFailed
            ? { role: 'model', text: "Couldn't read that one. Add it by hand?", captureFailed: true }
            : { role: 'model', text: 'Something went wrong. Try again.' }
          return next
        })
      }
    } finally {
      setSending(false)
    }
  }

  const awaitingFirstDelta = sending && messages.at(-1)?.role === 'model' && !messages.at(-1)?.text

  /** Records a proposal's outcome on the chat, so reopening it shows the card read-only. Best effort. */
  function settleProposal(proposalId: string, status: 'submitted' | 'dismissed', expenseIds: string[]) {
    setMessages((current) => current.map((m) => (m.proposal?.id === proposalId ? { ...m, proposal: { ...m.proposal, status, expenseIds } } : m)))
    if (sessionId) void updateProposalStatus(sessionId, proposalId, status, expenseIds).catch(() => {})
  }

  return (
    <motion.div
      // The drawer is a sibling of AppShell, so it needs its own theme scope.
      className={`expense-redesign brain-scrim${theme ? ` theme-${theme}` : ''}`}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.aside
        className="brain-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Ask Aviary"
        initial={reduceMotion ? false : { x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 34, stiffness: 320 }}
      >
        <header className="brain-head">
          {view === 'history' ? (
            <button className="brain-icon-btn" type="button" onClick={() => setView('chat')} aria-label="Back to chat">
              <ArrowLeft size={18} />
            </button>
          ) : <span className="brain-orbit" aria-hidden="true"><BirdMark size={26} /></span>}
          <div className="brain-heading">
            <h2>{view === 'history' ? 'Chat history' : 'Ask Aviary'}</h2>
            <p>{view === 'history' ? 'Pick up where you left off' : capture ? 'Type what you spent. Several at once is fine.' : brief.data ? `Reading ${brief.data.meta.txnCountThisMonth} transactions` : 'Reading your budget…'}</p>
          </div>
          <div className="brain-head-actions">
            {view === 'chat' && (
              <button className="brain-pill-btn" type="button" onClick={() => setView('history')} aria-label="Chat history">
                <Clock3 size={15} />{count.data !== undefined && <span>{count.data}</span>}
              </button>
            )}
            <button className="brain-pill-btn brain-pill-btn--accent" type="button" onClick={startNewChat} aria-label="New chat">
              <Plus size={15} /><span>New</span>
            </button>
            <button className="brain-icon-btn" type="button" onClick={onClose} aria-label="Close Ask Aviary">
              <X size={18} />
            </button>
          </div>
        </header>

        {view === 'history' ? (
          <div className="brain-history">
            <label className="brain-search">
              <Search size={16} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your chats…" />
            </label>
            {history.isLoading && !history.data ? <LoadingCaption /> : historySessions.length ? (
              <div className="brain-history-list">
                {historySessions.map((item, i) => (
                  <motion.button
                    key={item.id}
                    type="button"
                    onClick={() => void openSession(item.id)}
                    {...popIn(staggerDelay(i, 0))}
                    whileHover={{ x: -2, transition: { duration: 0.16 } }}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.preview}</span>
                    <small>{timeAgo(item.updatedAt)} · {item.messageCount} messages</small>
                  </motion.button>
                ))}
              </div>
            ) : (
              <BirdEmptyState
                compact
                mood={query ? 'searching' : 'snoozing'}
                subject="chat"
                title={query ? 'Nothing turned up' : 'No past chats yet'}
                description={query ? `No chats match “${query}”.` : 'Start a conversation and it’ll wait for you here.'}
              />
            )}
            {historyPageCount > 1 && (
              <div className="brain-pager">
                <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                <span>{page} of {historyPageCount}</span>
                <button type="button" disabled={page >= historyPageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="brain-body" ref={bodyRef}>
              {loadError && <div className="brain-error" role="alert">Couldn’t load that chat. Check your connection and try again.</div>}
              {capture && messages.length === 0 && (
                <motion.section className="brain-summary-card" {...popIn(STAGGER.mount)}>
                  <span className="brain-kicker">Log several at once</span>
                  <p>Try “auto 240, lunch 150, turf 1200 split 6”. You&apos;ll check them before anything is logged.</p>
                </motion.section>
              )}
              {!capture && (<>
              <motion.section className="brain-summary-card" {...popIn(STAGGER.mount)}>
                <span className="brain-kicker">This month so far</span>
                <strong>{formatCurrency(envelope.totalSpent, hideAmounts)} of {formatCurrency(envelope.totalAssigned, hideAmounts)} assigned</strong>
                <div className="brain-progress" aria-label={`${Math.round(spentPct)}% of assigned money spent`}>
                  <i style={{ transform: `scaleX(${spentPct / 100})` }} />
                </div>
                {brief.isLoading ? <LoadingCaption /> : brief.isError ? (
                  <button className="brain-retry" type="button" onClick={() => void brief.refetch()}>Couldn’t load your money brief. Retry</button>
                ) : <p>{brief.data?.narrative}</p>}
              </motion.section>
              {brief.data?.cards.length ? (
                <section className="brain-insight-grid">
                  {brief.data.cards.map((card, i) => (
                    <motion.article
                      key={`${card.title}-${card.valueLabel}`}
                      className={`brain-insight brain-insight--${card.tone}`}
                      {...popIn(staggerDelay(i, STAGGER.mount + STAGGER.block))}
                    >
                      <span className="brain-insight-icon" aria-hidden="true">{card.icon}</span>
                      <div><strong>{card.title}</strong><small>{card.subtitle}</small></div>
                      <div className="brain-insight-value"><b>{formatCurrency(card.amount, hideAmounts)}</b><small>{card.valueLabel}</small></div>
                    </motion.article>
                  ))}
                </section>
              ) : null}
              {brief.data?.questions.length ? (
                <section>
                  <span className="brain-kicker">Ask anything</span>
                  <div className="brain-chips">
                    {brief.data.questions.map((question, i) => (
                      <motion.button
                        key={question}
                        type="button"
                        disabled={sending}
                        onClick={() => void send(question, 'chip')}
                        {...popIn(staggerDelay(i, STAGGER.mount + 2 * STAGGER.block))}
                      >
                        {question}
                      </motion.button>
                    ))}
                  </div>
                </section>
              ) : null}
              </>)}
              {messages.length > 0 && (
                <div className="brain-messages" aria-live="polite">
                  {messages.map((message, index) => message.text ? (
                    <div key={index} className="brain-turn">
                      <div className={`brain-bubble brain-bubble--${message.role}`}>
                        {message.role === 'model' ? <ChatMarkdown text={message.text} /> : message.text}
                        {message.captureFailed && onLogManually && (
                          <button type="button" className="brain-inline-link" onClick={onLogManually}>Add it by hand</button>
                        )}
                      </div>
                      {message.proposal && (
                        <CaptureReview
                          proposal={message.proposal}
                          onSettled={(status, ids) => settleProposal(message.proposal!.id, status, ids)}
                        />
                      )}
                    </div>
                  ) : null)}
                  {awaitingFirstDelta && <BirdThinking size={30} />}
                </div>
              )}
            </div>
            <form className="brain-composer" onSubmit={(event) => { event.preventDefault(); void send(input, 'typed') }}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                disabled={sending}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void send(input, 'typed')
                  }
                }}
                placeholder={capture ? 'What did you spend?' : 'Ask about your money…'}
                aria-label="Ask Aviary"
              />
              <button type="submit" disabled={sending || !input.trim()} aria-label="Send question"><ArrowUp size={18} /></button>
            </form>
          </>
        )}
      </motion.aside>
    </motion.div>
  )
}
