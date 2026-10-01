import { getCollection, json, parsePageParams } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { COLLECTIONS } from '@/lib/models'
import { makeTitle, type StoredChatMessage } from '@/lib/ai/chatSessions'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100
// ponytail: search covers only the newest sessions; store a searchable title index if users outgrow it.
const SEARCH_SCAN_LIMIT = 1000

/**
 * List the current user's chat sessions, newest first, paginated and optionally
 * filtered by title. No full transcripts — just enough for a history list.
 *
 * Titles require decryption for search. Stream those separately, then fetch
 * only the requested page and its final messages for previews.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const sessions = await getCollection(COLLECTIONS.chatSessions, auth)

  const url = new URL(req.url)
  const { page, limit } = parsePageParams(url, { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT })
  const q = url.searchParams.get('q')?.trim().toLowerCase().slice(0, 200)
  const sort = { updatedAt: -1, _id: -1 } as const
  const preview = { $project: {
    title: 1, updatedAt: 1,
    messages: { $slice: [{ $ifNull: ['$messages', []] }, -1] },
    messageCount: { $size: { $ifNull: ['$messages', []] } },
  } }
  const start = (page - 1) * limit
  let total: number
  let pageRows: Record<string, unknown>[]
  if (q) {
    total = 0
    const ids: unknown[] = []
    const cursor = sessions.find({}, { projection: { title: 1 } }).sort(sort).limit(SEARCH_SCAN_LIMIT).batchSize(250)
    try {
      for await (const row of cursor) {
        if (!String(row.title ?? '').toLowerCase().includes(q)) continue
        if (total >= start && ids.length < limit) ids.push(row._id)
        total++
      }
    } finally {
      await cursor.close()
    }
    pageRows = await sessions.aggregate([{ $match: { _id: { $in: ids } } }, { $sort: sort }, preview]).toArray()
  } else {
    [total, pageRows] = await Promise.all([
      sessions.countDocuments({}),
      sessions.aggregate([{ $sort: sort }, { $skip: start }, { $limit: limit }, preview]).toArray(),
    ])
  }
  const pageCount = Math.max(1, Math.ceil(total / limit))

  return json({
    sessions: pageRows.map((r) => {
      const messages = Array.isArray(r.messages) ? (r.messages as StoredChatMessage[]) : []
      return {
        id: String(r._id),
        title: r.title,
        updatedAt: r.updatedAt,
        preview: makeTitle(messages.at(-1)?.text ?? ''),
        messageCount: Number(r.messageCount),
      }
    }),
    total,
    page,
    pageCount,
  })
}
