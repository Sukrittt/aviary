import { getAuth } from '@/lib/access'
import { json, error, readBody } from '@/lib/http'
import { isRateLimited } from '@/lib/rateLimit'
import { createIdea, isIdeaStatus, listIdeas } from '@/lib/ideas'

export const dynamic = 'force-dynamic'

const BURST_WINDOW_MS = 5 * 60 * 1000
const BURST_LIMIT = 2
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000
const DAY_LIMIT = 8

const TITLE_MAX = 150
const DESCRIPTION_MAX = 4000

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } }

/** The public ideas board. Signed-in only: ideas carry authors' first names, so the demo user gets nothing. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  const url = new URL(req.url)
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top'
  const status = url.searchParams.get('status')
  return json({ ideas: await listIdeas(auth.userId, { sort, status: isIdeaStatus(status) ? status : undefined }) }, NO_STORE)
}

/** Posts an idea straight onto the board. No review step; the admin hides spam afterwards. */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  const body = await readBody(req)
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, TITLE_MAX) : ''
  if (!title) return error('title required')
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, DESCRIPTION_MAX) : ''

  if (
    await isRateLimited(`ideas:${auth.userId}`, [
      { windowMs: BURST_WINDOW_MS, limit: BURST_LIMIT },
      { windowMs: DAY_WINDOW_MS, limit: DAY_LIMIT },
    ])
  ) {
    return error('rate limited', 429)
  }

  return json(await createIdea(auth.userId, title, description), { status: 201 })
}
