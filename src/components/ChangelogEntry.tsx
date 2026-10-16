import type { ChangelogRelease } from '@/src/lib/changelog'

/** One published release, shared by the public /changelog and the signed-in /account/changelog. */
export function ChangelogEntry({ release, latest, className, style }: { release: ChangelogRelease; latest?: boolean; className?: string; style?: React.CSSProperties }) {
  const id = `release-${release.id}`
  return (
    <article id={id} className={`changelog-history-entry ${latest ? 'changelog-latest-entry' : ''} ${className ?? ''}`} style={style}>
      <div className="changelog-meta">
        {latest && <span className="changelog-latest">Latest</span>}
        {release.version && <span className="changelog-version">{release.version}</span>}
        {release.publishedAt && <time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString('en', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}</time>}
      </div>
      <div className="changelog-content">
        <h2><a href={`#${id}`} className="changelog-permalink">{release.title}</a></h2>
        <ul className="changelog-highlights">{release.highlights.map((line, i) => <li key={i}>{line}</li>)}</ul>
        {release.body && <><p className="changelog-details-label">The details</p><p className="changelog-body">{release.body}</p></>}
      </div>
    </article>
  )
}
