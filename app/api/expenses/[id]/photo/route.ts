import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { PHOTO_EXT_BY_MIME, MAX_PHOTO_BYTES, putExpensePhoto, deleteExpensePhoto, deleteExpensePhotoQuietly, getExpensePhotoUrl } from '@/lib/expensePhoto'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Auth, access, read-only guard (writes only), id check, then the caller's
 * own live expense. Returns a Response to send back on any failure.
 *
 * Photo writes touch only `photo_ext`, never `version`: the version guards the
 * row's fields, and attaching a photo mustn't 409 someone's concurrent edit.
 */
async function load(req: Request, ctx: Ctx, method: string) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, method)
  if (guard) return guard
  const { id } = await ctx.params
  if (!ObjectId.isValid(id)) return error('a valid expense id is required', 400)
  const coll = await getCollection('expenses', auth)
  const _id = new ObjectId(id)
  const found = await coll.findOne({ _id })
  if (!found) return error('expense not found', 404)
  return { auth, coll, _id, id, ext: typeof found.photo_ext === 'string' ? found.photo_ext : null }
}

/** `POST /api/expenses/[id]/photo` — `{ image: base64, mimeType }`. Attaches or replaces the photo. */
export async function POST(req: Request, ctx: Ctx) {
  const loaded = await load(req, ctx, 'POST')
  if (loaded instanceof Response) return loaded
  const { auth, coll, _id, id, ext: oldExt } = loaded

  const body = await readBody(req)
  const image = typeof body.image === 'string' ? body.image : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
  if (!PHOTO_EXT_BY_MIME[mimeType]) return error('mimeType must be image/jpeg, image/png, or image/webp', 400)
  if (!image) return error('image required', 400)
  // Reject on length before decoding so a huge body is never buffered twice.
  if (image.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4) return error('image too large (max 5MB)', 413)
  const buffer = Buffer.from(image, 'base64')
  if (buffer.length === 0) return error('image required', 400)
  if (buffer.length > MAX_PHOTO_BYTES) return error('image too large (max 5MB)', 413)

  const ext = await putExpensePhoto(auth.userId, id, buffer, mimeType)
  const stamped = await coll.updateOne({ _id }, { $set: { photo_ext: ext } })
  // Deleted mid-upload: the expense's own delete already ran its cleanup, so this blob would be an orphan.
  if (stamped.matchedCount !== 1) {
    await deleteExpensePhotoQuietly(auth.userId, id, ext)
    return error('expense not found', 404)
  }
  if (oldExt && oldExt !== ext) await deleteExpensePhotoQuietly(auth.userId, id, oldExt)

  return json({ ok: true, url: await getExpensePhotoUrl(auth.userId, id, ext) })
}

/** `GET /api/expenses/[id]/photo` — `{ url }`, a short-lived signed GET, or 404 when there's no photo. */
export async function GET(req: Request, ctx: Ctx) {
  const loaded = await load(req, ctx, 'GET')
  if (loaded instanceof Response) return loaded
  if (!loaded.ext) return error('no photo', 404)
  return json({ url: await getExpensePhotoUrl(loaded.auth.userId, loaded.id, loaded.ext) })
}

/** `DELETE /api/expenses/[id]/photo` — idempotent. */
export async function DELETE(req: Request, ctx: Ctx) {
  const loaded = await load(req, ctx, 'DELETE')
  if (loaded instanceof Response) return loaded
  const { auth, coll, _id, id, ext } = loaded
  if (ext) {
    await deleteExpensePhoto(auth.userId, id, ext)
    await coll.updateOne({ _id }, { $unset: { photo_ext: '' } })
  }
  return json({ ok: true })
}

