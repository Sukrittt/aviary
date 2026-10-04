'use client'

import { useState } from 'react'
import { ActionForm, SubmitButton } from '../ActionForm'
import { ChangelogCard } from '@/src/components/ChangelogCard'
import { CHANGELOG_LIMITS, type ChangelogRelease } from '@/src/lib/changelog'
import { saveChangelogAction } from './actions'
import { ReplayChangelogPreview } from './ChangelogPreview'

export function ChangelogEditor({ release, revision }: { release?: ChangelogRelease; revision?: number }) {
  const [title, setTitle] = useState(release?.title ?? '')
  const [version, setVersion] = useState(release?.version ?? '')
  const [highlights, setHighlights] = useState(release?.highlights.join('\n') ?? '')
  const [body, setBody] = useState(release?.body ?? '')
  const preview: ChangelogRelease = {
    id: release?.id ?? 'preview', title: title || 'Your next update', version,
    highlights: highlights.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3), body, publishedAt: release?.publishedAt ?? null,
  }

  return (
    <div className="adm-two">
      <section className="erd-card">
        <h2>{release ? 'Edit draft' : 'New update'}</h2>
        <ActionForm action={saveChangelogAction} className="adm-form adm-changelog-form">
          {release && <><input type="hidden" name="id" value={release.id} /><input type="hidden" name="revision" value={revision} /></>}
          <label>Title<input className="adm-input" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. A faster way to log expenses" maxLength={CHANGELOG_LIMITS.title} required /></label>
          <label><span>Version label <span className="adm-sub">(optional)</span></span><input className="adm-input" name="version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. v1.2" maxLength={CHANGELOG_LIMITS.version} /></label>
          <label>Highlights<textarea className="adm-input" name="highlights" value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder="One highlight per line" rows={4} maxLength={CHANGELOG_LIMITS.highlights * (CHANGELOG_LIMITS.highlight + 2)} required aria-describedby="changelog-highlights-hint" /><span className="adm-sub" id="changelog-highlights-hint">1–3 highlights, up to 180 characters each.</span></label>
          <label><span>Full notes <span className="adm-sub">(optional)</span></span><textarea className="adm-input" name="body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Explain what changed and how to use it…" rows={7} maxLength={CHANGELOG_LIMITS.body} /><span className="adm-sub">Plain text, shown in the full changelog.</span></label>
          <div><SubmitButton variant="primary">Save draft</SubmitButton></div>
        </ActionForm>
      </section>
      <section className="adm-changelog-preview">
        <h2>Card preview</h2>
        <p className="adm-sub">Shown at the bottom of the web app. The published date is added when you publish.</p>
        <ChangelogCard release={preview} preview />
        <div><ReplayChangelogPreview release={preview} /></div>
        <p className="adm-sub">Only you see the preview. It doesn&apos;t change anyone&apos;s seen status.</p>
        {body && <div className="erd-card"><h2>Full notes preview</h2><p className="changelog-body">{body}</p></div>}
      </section>
    </div>
  )
}
