import { publishedChangelog, serializeRelease } from '@/lib/changelog'
import { pageMetadata } from '@/lib/seo'
import '@/src/components/Changelog.css'

export const dynamic = 'force-dynamic'

export default async function ChangelogPage() {
  const releases = (await publishedChangelog()).map(serializeRelease)
  return (
    <div className="changelog-history">
      <div><h1 className="account-row-label">What&apos;s new in Aviary</h1><p className="account-help-copy">New features, improvements, and fixes for the web app.</p></div>
      {!releases.length && <div className="account-card" style={{ padding: 20 }}><p className="account-help-copy">Updates will appear here when they&apos;re published.</p></div>}
      {releases.map((release) => (
        <article key={release.id} id={`release-${release.id}`} className="account-card changelog-history-entry" style={{ padding: 22 }}>
          <div className="changelog-meta">{release.version && <span>{release.version}</span>}{release.publishedAt && <time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString('en', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}</time>}</div>
          <h2>{release.title}</h2>
          <ul>{release.highlights.map((line, i) => <li key={i}>{line}</li>)}</ul>
          {release.body && <p className="changelog-body">{release.body}</p>}
        </article>
      ))}
    </div>
  )
}

export const metadata = pageMetadata('/account/changelog')
