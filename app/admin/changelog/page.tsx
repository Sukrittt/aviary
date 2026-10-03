import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/mongodb'
import { CHANGELOG_COLLECTION, changelogId, serializeRelease, type ChangelogDoc } from '@/lib/changelog'
import { pageMetadata } from '@/lib/seo'
import { ActionForm, SubmitButton } from '../ActionForm'
import { ChangelogEditor } from './ChangelogEditor'
import { publishChangelogAction, unpublishChangelogAction } from './actions'
import { ChangelogCard } from '@/src/components/ChangelogCard'
import { ChangelogPreviewProvider, ReplayChangelogPreview } from './ChangelogPreview'

export default async function AdminChangelog({ searchParams }: { searchParams: Promise<{ edit?: string; published?: string }> }) {
  const { edit, published } = await searchParams
  const db = await getDb()
  const collection = db.collection<ChangelogDoc>(CHANGELOG_COLLECTION)
  const entries = await collection.find({}).sort({ createdAt: -1, _id: -1 }).limit(100).toArray()
  const editId = edit ? changelogId(edit) : null
  const editedRelease = editId ? await collection.findOne({ _id: editId }) : null
  // Old edit links can outlive a publish (including another admin's). Open
  // the published view instead of presenting a successful publish as an error.
  if (editedRelease?.status === 'published') redirect(`/admin/changelog?published=${editedRelease._id.toHexString()}`)
  const draft = editedRelease?.status === 'draft' ? editedRelease : null
  const publishedId = published ? changelogId(published) : null
  const publishedRelease = publishedId ? await collection.findOne({ _id: publishedId, status: 'published' }) : null

  return (
    <ChangelogPreviewProvider>
      <div className="adm-head"><h1>Changelog</h1><span className="adm-sub">Web updates · every change is audited</span></div>
      <p className="adm-sub">Save a draft, review the preview, then publish. Only the newest published update is announced, once per account. All published notes stay in Account → Changelog.</p>
      {edit && !draft && <p className="adm-msg is-error">This draft is unavailable. Unpublish a published update before editing.</p>}
      {(draft || publishedRelease) && <Link className="adm-muted" href="/admin/changelog">← Create a new update</Link>}
      {publishedRelease ? <>
        <p className="adm-msg" role="status">{publishedRelease.title} is published. The newest update appears once per account.</p>
        <div className="adm-changelog-preview"><h2>Published card</h2><ChangelogCard release={serializeRelease(publishedRelease)} preview /><div><ReplayChangelogPreview release={serializeRelease(publishedRelease)} /></div><p className="adm-sub">Only you see the preview. It does not change anyone&apos;s seen status.</p></div>
      </> : <ChangelogEditor key={draft ? `${draft._id}:${draft.revision}` : 'new'} release={draft ? serializeRelease(draft) : undefined} revision={draft?.revision} />}
      <section className="erd-card">
        <h2>Updates</h2>
        {!entries.length && <p className="adm-sub">No updates yet. Create your first draft above.</p>}
        <div className="adm-changelog-list">
          {entries.map((entry) => {
            const id = entry._id.toHexString()
            return (
              <article key={id} className="adm-changelog-entry">
                <div className="adm-chart-head"><h3>{entry.title}</h3><span className={`adm-badge ${entry.status === 'published' ? 'is-good' : ''}`}>{entry.status === 'published' ? 'Published' : 'Draft'}</span></div>
                <p className="adm-sub">{entry.version && `${entry.version} · `}{entry.publishedAt ? `First published ${entry.publishedAt.toLocaleDateString('en', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}` : 'Not published yet'}</p>
                <ul>{entry.highlights.map((line, i) => <li key={i}>{line}</li>)}</ul>
                {entry.body && <details><summary>Full notes</summary><p className="changelog-body">{entry.body}</p></details>}
                <div className="adm-changelog-actions">
                  <ReplayChangelogPreview release={serializeRelease(entry)} />
                  {entry.status === 'draft' ? <><Link className="adm-btn" href={`/admin/changelog?edit=${id}`}>Edit draft</Link><ActionForm action={publishChangelogAction.bind(null, id, entry.revision)}><SubmitButton variant="primary">{entry.publishedAt ? 'Republish' : 'Publish'}</SubmitButton></ActionForm></> : <ActionForm action={unpublishChangelogAction.bind(null, id, entry.revision)}><SubmitButton>Unpublish</SubmitButton></ActionForm>}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </ChangelogPreviewProvider>
  )
}

export const metadata = pageMetadata('/admin/changelog')
