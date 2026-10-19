import { randomBytes } from 'node:crypto'
import { put, del, rename, issueSignedToken, presignUrl } from '@vercel/blob'

/** The formats a client may upload, and the extension each is stored under. */
export const PHOTO_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Decoded size cap, a backstop. Clients downscale to ~1280px JPEG first, except Mobile builds without expo-image-manipulator, which send the camera's full resolution. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

const PHOTO_URL_TTL_MS = 5 * 60 * 1000
// Activity's photo feed: long enough that an image the client already cached
// under this URL keeps loading while someone scrolls back up. Clients reuse a
// feed URL for 25 minutes (src/lib/activityFeed.ts), which must stay under
// the half-TTL `signPhotoUrl` guarantees is left on any URL it returns.
export const FEED_PHOTO_URL_TTL_MS = 60 * 60 * 1000

/**
 * Validates a client's `{ image: base64, mimeType }` upload, shared by expense
 * photos and bug report screenshots. Returns the decoded bytes, or the error
 * to send back.
 */
export function decodePhoto(image: unknown, mimeType: unknown): { buffer: Buffer } | { error: string; status: 400 | 413 } {
  if (typeof mimeType !== 'string' || !Object.hasOwn(PHOTO_EXT_BY_MIME, mimeType)) return { error: 'mimeType must be image/jpeg, image/png, or image/webp', status: 400 }
  if (typeof image !== 'string' || !image) return { error: 'image required', status: 400 }
  // Reject on length before decoding so a huge body is never buffered twice.
  if (image.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4) return { error: 'image too large (max 5MB)', status: 413 }
  // Buffer.from skips bad characters instead of failing, so junk would store as an unviewable photo.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return { error: 'image must be base64', status: 400 }
  const buffer = Buffer.from(image, 'base64')
  if (buffer.length === 0) return { error: 'image required', status: 400 }
  if (buffer.length > MAX_PHOTO_BYTES) return { error: 'image too large (max 5MB)', status: 413 }
  return { buffer }
}

// ponytail: per-instance, pruned of expired entries on each new signing. A
// shared store only pays off once traffic spreads across many instances.
const signedUrls = new Map<string, { url: string; until: number }>()

/**
 * Short-lived signed GET URL for any private photo blob, reused while at least
 * half its lifetime is left. Each new one is a round trip to the Blob API
 * (served from iad1, a few hundred ms from our bom1 functions), which a feed
 * refetch paid for every photo on the page. Reusing it also keeps the URL
 * stable, so the app's image cache hits instead of downloading the photo again.
 */
export async function signPhotoUrl(pathname: string, ttlMs = PHOTO_URL_TTL_MS): Promise<string> {
  const key = `${ttlMs}:${pathname}`
  const now = Date.now()
  const cached = signedUrls.get(key)
  if (cached && cached.until - now > ttlMs / 2) return cached.url

  const until = now + ttlMs
  const signed = await issueSignedToken({ pathname, operations: ['get'], validUntil: until })
  const { presignedUrl } = await presignUrl(signed, { operation: 'get', pathname, access: 'private' })
  for (const [k, v] of signedUrls) if (v.until <= now) signedUrls.delete(k)
  signedUrls.set(key, { url: presignedUrl, until })
  return presignedUrl
}

// `file` is the expense's `photo_file`, e.g. `3f9a1c0b7d2e4a65.jpg`.
const pathnameOf = (userId: string, expenseId: string, file: string) => `expense-photos/${userId}/${expenseId}-${file}`

/**
 * Stores an expense's one photo, same private-Blob shape as `lib/billScan.ts`.
 * Every upload gets its own pathname, so a delete racing a replacement can
 * only ever remove the blob it read, never the new one. Returns the
 * `photo_file` to stamp on the expense.
 */
export async function putExpensePhoto(userId: string, expenseId: string, buffer: Buffer, mimeType: string): Promise<string> {
  const file = `${randomBytes(8).toString('hex')}.${PHOTO_EXT_BY_MIME[mimeType]}`
  await put(pathnameOf(userId, expenseId, file), buffer, {
    access: 'private',
    contentType: mimeType,
    addRandomSuffix: false,
  })
  return file
}

export async function deleteExpensePhoto(userId: string, expenseId: string, file: string): Promise<void> {
  await del(pathnameOf(userId, expenseId, file))
}

/** For cleanup paths (replace, expense delete): logs instead of failing the caller's write. */
export async function deleteExpensePhotoQuietly(userId: string, expenseId: string, file: string): Promise<void> {
  try {
    await deleteExpensePhoto(userId, expenseId, file)
  } catch (err) {
    console.error('expense photo: blob delete failed for', userId, expenseId, err)
  }
}

/** Carries a photo to another budget along with its expense ("Move to another budget"). */
export async function moveExpensePhoto(fromSpaceId: string, toSpaceId: string, expenseId: string, file: string): Promise<void> {
  await rename(pathnameOf(fromSpaceId, expenseId, file), pathnameOf(toSpaceId, expenseId, file), { access: 'private' })
}

/** Short-lived signed GET URL, same reasoning as `getBillScanImageUrl`: the store is private. */
export async function getExpensePhotoUrl(userId: string, expenseId: string, file: string, ttlMs?: number): Promise<string> {
  return signPhotoUrl(pathnameOf(userId, expenseId, file), ttlMs)
}
