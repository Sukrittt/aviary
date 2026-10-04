'use server'

import { ObjectId } from 'mongodb'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { audit } from '@/lib/adminAudit'
import { getDb } from '@/lib/mongodb'
import { CHANGELOG_COLLECTION, changelogId, type ChangelogDoc } from '@/lib/changelog'
import { parseChangelog } from '@/src/lib/changelog'
import type { ActionResult } from '../ActionForm'

function refresh() {
  revalidatePath('/admin/changelog')
  revalidatePath('/account/changelog')
}

export async function saveChangelogAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const content = parseChangelog(form)
  if (typeof content === 'string') return { ok: false, message: content }
  const rawId = String(form.get('id') ?? '')
  const id = rawId ? changelogId(rawId) : new ObjectId()
  if (!id) return { ok: false, message: 'Invalid update.' }
  const db = await getDb()
  const releases = db.collection<ChangelogDoc>(CHANGELOG_COLLECTION)
  const now = new Date()
  if (rawId) {
    const revision = Number(form.get('revision'))
    if (!Number.isSafeInteger(revision) || revision < 1) return { ok: false, message: 'Reload this update before saving.' }
    const result = await releases.updateOne(
      { _id: id, status: 'draft', revision },
      { $set: { ...content, updatedAt: now }, $inc: { revision: 1 } },
    )
    if (!result.matchedCount) return { ok: false, message: 'This update changed or is published. Reload it; unpublish before editing.' }
  } else {
    await releases.insertOne({ _id: id, ...content, status: 'draft', revision: 1, createdAt: now, updatedAt: now, publishedAt: null })
  }
  await audit(adminId, rawId ? 'changelog.edit' : 'changelog.create', null, { releaseId: id.toHexString(), ...content })
  refresh()
  // Stay on this draft after creation: saving again edits the same release,
  // rather than accidentally creating a second announcement.
  if (!rawId) redirect(`/admin/changelog?edit=${id.toHexString()}`)
  return { ok: true, message: 'Draft saved. Publish it from the updates list when ready.' }
}

export async function publishChangelogAction(id: string, revision: number, _prev: ActionResult, _form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const releaseId = changelogId(id)
  if (!releaseId) return { ok: false, message: 'Invalid update.' }
  const db = await getDb()
  const releases = db.collection<ChangelogDoc>(CHANGELOG_COLLECTION)
  const doc = await releases.findOne({ _id: releaseId, status: 'draft', revision })
  if (!doc) return { ok: false, message: 'This update changed. Reload before publishing.' }
  const now = new Date()
  const result = await releases.updateOne(
    { _id: releaseId, status: 'draft', revision },
    { $set: { status: 'published', publishedAt: doc.publishedAt ?? now, updatedAt: now }, $inc: { revision: 1 } },
  )
  if (!result.matchedCount) return { ok: false, message: 'This update changed. Reload before publishing.' }
  await audit(adminId, 'changelog.publish', null, { releaseId: id, title: doc.title })
  refresh()
  redirect(`/admin/changelog?published=${id}`)
}

export async function unpublishChangelogAction(id: string, revision: number, _prev: ActionResult, _form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const releaseId = changelogId(id)
  if (!releaseId) return { ok: false, message: 'Invalid update.' }
  const db = await getDb()
  const result = await db.collection<ChangelogDoc>(CHANGELOG_COLLECTION).updateOne(
    { _id: releaseId, status: 'published', revision },
    { $set: { status: 'draft', updatedAt: new Date() }, $inc: { revision: 1 } },
  )
  if (!result.matchedCount) return { ok: false, message: 'This update changed. Reload before unpublishing.' }
  await audit(adminId, 'changelog.unpublish', null, { releaseId: id })
  refresh()
  return { ok: true, message: 'Unpublished. It is now a draft; people who already saw it will not see it again if republished.' }
}
