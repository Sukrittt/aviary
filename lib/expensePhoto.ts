import { randomBytes } from 'node:crypto'
import { put, del, issueSignedToken, presignUrl } from '@vercel/blob'

/** The formats a client may upload, and the extension each is stored under. */
export const PHOTO_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Decoded size cap. Clients downscale to ~1280px JPEG first, so this is a backstop. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

const PHOTO_URL_TTL_MS = 5 * 60 * 1000

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

/** Short-lived signed GET URL, same reasoning as `getBillScanImageUrl`: the store is private. */
export async function getExpensePhotoUrl(userId: string, expenseId: string, file: string): Promise<string> {
  const pathname = pathnameOf(userId, expenseId, file)
  const signed = await issueSignedToken({ pathname, operations: ['get'], validUntil: Date.now() + PHOTO_URL_TTL_MS })
  const { presignedUrl } = await presignUrl(signed, { operation: 'get', pathname, access: 'private' })
  return presignedUrl
}
