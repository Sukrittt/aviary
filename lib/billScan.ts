import { ObjectId } from 'mongodb'
import { put, issueSignedToken, presignUrl } from '@vercel/blob'
import { getDb } from '@/lib/mongodb'
import { scoped } from '@/lib/scoped'
import { COLLECTIONS } from '@/lib/models'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Uploads the scanned bill image to Blob storage and attaches it to the
 * already-inserted `bill_scans` row. Runs in `after()` (see route.ts) so the
 * confirm request isn't held up by the upload — the row exists with
 * `image_status: 'pending'` the instant it's created, same two-phase shape as
 * `lib/exports.ts`'s `buildAndStoreExport`. Never throws: the row is left
 * queryable either way, with `image_status` telling a future viewer whether
 * the photo made it.
 */
export async function storeBillScanImage(
  userId: string,
  billId: string,
  image: string,
  mimeType: string,
): Promise<void> {
  const db = await getDb()
  const coll = scoped(db.collection(COLLECTIONS.billScans), userId)

  try {
    const buffer = Buffer.from(image, 'base64')
    const ext = EXT_BY_MIME[mimeType] ?? 'jpg'
    const blob = await put(`bills/${userId}/${billId}.${ext}`, buffer, {
      access: 'private',
      contentType: mimeType,
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    await coll.updateOne(
      { _id: new ObjectId(billId) },
      { $set: { image_url: blob.url, image_status: 'ready', image_ext: ext } },
    )
  } catch (err) {
    console.error('bill scan: image upload failed for', userId, billId, err)
    await coll.updateOne({ _id: new ObjectId(billId) }, { $set: { image_status: 'failed' } })
  }
}

const BILL_IMAGE_URL_TTL_MS = 5 * 60 * 1000

/**
 * Mints a short-lived signed GET URL for a stored bill image — same reasoning
 * as `getExportDownloadUrl`: the Blob store is private, so there's no plain
 * URL to hand out. `ext` is the one stamped on the row by the upload above,
 * since the pathname needs it and the format isn't otherwise derivable.
 */
export async function getBillScanImageUrl(userId: string, billId: string, ext: string): Promise<string> {
  const pathname = `bills/${userId}/${billId}.${ext}`
  const signed = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil: Date.now() + BILL_IMAGE_URL_TTL_MS,
  })
  const { presignedUrl } = await presignUrl(signed, { operation: 'get', pathname, access: 'private' })
  return presignedUrl
}
