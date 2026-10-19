import { after } from 'next/server'
import { json, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { ImportError } from '@/lib/import/normalize'
import { passAndChain, retryImport } from '@/lib/import/backfill'
import { importErrorResponse, loadImport } from '@/lib/import/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const PASS_BUDGET_MS = (maxDuration - 10) * 1000

/**
 * `POST /api/import/continue` `{ importId, retry? }`: one more backfill pass,
 * after the response. The banner's poll calls it while an import is
 * `importing` and unleased; the lease makes a second call a no-op. `retry`
 * restarts a failed import where its failures began.
 */
export async function POST(req: Request) {
  const startedAt = Date.now()
  const auth = await getAuth(req)
  // Setup too: onboarding's done screen polls and continues the import before the trial starts.
  const gate = await requireAccess(auth, { setup: true })
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard
  try {
    const body = await readBody(req)
    if (typeof body.importId !== 'string') throw new ImportError('invalid')
    const doc = await loadImport(auth, body.importId)
    if (body.retry === true) await retryImport(auth, body.importId)
    else if (doc.status !== 'importing') return json({ ok: true, status: doc.status })
    after(() => passAndChain(auth, body.importId as string, startedAt + PASS_BUDGET_MS))
    return json({ ok: true, status: 'importing' })
  } catch (err) {
    return importErrorResponse(err)
  }
}
