import { getAuth } from '@/lib/access'
import { json, error } from '@/lib/http'
import { publishedChangelog, serializeRelease } from '@/lib/changelog'

export const dynamic = 'force-dynamic'

/** Every published release for one platform, newest first. Backs the mobile Changelog screen. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  const platform = new URL(req.url).searchParams.get('platform') === 'mobile' ? 'mobile' : 'web'
  const releases = (await publishedChangelog(platform)).map(serializeRelease)
  return json({ releases }, { headers: { 'Cache-Control': 'private, no-store' } })
}
