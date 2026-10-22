import { json, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { ImportError } from '@/lib/import/normalize'
import { importErrorResponse } from '@/lib/import/service'
import { undoImport } from '@/lib/import/undo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** `POST /api/import/undo` `{ importId }`: archives every row that import booked. Safe to retry. */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard
  try {
    const body = await readBody(req)
    if (typeof body.importId !== 'string') throw new ImportError('invalid')
    await undoImport(auth, body.importId)
    return json({ ok: true })
  } catch (err) {
    return importErrorResponse(err)
  }
}
