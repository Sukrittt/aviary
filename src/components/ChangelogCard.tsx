import Link from 'next/link'
import { ArrowUpRight, Sparkles, X } from 'lucide-react'
import type { ChangelogRelease } from '@/src/lib/changelog'
import './Changelog.css'

/** Shared with the admin preview, so published cards match what admins review. */
export function ChangelogCard({ release, onDismiss, preview = false }: { release: ChangelogRelease; onDismiss?: () => void; preview?: boolean }) {
  return (
    <aside className="changelog-card" aria-label="What's new in Aviary">
      <div className="changelog-eyebrow"><Sparkles size={14} aria-hidden="true" /> What&apos;s new in Aviary</div>
      {onDismiss && <button type="button" className="changelog-close" aria-label="Dismiss update" onClick={onDismiss}><X size={18} aria-hidden="true" /></button>}
      <h2>{release.title}</h2>
      <div className="changelog-meta">
        {release.version && <span>{release.version}</span>}
        {release.publishedAt && <time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</time>}
      </div>
      <ul>{release.highlights.map((highlight, i) => <li key={i}>{highlight}</li>)}</ul>
      {preview ? <span className="changelog-link">View changelog <ArrowUpRight size={14} aria-hidden="true" /></span> : <Link className="changelog-link" href={`/account/changelog#release-${release.id}`} onClick={onDismiss}>View changelog <ArrowUpRight size={14} aria-hidden="true" /></Link>}
    </aside>
  )
}
