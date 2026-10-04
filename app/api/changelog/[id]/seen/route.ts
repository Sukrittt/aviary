import { getAuth } from '@/lib/access'
import { json, error } from '@/lib/http'
import { changelogId, claimRelease } from '@/lib/changelog'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)
  const { id } = await params
  if (!changelogId(id)) return error('invalid release id')
  return json({ release: await claimRelease(auth.userId, id) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
