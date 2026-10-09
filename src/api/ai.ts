import { apiFetch } from './client'
import { track } from '@/src/lib/analytics'

/** The server's code on a 429 for a spent monthly AI allowance (lib/ai/allowance.ts). */
const AI_ALLOWANCE_EXCEEDED = 'AI_ALLOWANCE_EXCEEDED'

/**
 * Reports a spent AI allowance, the way mobile's rejectIfAllowanceExceeded
 * does: how often the cap bites, and on what, is the input to pricing it.
 * Reads a clone, so the caller can still read the body for its own error.
 */
export async function allowanceHit(resp: Response, feature: 'brief' | 'chat' | 'scan'): Promise<boolean> {
  if (resp.status !== 429) return false
  const body = await resp.clone().json().catch(() => null)
  if (body?.code !== AI_ALLOWANCE_EXCEEDED) return false
  track('ai_allowance_hit', { feature })
  return true
}

export interface BriefCard {
  icon: string
  title: string
  subtitle: string
  valueLabel: string
  amount: number
  tone: 'mint' | 'violet' | 'coral' | 'warn'
}

export interface Brief {
  narrative: string
  cards: BriefCard[]
  questions: string[]
  meta: {
    txnCountThisMonth: number
    totalSpent: number
    totalAssigned: number
    daysLeft: number
  }
}

/** One row the money brain read out of a typed message. Matches `CaptureItem` in lib/ai/capture.ts. */
export interface CaptureItem {
  id: string
  item: string
  /** What was paid in total, before any split. */
  amount: number
  /** How many people shared it, the user included. 1 when not split. */
  splitWays: number
  date: string
  /** '' when the server wasn't sure: the user picks one on the review card. */
  category: string
  categoryConfidence: number | null
  /** Set on a balance check's estimates: card shortfalls log as card spends. Absent means the default (bank). */
  paymentMethod?: 'bank' | 'credit_card'
}

export type ProposalStatus = 'pending' | 'submitted' | 'dismissed'

/** Spends read out of a message, for the user to review before anything is logged. */
export interface CaptureProposal {
  id: string
  items: CaptureItem[]
  skipped: string[]
  unparsed: string[]
  /** Absent on a proposal that just streamed in, which is always pending. */
  status?: ProposalStatus
  expenseIds?: string[]
}

export interface ChatMessage {
  role: 'user' | 'model'
  text: string
  /** Set on a reply to a message the user was logging spends with. */
  proposal?: CaptureProposal
  /** Ask Aviary's reply once a proposal's rows were logged. */
  ack?: boolean
}

/** Tells /api/ai/chat this client can show a capture proposal (CAPTURE_HEADER in lib/ai/capture.ts). */
const CAPTURE_HEADER = 'X-Aviary-Capture'

/**
 * The error the chat stream sends when it couldn't read spends out of a
 * message. Matches CAPTURE_FAILED in lib/ai/capture.ts, so the drawer can
 * offer manual entry instead of a generic "try again".
 */
export const CAPTURE_FAILED_MESSAGE = "I couldn't read that one. Try again, or add it with the + button."

export interface ChatSessionSummary {
  id: string
  title: string
  updatedAt: string
  preview: string
  messageCount: number
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessage[]
  createdAt: string
}

export interface ChatSessionsPage {
  sessions: ChatSessionSummary[]
  total: number
  page: number
  pageCount: number
}

export async function listChatSessions(params?: {
  page?: number
  limit?: number
  q?: string
}): Promise<ChatSessionsPage> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const resp = await apiFetch(`/api/ai/chat/sessions${suffix}`)
  if (!resp.ok) throw new Error(`Failed to load chat history: ${resp.status}`)
  return resp.json()
}

export async function getChatSession(id: string): Promise<ChatSessionDetail> {
  const resp = await apiFetch(`/api/ai/chat/sessions/${id}`)
  if (!resp.ok) throw new Error(`Failed to load chat: ${resp.status}`)
  return resp.json()
}

export async function fetchBrief(): Promise<Brief> {
  const resp = await apiFetch('/api/ai/brief')
  if (!resp.ok) {
    await allowanceHit(resp, 'brief')
    const detail = await resp.json().catch(() => ({}))
    throw new Error(detail.error ?? `Failed to load brief: ${resp.status}`)
  }
  return resp.json()
}

/**
 * Streams /api/ai/chat. Buffers decoded text and splits on the SSE frame
 * delimiter ("\n\n"), calling onDelta for each `data: {"delta":...}` frame.
 *
 * Mobile's twin reaches for `expo/fetch` because RN's global fetch can't read
 * streaming bodies under Hermes, and then has to re-run the 401 handling that
 * bypassing apiFetch skipped. Browser fetch streams natively, so this goes
 * through apiFetch like every other call here and neither workaround applies.
 *
 * `messages` is sent in full (as before) rather than just the newest one:
 * the client can't tell ahead of the request whether it'll land as a signed-in
 * user (persisted, session-scoped) or the read-only demo user (stateless,
 * needs the whole history every call) — same body either way. `sessionId`
 * additionally threads a persisted session through for signed-in users: pass
 * the session's id to append to it, or null to start a new one — the server
 * creates it and sends its id back as the first frame, which this returns so
 * the caller can remember it. Ignored server-side for the demo user.
 */
export async function streamChat(
  sessionId: string | null,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  onProposal?: (proposal: CaptureProposal) => void,
): Promise<string | null> {
  const resp = await apiFetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [CAPTURE_HEADER]: '1' },
    // Role and text only: a proposal riding on an earlier reply is the server's own data, not history to resend.
    body: JSON.stringify({ sessionId, messages: messages.map(({ role, text }) => ({ role, text })) }),
    // A model streaming a long answer outruns apiFetch's 15s default, and a
    // caller-supplied signal replaces it. Without a caller's own signal the
    // stream is left untimed rather than cut off mid-answer.
    signal: signal ?? null,
  })

  if (!resp.ok) {
    const spent = await allowanceHit(resp, 'chat')
    const detail = await resp.json().catch(() => ({}))
    const err = new Error(detail.error ?? `Failed to chat: ${resp.status}`)
    if (spent) err.name = 'AiAllowanceError'
    throw err
  }
  if (!resp.body) throw new Error('Failed to chat: empty response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let resolvedSessionId = sessionId

  // Mobile iterates the body directly (`for await (const chunk of resp.body)`),
  // which expo/fetch supports. A browser ReadableStream is not async-iterable
  // in Chrome, so this reads it explicitly instead.
  const reader = resp.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      const payload = line.slice('data: '.length)
      if (payload === '[DONE]') return resolvedSessionId
      const parsed = JSON.parse(payload)
      if (parsed.error) throw new Error(parsed.error)
      if (typeof parsed.sessionId === 'string') resolvedSessionId = parsed.sessionId
      if (parsed.proposal && typeof parsed.proposal === 'object' && Array.isArray(parsed.proposal.items)) {
        onProposal?.(parsed.proposal as CaptureProposal)
      }
      if (typeof parsed.delta === 'string') onDelta(parsed.delta)
    }
  }
  return resolvedSessionId
}

/**
 * Records what became of a proposal so a reopened chat shows it as logged or
 * dismissed. Best effort: logging twice is already prevented by each row's
 * client_id, so a failure here only means the card comes back as pending.
 * A 409 means it already has an answer, which is fine.
 */
export async function updateProposalStatus(
  sessionId: string,
  proposalId: string,
  status: Exclude<ProposalStatus, 'pending'>,
  expenseIds?: string[],
  /** The line the app already showed under the card (src/lib/captureAck.ts), saved so a reopened chat matches. */
  reply?: string,
): Promise<string | null> {
  const resp = await apiFetch(`/api/ai/chat/sessions/${encodeURIComponent(sessionId)}/proposals/${encodeURIComponent(proposalId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, ...(expenseIds && expenseIds.length ? { expenseIds } : {}), ...(reply ? { reply } : {}) }),
  })
  if (!resp.ok && resp.status !== 409) throw new Error(`Failed to update proposal: ${resp.status}`)
  // The first `submitted` answers with Ask Aviary's reply to the logged rows.
  const body = (await resp.json().catch(() => null)) as { reply?: unknown } | null
  return typeof body?.reply === 'string' ? body.reply : null
}
