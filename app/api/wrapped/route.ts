import { json } from '@/lib/http'
import { nowForUser } from '@/lib/userCurrency'
import { getAuth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { currentEdition, readWrapped } from '@/lib/wrapped'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const month = new URL(req.url).searchParams.get('month') ?? currentEdition((await nowForUser(auth.userId)).date)
  return json(await readWrapped(auth, month))
}
