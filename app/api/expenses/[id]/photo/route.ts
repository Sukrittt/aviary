import { ObjectId } from 'mongodb'
import { json, error, readBody, getCollection } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { PHOTO_EXT_BY_MIME, MAX_PHOTO_BYTES, putExpensePhoto, deleteExpensePhoto, deleteExpensePhotoQuietly, getExpensePhotoUrl } from '@/lib/expensePhoto'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const fileOf = (doc: Record<string, unknown>) => (typeof doc.photo_file === 'string' ? doc.photo_file : null)

/**
 * Auth, access, read-only guard (writes only), id check, then the caller's
 * own live expense. Returns a Response to send back on any failure.
 *
 * Photo writes touch only `photo_file`, never `version`: the version guards the
 * row's fields, and attaching a photo mustn't 409 someone's concurrent edit.
 */
async function load(req: Request, ctx: Ctx, method: string) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, method)
  if (guard) return guard
  const { id: rawId } = await ctx.params
  if (!ObjectId.isValid(rawId)) return error('a valid expense id is required', 400)
  const coll = await getCollection('expenses', auth)
  const _id = new ObjectId(rawId)
  // The blob key uses the canonical hex, so an uppercase id still finds the same photo.
  const id = _id.toHexString()
  const found = await coll.findOne({ _id })
  if (!found) return error('expense not found', 404)
  return { auth, coll, _id, id, file: fileOf(found) }
}

/** `POST /api/expenses/[id]/photo` — `{ image: base64, mimeType }`. Attaches or replaces the photo. */
export async function POST(req: Request, ctx: Ctx) {
  const loaded = await load(req, ctx, 'POST')
  if (loaded instanceof Response) return loaded
  const { auth, coll, _id, id } = loaded

  const body = await readBody(req)
  const image = typeof body.image === 'string' ? body.image : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
  if (!Object.hasOwn(PHOTO_EXT_BY_MIME, mimeType)) return error('mimeType must be image/jpeg, image/png, or image/webp', 400)
  if (!image) return error('image required', 400)
  // Reject on length before decoding so a huge body is never buffered twice.
  if (image.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4) return error('image too large (max 5MB)', 413)
  // Buffer.from skips bad characters instead of failing, so junk would store as an unviewable photo.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return error('image must be base64', 400)
  const buffer = Buffer.from(image, 'base64')
  if (buffer.length === 0) return error('image required', 400)
  if (buffer.length > MAX_PHOTO_BYTES) return error('image too large (max 5MB)', 413)

  const file = await putExpensePhoto(auth.userId, id, buffer, mimeType)
  // Swap only from the file we last read, so two uploads racing each other
  // each delete exactly the blob they replaced and nothing is orphaned.
  let prev = loaded.file
  for (let attempt = 0; attempt < 3; attempt++) {
    const swapped = await coll.updateOne({ _id, photo_file: prev }, { $set: { photo_file: file } })
    if (swapped.matchedCount === 1) {
      if (prev) await deleteExpensePhotoQuietly(auth.userId, id, prev)
      return json({ ok: true, url: await getExpensePhotoUrl(auth.userId, id, file) })
    }
    const current = await coll.findOne({ _id })
    // Deleted mid-upload: the expense's own delete already ran its cleanup, so this blob would be an orphan.
    if (!current) break
    prev = fileOf(current)
  }
  await deleteExpensePhotoQuietly(auth.userId, id, file)
  return error('expense not found', 404)
}

/** `GET /api/expenses/[id]/photo` — `{ url }`, a short-lived signed GET, or 404 when there's no photo. */
export async function GET(req: Request, ctx: Ctx) {
  const loaded = await load(req, ctx, 'GET')
  if (loaded instanceof Response) return loaded
  if (!loaded.file) return error('no photo', 404)
  return json({ url: await getExpensePhotoUrl(loaded.auth.userId, loaded.id, loaded.file) })
}

/** `DELETE /api/expenses/[id]/photo` — idempotent. */
export async function DELETE(req: Request, ctx: Ctx) {
  const loaded = await load(req, ctx, 'DELETE')
  if (loaded instanceof Response) return loaded
  const { auth, coll, _id, id, file } = loaded
  if (file) {
    await deleteExpensePhoto(auth.userId, id, file)
    // Only clear the file we deleted: a replacement stamped meanwhile has its own blob and keeps it.
    await coll.updateOne({ _id, photo_file: file }, { $unset: { photo_file: '' } })
  }
  return json({ ok: true })
}

