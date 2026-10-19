import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { isRateLimited } from '@/lib/rateLimit'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { aiAllowanceResponse } from '@/lib/ai/allowance'
import { buildStatementProposal, MAX_SCREENSHOTS, StatementError, type StatementSource } from '@/lib/statement'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Under the platform's 4.5MB body cap, for all screenshots together or one file. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
/** The images' base64, kept under the platform's 4.5MB request cap so an oversized upload gets this route's 413, not a bare one. */
const MAX_BODY_LEN = 4_400_000
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const TABLE_FILE = /\.(csv|tsv|txt|xlsx)$/i

const STATUS: Record<StatementError['code'], number> = { unreadable: 400, empty: 400, pdf_locked: 400, too_big: 413 }

/**
 * `POST /api/expenses/statement`: reads the days someone didn't log from
 * what they upload, and proposes expenses. JSON `{ images: [{ data, mimeType }] }`
 * for up to five UPI or bank-app screenshots, or multipart with one `file`
 * (csv, xlsx or an unlocked pdf). Writes nothing: the app logs what the user
 * keeps through POST /api/expenses. Errors are `{ error: code }` for the app
 * to word. Gated like bill scan: access, the AI switch and allowance, a rate limit.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const aiOff = await aiDisabledResponse()
  if (aiOff) return aiOff
  const overAllowance = await aiAllowanceResponse(auth)
  if (overAllowance) return overAllowance

  if (
    await isRateLimited(`statement:${auth.userId}`, [
      { windowMs: 60_000, limit: 3 },
      { windowMs: 3_600_000, limit: 20 },
    ])
  ) {
    return error('rate limited', 429)
  }

  let source: StatementSource
  if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: 'too_big' }, { status: 413 })
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return error('file required')
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'too_big' }, { status: 413 })
    const data = Buffer.from(await file.arrayBuffer())
    const name = file.name || ''
    if (/\.pdf$/i.test(name) || file.type === 'application/pdf') source = { kind: 'pdf', data }
    else if (TABLE_FILE.test(name)) source = { kind: 'table', data, filename: name }
    else return json({ error: 'unreadable' }, { status: 400 })
  } else {
    const body = await readBody(req)
    const images = Array.isArray(body.images) ? body.images : []
    if (images.length === 0 || images.length > MAX_SCREENSHOTS) return error(`1 to ${MAX_SCREENSHOTS} images required`)
    let total = 0
    for (const i of images) {
      if (!i || typeof i.data !== 'string' || !i.data || !IMAGE_TYPES.includes(i.mimeType)) return error('each image needs base64 data and a jpeg, png or webp mimeType')
      total += i.data.length
    }
    if (total > MAX_BODY_LEN) return json({ error: 'too_big' }, { status: 413 })
    source = { kind: 'images', images: images.map((i: { data: string; mimeType: string }) => ({ data: i.data, mimeType: i.mimeType })) }
  }

  try {
    return json(await buildStatementProposal(auth, source))
  } catch (err) {
    if (err instanceof StatementError) return json({ error: err.code }, { status: STATUS[err.code] })
    console.error('statement: read failed', err)
    return json({ error: 'failed' }, { status: 502 })
  }
}
