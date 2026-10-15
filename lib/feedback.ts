import { getDb } from './mongodb'
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
}

/** Records one feedback submission for /admin/feedback. Call after validation passes. */
export async function recordFeedback(doc: Omit<FeedbackDoc, 'at'>): Promise<void> {
  const db = await getDb()
  await db.collection<FeedbackDoc>(FEEDBACK).insertOne({ ...doc, at: new Date() })
}
