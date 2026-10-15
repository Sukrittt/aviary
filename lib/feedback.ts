import { randomBytes } from 'node:crypto'
import { put, del } from '@vercel/blob'
import { getDb } from './mongodb'
import { PHOTO_EXT_BY_MIME, signPhotoUrl } from './expensePhoto'
import type { FeedbackArea, FeedbackSeverity } from './ai/feedbackTriage'

export const FEEDBACK = 'feedback'

export interface FeedbackDoc {
  at: Date
  userId: string
  type: 'bug' | 'idea'
  title: string
  description: string
  diagnostics: { appVersion: string; device: string; screen: string }
  area: FeedbackArea | null
  severity: FeedbackSeverity | null
  /** Private Blob pathname of the optional bug report screenshot. Absent on older reports. */
  screenshot?: string | null
}

/** Records one feedback submission for /admin/feedback. Call after validation passes. */
export async function recordFeedback(doc: Omit<FeedbackDoc, 'at'>): Promise<void> {
  const db = await getDb()
  await db.collection<FeedbackDoc>(FEEDBACK).insertOne({ ...doc, at: new Date() })
}

/**
 * Stores a bug report screenshot in the private store, same shape as expense
 * photos. These often show balances, so they're only ever read through a
 * short-lived signed URL. Returns the pathname to stamp on the report.
 */
export async function putFeedbackScreenshot(userId: string, buffer: Buffer, mimeType: string): Promise<string> {
  const pathname = `feedback-screenshots/${userId}/${randomBytes(8).toString('hex')}.${PHOTO_EXT_BY_MIME[mimeType]}`
  await put(pathname, buffer, { access: 'private', contentType: mimeType, addRandomSuffix: false })
  return pathname
}

/** For when the report itself fails to save: logs instead of masking the real error. */
export async function deleteFeedbackScreenshotQuietly(pathname: string): Promise<void> {
  try {
    await del(pathname)
  } catch (err) {
    console.error('feedback screenshot: blob delete failed for', pathname, err)
  }
}

export const getFeedbackScreenshotUrl = signPhotoUrl
