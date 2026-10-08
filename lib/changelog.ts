import 'server-only'
import { ObjectId } from 'mongodb'
import { getDb } from './mongodb'
import type { UserDoc } from './users'
import type { ChangelogContent, ChangelogPlatform, ChangelogRelease } from '@/src/lib/changelog'

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
  return { id: doc._id.toHexString(), platform: doc.platform ?? 'web', title: doc.title, version: doc.version, highlights: doc.highlights, body: doc.body, publishedAt: doc.publishedAt?.toISOString() ?? null }
}

/** Releases saved before the platform field existed are web notes. */
function platformFilter(platform: ChangelogPlatform) {
  return platform === 'web' ? { platform: { $ne: 'mobile' as const } } : { platform }
}

const SEEN_FIELD = { web: 'seenWebChangelogIds', mobile: 'seenMobileChangelogIds' } as const

function latestPublished(platform: ChangelogPlatform) {
  return getDb().then((db) => db.collection<ChangelogDoc>(CHANGELOG_COLLECTION).findOne({ status: 'published', ...platformFilter(platform) }, { sort: { publishedAt: -1, _id: -1 } }))
}

export async function publishedChangelog(platform: ChangelogPlatform = 'web') {
  const db = await getDb()
  return db.collection<ChangelogDoc>(CHANGELOG_COLLECTION).find({ status: 'published', ...platformFilter(platform) }).sort({ publishedAt: -1, _id: -1 }).limit(100).toArray()
}

export async function latestUnseenRelease(userId: string, platform: ChangelogPlatform = 'web'): Promise<ChangelogRelease | null> {
  const db = await getDb()
  const seenField = SEEN_FIELD[platform]
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId, deleted_at: null }, { projection: { onboardedAt: 1, createdAt: 1, [seenField]: 1 } })
  if (!user?.onboardedAt) return null
  // Only the latest update gets a card. Older releases remain in the archive.
  const latest = await latestPublished(platform)
  if (!latest || user[seenField]?.includes(latest._id.toHexString())) return null
  // Accounts created after the release already have it: nothing is "new" to them.
  if (user.createdAt && latest.publishedAt && latest.publishedAt < user.createdAt) return null
  return serializeRelease(latest)
}

/** The conditional account update elects a single tab/device to show this release. */
export async function claimRelease(userId: string, id: string): Promise<ChangelogRelease | null> {
  const releaseId = changelogId(id)
  if (!releaseId) return null
  const db = await getDb()
  const release = await db.collection<ChangelogDoc>(CHANGELOG_COLLECTION).findOne({ _id: releaseId, status: 'published' })
  if (!release) return null
  const platform = release.platform ?? 'web'
  const latest = await latestPublished(platform)
  if (!latest || !latest._id.equals(releaseId)) return null
  const canonicalId = releaseId.toHexString()
  const seenField = SEEN_FIELD[platform]
  const result = await db.collection<UserDoc>('users').updateOne(
    {
      _id: userId, deleted_at: null, onboardedAt: { $type: 'string', $ne: '' }, [seenField]: { $ne: canonicalId },
      ...(latest.publishedAt ? { $or: [{ createdAt: { $exists: false } }, { createdAt: { $lte: latest.publishedAt } }] } : {}),
    },
    { $addToSet: { [seenField]: canonicalId } },
  )
  return result.modifiedCount === 1 ? serializeRelease(latest) : null
}
