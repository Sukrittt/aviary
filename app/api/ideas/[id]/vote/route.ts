import { getAuth } from '@/lib/access'
import { json, error, readBody } from '@/lib/http'
import { isRateLimited } from '@/lib/rateLimit'
import { castVote } from '@/lib/ideas'

export const dynamic = 'force-dynamic'

/**
 * Sets the caller's vote: 1 up, -1 down, 0 none. The client works out the
 * toggle (tap the same arrow to clear, the other to switch) and sends the
 * resulting value, so a retried request is idempotent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  const { id } = await params
  const { value } = await readBody(req)
  if (value !== 1 && value !== -1 && value !== 0) return error('value must be 1, -1 or 0')
  if (await isRateLimited(`idea-votes:${auth.userId}`, { windowMs: 60 * 1000, limit: 60 })) return error('rate limited', 429)
  const result = await castVote(id, auth.userId, value)
  if (!result) return error('not found', 404)
  return json(result)
}
