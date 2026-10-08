import { getAuth } from '@/lib/access'
import { json, error } from '@/lib/http'
import { latestUnseenRelease } from '@/lib/changelog'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  const platform = new URL(req.url).searchParams.get('platform') === 'mobile' ? 'mobile' : 'web'
  return json({ release: await latestUnseenRelease(auth.userId, platform) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
