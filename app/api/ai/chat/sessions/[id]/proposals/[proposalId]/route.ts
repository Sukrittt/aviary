import { ObjectId } from 'mongodb'
import { getCollection, json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { COLLECTIONS } from '@/lib/models'
import { MAX_CAPTURE_ITEMS } from '@/lib/ai/capture'
import { isAckPhrase, pickAck } from '@/src/lib/captureAck'
import { MAX_SESSION_MESSAGES, type StoredChatMessage } from '@/lib/ai/chatSessions'

export const dynamic = 'force-dynamic'

const PROPOSAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Moves a capture proposal (lib/ai/capture.ts) out of `pending`, once:
 * `submitted` after the app logged its rows, with the expense ids, or
 * `dismissed`. Only the plaintext status fields beside the encrypted proposal
 * change, so this is one positional update with nothing to decrypt.
 *
 * `submitted` also saves Ask Aviary's line under the card (src/lib/captureAck.ts)
 * and answers with it as `reply`. The app picks the line so it shows at once and
 * sends it as `reply`; anything not from the list, or none (older apps), gets a
 * line picked here. A retry returns the saved line, or writes it if the first
 * attempt marked the status but failed before saving it.
 *
 * Sending the answer it already has is a no-op, since the app retries this
 * best effort after logging. A different answer is a 409. Logging twice is
 * prevented by the rows' client_ids, not by this status: it only decides what
 * a reopened chat shows.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await params
  if (!ObjectId.isValid(id) || !PROPOSAL_ID.test(proposalId)) return error('invalid id', 400)

  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'PATCH')
  if (guard) return guard

  const body = await readBody(req)
  const status = body.status
  if (status !== 'submitted' && status !== 'dismissed') return error('status must be submitted or dismissed')

  let expenseIds: string[] | undefined
  if (body.expenseIds !== undefined) {
    const ids = body.expenseIds
    if (
      status !== 'submitted' ||
      !Array.isArray(ids) ||
      ids.length > MAX_CAPTURE_ITEMS ||
      !ids.every((e) => typeof e === 'string' && ObjectId.isValid(e))
    ) {
      return error('invalid expenseIds')
    }
    expenseIds = ids as string[]
  }

  const sessions = await getCollection(COLLECTIONS.chatSessions, auth)
  const sessionId = new ObjectId(id)
  const result = await sessions.updateOne(
    { _id: sessionId, messages: { $elemMatch: { proposalId, proposalStatus: 'pending' } } },
    { $set: { 'messages.$.proposalStatus': status, ...(expenseIds ? { 'messages.$.expenseIds': expenseIds } : {}) } },
  )
  if (result.matchedCount === 0) {
    const doc = await sessions.findOne({ _id: sessionId }, { projection: { 'messages.proposalId': 1, 'messages.proposalStatus': 1 } })
    const current = ((doc?.messages as StoredChatMessage[] | undefined) ?? []).find((m) => m.proposalId === proposalId)
    if (!current) return error('proposal not found', 404)
    if (current.proposalStatus !== status) {
      return json({ error: `This proposal was already ${current.proposalStatus}.`, status: current.proposalStatus }, { status: 409 })
    }
  }
  if (status !== 'submitted') return json({ status })

  // The reply goes right after its card, or is the one already there.
  const doc = await sessions.findOne({ _id: sessionId }, { projection: { 'messages.proposalId': 1, 'messages.ack': 1, 'messages.text': 1 } })
  const messages = (doc?.messages as StoredChatMessage[] | undefined) ?? []
  const at = messages.findIndex((m) => m.proposalId === proposalId)
  if (at >= 0 && messages[at + 1]?.ack) return json({ status, reply: messages[at + 1].text })

  const reply = isAckPhrase(body.reply) ? body.reply : pickAck()
  if (at >= 0) {
    const ack: StoredChatMessage = { role: 'model', text: reply, createdAt: new Date(), ack: true }
    await sessions.updateOne(
      { _id: sessionId },
      { $push: { messages: { $each: [ack], $position: at + 1, $slice: -MAX_SESSION_MESSAGES } }, $set: { updatedAt: ack.createdAt } } as never,
    )
  }
  return json({ status, reply })
}
