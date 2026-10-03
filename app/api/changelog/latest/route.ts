import { getAuth } from '@/lib/access'
import { json, error } from '@/lib/http'
import { latestUnseenRelease } from '@/lib/changelog'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  return json({ release: await latestUnseenRelease(auth.userId) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
