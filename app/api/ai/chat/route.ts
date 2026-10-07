import { ObjectId } from 'mongodb'
import { readBody, error, getCollection } from '@/lib/http'
import { getAuth, type Auth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { buildExpenseContext, factsFor } from '@/lib/ai/expenseContext'
import { buildSystemPrompt, SCOPE_REFUSAL } from '@/lib/ai/moneyBrainPrompt'
import { routeChat, type ChatRoute } from '@/lib/ai/chatRouter'
import { createEmDashScrubber } from '@/lib/ai/emDash'
import { streamText } from '@/lib/ai/gemini'
import { captureMessage, makeTitle, type StoredChatMessage } from '@/lib/ai/chatSessions'
import {
  buildCaptureProposal,
  captureReplyText,
  CAPTURE_DEMO,
  CAPTURE_FAILED,
  CAPTURE_HEADER,
  CAPTURE_UNSUPPORTED,
  type CaptureProposal,
} from '@/lib/ai/capture'
import { COLLECTIONS } from '@/lib/models'
import { isRateLimited } from '@/lib/rateLimit'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { aiAllowanceResponse } from '@/lib/ai/allowance'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_MESSAGE_LEN = 500
const HISTORY_LIMIT = 8
// Previous user turns the router sees, enough for "It's 12k." to read as the price of what came before.
const ROUTING_CONTEXT_TURNS = 2
// A session's persisted `messages` array is otherwise unbounded — a
// long-lived session would eventually hit Mongo's 16MB document limit and
// every further turn would fail. $slice keeps this atomic with the $push
// rather than a separate read-modify-write.
const MAX_SESSION_MESSAGES = 100
const RATE_WINDOW_MS = 60 * 60 * 1000
const SIGNED_IN_LIMIT = 60
const DEMO_LIMIT = 20
const BURST_WINDOW_MS = 60 * 1000
const BURST_SIGNED_IN_LIMIT = 10
const BURST_DEMO_LIMIT = 5
// Caps Gemini calls per session independent of the hourly per-user limit above
// (a single long-lived session could otherwise burn the whole hourly budget).
// Well under MAX_SESSION_MESSAGES so the stored-array cap is never the thing
// that actually stops a session.
const SESSION_MESSAGE_LIMIT = 40

function rateLimited(auth: Auth): Promise<boolean> {
  return isRateLimited(`ai-chat:${auth.userId}`, [
    { windowMs: BURST_WINDOW_MS, limit: auth.readOnly ? BURST_DEMO_LIMIT : BURST_SIGNED_IN_LIMIT },
    { windowMs: RATE_WINDOW_MS, limit: auth.readOnly ? DEMO_LIMIT : SIGNED_IN_LIMIT },
  ])
}

type ModelContents = Array<{ role: 'user' | 'model'; parts: [{ text: string }] }>

interface ReplyOptions {
  /** The client sent CAPTURE_HEADER, so it can render a proposal frame. */
  captureCapable: boolean
  /** Routing that already ran: a user over the allowance is routed before anything is stored. */
  route?: ChatRoute
}

/** What a reply ended as: its text, plus the proposal it carried when the user was logging spends. */
interface SettledReply {
  text: string
  proposal?: CaptureProposal
}

/**
 * Runs the Gemini stream and forwards SSE frames to the client. `onSettle`
 * fires exactly once with whatever assistant text accumulated, either after
 * a normal finish/error or on `cancel()` (the client aborting/disconnecting
 * mid-stream) — so a persisted session never silently loses the reply's tail.
 *
 * A message routed as capture never reaches the chat model: it's read into a
 * proposal (lib/ai/capture.ts), sent as a `{ proposal }` frame followed by one
 * short line, and the app logs the rows once the user has reviewed them.
 */
function streamReply(
  auth: Auth,
  contents: ModelContents,
  leadingEvent: Record<string, unknown> | null,
  onSettle: (reply: SettledReply) => Promise<void> | void,
  options: ReplyOptions,
): Response {
  const encoder = new TextEncoder()
  let full = ''
  let proposal: CaptureProposal | undefined
  let settled = false
  const settle = async () => {
    if (settled) return
    settled = true
    try {
      await onSettle({ text: full, proposal })
    } catch (err) {
      console.error('[ai/chat] failed to persist reply:', err)
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (leadingEvent) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(leadingEvent)}\n\n`))
        }
        const caller = { userId: auth.userId, feature: 'chat' as const }
        const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        // Routing reads the messages only, so it costs no wall-clock time next to the database read.
        const userTurns = contents.filter((c) => c.role === 'user').map((c) => c.parts[0].text)
        const message = userTurns.at(-1) ?? ''
        const earlier = userTurns.slice(-ROUTING_CONTEXT_TURNS - 1, -1)
        const contextRead = options.route ? null : buildExpenseContext(auth)
        // A capture reply never reads the context; keep a failed read from going unhandled.
        contextRead?.catch(() => {})
        const route = options.route ?? await routeChat(message, caller, earlier)

        if (route.capture) {
          const say = (text: string) => {
            full += text
            send({ delta: text })
          }
          if (!options.captureCapable) {
            say(CAPTURE_UNSUPPORTED)
          } else if (auth.readOnly) {
            say(CAPTURE_DEMO)
          } else {
            let read: CaptureProposal
            try {
              read = await buildCaptureProposal(auth, message)
            } catch (err) {
              console.warn('[ai/chat] capture failed:', (err as Error).message)
              throw new Error(CAPTURE_FAILED)
            }
            if (read.items.length) {
              proposal = read
              send({ proposal: read })
            }
            say(captureReplyText(read))
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          await settle()
          return
        }

        const ctx = await (contextRead ?? buildExpenseContext(auth))

        if (!route.onTopic) {
          full = SCOPE_REFUSAL
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: SCOPE_REFUSAL })}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          await settle()
          return
        }

        const systemPrompt = buildSystemPrompt(factsFor(ctx.sections, route.sections), ctx.currencyCode, route.decision, options.captureCapable && !auth.readOnly)
        const geminiStream = await streamText(systemPrompt, contents, caller, route.decision)

        const scrub = createEmDashScrubber()
        const emit = (text: string) => {
          if (!text) return
          full += text
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`))
        }
        for await (const chunk of geminiStream) {
          if (chunk.text) emit(scrub.push(chunk.text))
        }
        emit(scrub.flush())
        // Rare, but a thinking-mode reply has come back with no text at all; a blank bubble helps nobody.
        if (!full) throw new Error("Ask Aviary didn't come up with an answer. Try asking again.")
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        await settle()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`))
        await settle()
      } finally {
        controller.close()
      }
    },
    async cancel() {
      await settle()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

interface ClientMessage {
  role: 'user' | 'model'
  text: string
}

function isValidMessages(value: unknown): value is ClientMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string',
    )
  )
}

/** Demo/read-only user: today's exact stateless behaviour, nothing touches the DB. */
function handleDemo(auth: Auth, body: Record<string, unknown>, captureCapable: boolean): Response {
  const messages = body.messages

  if (!isValidMessages(messages)) return error('invalid body', 400)

  const last = messages[messages.length - 1]
  if (last.role !== 'user' || !last.text.trim() || last.text.length > MAX_MESSAGE_LEN) {
    return error('invalid body', 400)
  }

  // The client is untrusted here (stateless demo, no server-side session to
  // rebuild history from) — a forged 'model' turn could inject fake assistant
  // output to defeat the SCOPE LOCK in the system prompt, so only user-authored
  // turns are forwarded. Every turn is length-capped too, not just the last —
  // isValidMessages only checks shape, not length, on the rest of the array.
  const userTurns = messages.filter((m) => m.role === 'user')
  if (userTurns.some((m) => m.text.length > MAX_MESSAGE_LEN)) return error('invalid body', 400)
  if (userTurns.length > SESSION_MESSAGE_LIMIT) {
    return error('session message limit reached — start a new chat', 429)
  }

  const trimmed = userTurns.slice(-HISTORY_LIMIT)
  const contents: ModelContents = trimmed.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
  return streamReply(auth, contents, null, () => {}, { captureCapable })
}

/**
 * Real user: sessions persisted to `chat_sessions`, keyed by an id the client
 * threads through. The wire format matches the demo path (`messages`, the
 * client's full trimmed history) — the client can't know ahead of a request
 * whether it'll land here or in `handleDemo`, so both must accept the same
 * body. Only the last (newest) message is actually used; the rest of the
 * array is redundant once a session exists (the DB is source of truth for
 * everything before it) but harmless to receive.
 */
async function handlePersisted(
  auth: Auth,
  body: Record<string, unknown>,
  { captureCapable, overAllowance }: { captureCapable: boolean; overAllowance: Response | null },
): Promise<Response> {
  const messages = body.messages
  if (!isValidMessages(messages)) return error('invalid body', 400)

  const last = messages[messages.length - 1]
  if (last.role !== 'user' || !last.text.trim() || last.text.length > MAX_MESSAGE_LEN) {
    return error('invalid body', 400)
  }
  const message = last.text.trim()

  const rawSessionId = body.sessionId
  const sessionId = typeof rawSessionId === 'string' && rawSessionId ? rawSessionId : null
  if (sessionId && !ObjectId.isValid(sessionId)) return error('invalid body', 400)

  const sessions = await getCollection(COLLECTIONS.chatSessions, auth)

  let objectId: ObjectId
  let history: StoredChatMessage[] = []

  let existing: Record<string, unknown> | null = null
  if (sessionId) {
    existing = await sessions.findOne({ _id: new ObjectId(sessionId) })
    if (!existing) return error('session not found', 404)
    history = (existing.messages as StoredChatMessage[] | undefined) ?? []
    const userTurnCount = history.filter((m) => m.role === 'user').length
    if (userTurnCount >= SESSION_MESSAGE_LIMIT) {
      return error('session message limit reached — start a new chat', 429)
    }
  }

  // Over the allowance, only logging spends still goes through. Routed here,
  // before anything is stored, so every other message gets the same 429 as
  // before and leaves no trace in the session.
  let route: ChatRoute | undefined
  if (overAllowance) {
    const earlier = history.filter((m) => m.role === 'user').map((m) => m.text).slice(-ROUTING_CONTEXT_TURNS)
    route = await routeChat(message, { userId: auth.userId, feature: 'chat' }, earlier)
    if (!route.capture) return overAllowance
  }

  if (existing) {
    objectId = existing._id as ObjectId
  } else {
    const now = new Date()
    const inserted = await sessions.insertOne({
      title: makeTitle(message),
      messages: [],
      createdAt: now,
      updatedAt: now,
    })
    objectId = inserted.insertedId as ObjectId
  }

  const now = new Date()
  const userMsg: StoredChatMessage = { role: 'user', text: message, createdAt: now }
  await sessions.updateOne(
    { _id: objectId },
    { $push: { messages: { $each: [userMsg], $slice: -MAX_SESSION_MESSAGES } }, $set: { updatedAt: now } } as never,
  )

  const trimmed = [...history, userMsg].slice(-HISTORY_LIMIT)
  const contents: ModelContents = trimmed.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))

  return streamReply(auth, contents, sessionId ? null : { sessionId: objectId.toString() }, async ({ text: fullText, proposal }) => {
    if (!fullText) return
    const modelMsg: StoredChatMessage = proposal
      ? captureMessage(fullText, proposal)
      : { role: 'model', text: fullText, createdAt: new Date() }
    await sessions.updateOne(
      { _id: objectId },
      {
        $push: { messages: { $each: [modelMsg], $slice: -MAX_SESSION_MESSAGES } },
        $set: { updatedAt: new Date() },
      } as never,
    )
  }, { captureCapable, route })
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate

  const aiOff = await aiDisabledResponse()
  if (aiOff) return aiOff

  // Clients that can review a capture proposal may still log spends over the
  // allowance (lib/ai/allowance.ts exempts capture); everyone else stops here.
  const captureCapable = req.headers.get(CAPTURE_HEADER) === '1'
  const overAllowance = await aiAllowanceResponse(auth)
  if (overAllowance && !captureCapable) return overAllowance

  if (await rateLimited(auth)) {
    return error('Too many messages. Try again in a bit.', 429)
  }

  const body = await readBody(req)

  return auth.readOnly
    ? handleDemo(auth, body, captureCapable)
    : handlePersisted(auth, body, { captureCapable, overAllowance })
}
