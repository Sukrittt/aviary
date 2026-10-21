import { json } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { listImports } from '@/lib/import/undo'

export const dynamic = 'force-dynamic'

/** `GET /api/import/history`: the budget's imports, newest first, each one undoable from Settings. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  return json({ imports: await listImports(auth) })
}
