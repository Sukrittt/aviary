import Link from 'next/link'
import { publishedChangelog, serializeRelease } from '@/lib/changelog'
import { pageMetadata } from '@/lib/seo'
import { FEEDBACK_BOARD_PATH } from '@/lib/links'
import { ChangelogEntry } from '@/src/components/ChangelogEntry'
import { SoftCta } from '@/src/components/content/ContentPage'
import '@/src/components/Changelog.css'

export const metadata = pageMetadata('/changelog')
// Releases are published from /admin/changelog; read them per request like the signed-in page does.
export const dynamic = 'force-dynamic'

export default async function PublicChangelogPage() {
  const releases = (await publishedChangelog()).map(serializeRelease)
  return <>
    <article className="legal-doc changelog-public">
      <h1>What’s new in Aviary</h1>
      <p>Every release of the Aviary web app, newest first. Want something built? <Link href={FEEDBACK_BOARD_PATH}>Post it on the feedback board</Link>.</p>
      {releases.length
        ? <div className="changelog-timeline">{releases.map((release, i) => <ChangelogEntry key={release.id} release={release} latest={i === 0} />)}</div>
        : <p>Updates will appear here when they’re published.</p>}
    </article>
    <SoftCta title="Try what’s new" placement="changelog">Aviary works on Android and the web. Log a spend in one tap and see what’s left for the month.</SoftCta>
  </>
}
