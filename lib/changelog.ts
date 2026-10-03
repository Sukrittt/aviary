import 'server-only'
import { ObjectId } from 'mongodb'
import { getDb } from './mongodb'
import type { UserDoc } from './users'
import type { ChangelogContent, ChangelogRelease } from '@/src/lib/changelog'

export const CHANGELOG_COLLECTION = 'web_changelog'

export interface ChangelogDoc extends ChangelogContent {
  _id: ObjectId
  status: 'draft' | 'published'
  revision: number
  createdAt: Date
  updatedAt: Date
  /** Preserved when unpublished/re-published, just like the release identity. */
  publishedAt: Date | null
}

export function changelogId(value: string): ObjectId | null {
  return /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null
}

export function serializeRelease(doc: ChangelogDoc): ChangelogRelease {
  return { id: doc._id.toHexString(), title: doc.title, version: doc.version, highlights: doc.highlights, body: doc.body, publishedAt: doc.publishedAt?.toISOString() ?? null }
}

export async function publishedChangelog() {
  const db = await getDb()
  return db.collection<ChangelogDoc>(CHANGELOG_COLLECTION).find({ status: 'published' }).sort({ publishedAt: -1, _id: -1 }).limit(100).toArray()
}

export async function latestUnseenRelease(userId: string): Promise<ChangelogRelease | null> {
  const db = await getDb()
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId, deleted_at: null }, { projection: { onboardedAt: 1, seenWebChangelogIds: 1 } })
  if (!user?.onboardedAt) return null
  // Only the latest update gets a card. Older releases remain in the archive.
  const latest = await db.collection<ChangelogDoc>(CHANGELOG_COLLECTION).findOne({ status: 'published' }, { sort: { publishedAt: -1, _id: -1 } })
  if (!latest || user.seenWebChangelogIds?.includes(latest._id.toHexString())) return null
  return serializeRelease(latest)
}

/** The conditional account update elects a single tab/device to show this release. */
export async function claimRelease(userId: string, id: string): Promise<ChangelogRelease | null> {
  const releaseId = changelogId(id)
  if (!releaseId) return null
  const db = await getDb()
  const latest = await db.collection<ChangelogDoc>(CHANGELOG_COLLECTION).findOne({ status: 'published' }, { sort: { publishedAt: -1, _id: -1 } })
  if (!latest || !latest._id.equals(releaseId)) return null
  const canonicalId = releaseId.toHexString()
  const result = await db.collection<UserDoc>('users').updateOne(
    { _id: userId, deleted_at: null, onboardedAt: { $type: 'string', $ne: '' }, seenWebChangelogIds: { $ne: canonicalId } },
    { $addToSet: { seenWebChangelogIds: canonicalId } },
  )
  return result.modifiedCount === 1 ? serializeRelease(latest) : null
}
