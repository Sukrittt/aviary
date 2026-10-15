import { publishedChangelog, serializeRelease } from '@/lib/changelog'
import { pageMetadata } from '@/lib/seo'
import { ChangelogEntry } from '@/src/components/ChangelogEntry'
import '@/src/components/Changelog.css'

export const dynamic = 'force-dynamic'

export default async function ChangelogPage() {
  const releases = (await publishedChangelog()).map(serializeRelease)
  return (
    <div className="changelog-history">
      <div><h1 className="account-row-label">What&apos;s new in Aviary</h1><p className="account-help-copy">New features, improvements, and fixes for the web app.</p></div>
      {!releases.length && <div className="account-card" style={{ padding: 20 }}><p className="account-help-copy">Updates will appear here when they&apos;re published.</p></div>}
      {releases.map((release) => <ChangelogEntry key={release.id} release={release} className="account-card" style={{ padding: 22 }} />)}
    </div>
  )
}

export const metadata = pageMetadata('/account/changelog')
