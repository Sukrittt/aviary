import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { isRateLimited } from '@/lib/rateLimit'
import { triageFeedback } from '@/lib/ai/feedbackTriage'
import { recordFeedback } from '@/lib/feedback'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BURST_WINDOW_MS = 5 * 60 * 1000
const BURST_LIMIT = 2
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000
const DAY_LIMIT = 8

const TITLE_MAX = 150
const DESCRIPTION_MAX = 4000

/** Coerces an unknown diagnostics field to a short trusted string — the client supplies these, so shape is never assumed. */
function diag(value: unknown): string {
  return String(value ?? 'unknown').slice(0, 200)
}

/**
 * Records feedback from the signed-in user into the `feedback` collection,
 * reviewed at /admin/feedback. No longer files a public GitHub issue.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  if (
    await isRateLimited(`feedback:${auth.userId}`, [
      { windowMs: BURST_WINDOW_MS, limit: BURST_LIMIT },
      { windowMs: DAY_WINDOW_MS, limit: DAY_LIMIT },
    ])
  ) {
    return error('rate limited', 429)
  }

  const body = await readBody(req)
  const type = body.type === 'bug' || body.type === 'idea' ? body.type : null
  if (!type) return error('type required')

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, TITLE_MAX) : ''
  if (!title) return error('title required')

  const description = typeof body.description === 'string' ? body.description.trim().slice(0, DESCRIPTION_MAX) : ''
  if (!description) return error('description required')

  const rawDiagnostics = (body.diagnostics && typeof body.diagnostics === 'object' ? body.diagnostics : {}) as Record<string, unknown>
  const diagnostics = {
    appVersion: diag(rawDiagnostics.appVersion),
    device: diag(rawDiagnostics.device),
    screen: diag(rawDiagnostics.screen),
  }

  const triage = await triageFeedback(title, description, { userId: auth.userId, feature: 'feedback' }).catch(() => null)

  try {
    await recordFeedback({
      userId: auth.userId,
      type,
      title,
      description,
      diagnostics,
      area: triage?.area ?? null,
      severity: triage?.severity ?? null,
    })
  } catch (err) {
    console.error('feedback insert failed:', err)
    return error('could not send that', 502)
  }

  return json({ ok: true })
}
