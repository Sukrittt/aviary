import { ObjectId } from 'mongodb'
import { getCollection, json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { COLLECTIONS } from '@/lib/models'
import { toClientMessage, type StoredChatMessage } from '@/lib/ai/chatSessions'

export const dynamic = 'force-dynamic'

/**
 * One session's full transcript. Scoped lookup — an id owned by another user 404s, not 403s.
 * A capture reply comes back with its proposal parsed and its current status, so the app can
 * show the review card again, or a read-only summary once it was logged or dismissed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return error('invalid id', 400)

  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const sessions = await getCollection(COLLECTIONS.chatSessions, auth)

  const doc = await sessions.findOne({ _id: new ObjectId(id) })
  if (!doc) return error('session not found', 404)

  return json({
    id: String(doc._id),
    title: doc.title,
    messages: ((doc.messages as StoredChatMessage[] | undefined) ?? []).map(toClientMessage),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  })
}
