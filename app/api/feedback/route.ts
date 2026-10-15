import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { isRateLimited } from '@/lib/rateLimit'
import { triageFeedback } from '@/lib/ai/feedbackTriage'
import { recordFeedback, putFeedbackScreenshot, deleteFeedbackScreenshotQuietly } from '@/lib/feedback'
import { decodePhoto } from '@/lib/expensePhoto'

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

  // Optional, bugs only: `{ image: base64, mimeType }`. Validated before triage
  // so a bad upload fails fast, but stored only once the report is known good.
  let screenshotBytes: { buffer: Buffer; mimeType: string } | null = null
  if (type === 'bug' && body.screenshot && typeof body.screenshot === 'object') {
    const raw = body.screenshot as Record<string, unknown>
    const decoded = decodePhoto(raw.image, raw.mimeType)
    if ('error' in decoded) return error(decoded.error, decoded.status)
    screenshotBytes = { buffer: decoded.buffer, mimeType: raw.mimeType as string }
  }

  // Triage reads only the text. A screenshot can show balances, so it never reaches the model.
  const triage = await triageFeedback(title, description, { userId: auth.userId, feature: 'feedback' }).catch(() => null)

  let screenshot: string | null = null
  try {
    if (screenshotBytes) screenshot = await putFeedbackScreenshot(auth.userId, screenshotBytes.buffer, screenshotBytes.mimeType)
    await recordFeedback({
      userId: auth.userId,
      type,
      title,
      description,
      diagnostics,
      area: triage?.area ?? null,
      severity: triage?.severity ?? null,
      screenshot,
    })
  } catch (err) {
    console.error('feedback insert failed:', err)
    if (screenshot) await deleteFeedbackScreenshotQuietly(screenshot)
    return error('could not send that', 502)
  }

  return json({ ok: true })
}
