import { ObjectId } from 'mongodb'
import { getCollection, json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { getExportDownloadUrl } from '@/lib/exports'

export const dynamic = 'force-dynamic'

/** Mints a short-lived signed URL for a ready export — the blob store is private, so there's no plain URL to hand out. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return error('invalid id', 400)

  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  const exports = await getCollection('exports', auth)
  const doc = await exports.findOne({ _id: new ObjectId(id) })
  if (!doc || doc.status !== 'ready') return error('export not ready', 404)

  const url = await getExportDownloadUrl(auth.spaceId, id)
  return json({ url })
}
