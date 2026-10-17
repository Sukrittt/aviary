import { after } from 'next/server'
import { json, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { ImportError } from '@/lib/import/normalize'
import { commitImport, parseEdits } from '@/lib/import/commit'
import { passAndChain } from '@/lib/import/backfill'
import { importErrorResponse } from '@/lib/import/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
/** A pass stops this long before `maxDuration`, so it always finishes its chunk and lets go of the lease. */
const PASS_BUDGET_MS = (maxDuration - 10) * 1000

/**
 * `POST /api/import/commit` `{ importId, currency, direction, groups, categories, accounts, salary }`.
 * Sets the account up and starts the trial synchronously, then starts the
 * history backfill after the response. Safe to retry: it returns the same import.
 */
export async function POST(req: Request) {
  const startedAt = Date.now()
  const auth = await getAuth(req)
  const gate = await requireAccess(auth, { setup: true })
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard
  try {
    const body = await readBody(req)
    if (typeof body.importId !== 'string') throw new ImportError('invalid')
    const result = await commitImport(auth, body.importId, parseEdits(body))
    after(() => passAndChain(auth, result.importId, startedAt + PASS_BUDGET_MS, new URL(req.url).origin))
    return json(result)
  } catch (err) {
    return importErrorResponse(err)
  }
}
