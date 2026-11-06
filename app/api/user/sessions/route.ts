import { json, error } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { getWorkOSClient } from '@/lib/workosClient'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  const sessions = await getWorkOSClient().userManagement.listSessions(auth.userId)
  const active = sessions.data
    .filter((s) => s.status === 'active')
    .map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      authMethod: s.authMethod,
      createdAt: s.createdAt,
      current: s.id === auth.sessionId,
    }))
    .sort((a, b) => (a.current === b.current ? 0 : a.current ? -1 : 1))

  return json({ data: active })
}

/** No `id` query param revokes every active session, including the current one. */
export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  const guard = readOnlyGuard(auth, 'DELETE')
  if (guard) return guard

  const workos = getWorkOSClient()
  const id = new URL(req.url).searchParams.get('id')

  if (id) {
    const sessions = await workos.userManagement.listSessions(auth.userId)
    if (!sessions.data.some((s) => s.id === id)) return error('session not found', 404)
    await workos.userManagement.revokeSession({ sessionId: id })
    return json({ ok: true })
  }

  const sessions = await workos.userManagement.listSessions(auth.userId)
  await Promise.all(
    sessions.data.filter((s) => s.status === 'active').map((s) => workos.userManagement.revokeSession({ sessionId: s.id })),
  )
  return json({ ok: true })
}
