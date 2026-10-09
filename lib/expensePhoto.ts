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

const pathnameOf = (userId: string, expenseId: string, ext: string) => `expense-photos/${userId}/${expenseId}.${ext}`

/**
 * Stores an expense's one photo, same private-Blob shape as `lib/billScan.ts`.
 * A stable pathname per (user, expense, ext) means a retry overwrites rather
 * than orphaning a copy.
 */
export async function putExpensePhoto(userId: string, expenseId: string, buffer: Buffer, mimeType: string): Promise<string> {
  const ext = PHOTO_EXT_BY_MIME[mimeType]
  await put(pathnameOf(userId, expenseId, ext), buffer, {
    access: 'private',
    contentType: mimeType,
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  return ext
}

export async function deleteExpensePhoto(userId: string, expenseId: string, ext: string): Promise<void> {
  await del(pathnameOf(userId, expenseId, ext))
}

/** For cleanup paths (replace, expense delete): logs instead of failing the caller's write. */
export async function deleteExpensePhotoQuietly(userId: string, expenseId: string, ext: string): Promise<void> {
  try {
    await deleteExpensePhoto(userId, expenseId, ext)
  } catch (err) {
    console.error('expense photo: blob delete failed for', userId, expenseId, err)
  }
}

/** Short-lived signed GET URL, same reasoning as `getBillScanImageUrl`: the store is private. */
export async function getExpensePhotoUrl(userId: string, expenseId: string, ext: string): Promise<string> {
  const pathname = pathnameOf(userId, expenseId, ext)
  const signed = await issueSignedToken({ pathname, operations: ['get'], validUntil: Date.now() + PHOTO_URL_TTL_MS })
  const { presignedUrl } = await presignUrl(signed, { operation: 'get', pathname, access: 'private' })
  return presignedUrl
}
