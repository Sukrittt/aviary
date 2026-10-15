import type { ChangelogRelease } from '@/src/lib/changelog'

/** One published release, shared by the public /changelog and the signed-in /account/changelog. */
export function ChangelogEntry({ release, className, style }: { release: ChangelogRelease; className?: string; style?: React.CSSProperties }) {
  return (
    <article id={`release-${release.id}`} className={`changelog-history-entry ${className ?? ''}`} style={style}>
      <div className="changelog-meta">{release.version && <span>{release.version}</span>}{release.publishedAt && <time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString('en', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}</time>}</div>
      <h2>{release.title}</h2>
      <ul>{release.highlights.map((line, i) => <li key={i}>{line}</li>)}</ul>
      {release.body && <p className="changelog-body">{release.body}</p>}
    </article>
  )
}
