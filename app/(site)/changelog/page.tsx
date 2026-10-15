import Link from 'next/link'
import { publishedChangelog, serializeRelease } from '@/lib/changelog'
import { pageMetadata } from '@/lib/seo'
import { FEEDBACK_BOARD_PATH } from '@/lib/links'
import { ChangelogEntry } from '@/src/components/ChangelogEntry'
import '@/src/components/Changelog.css'

export const metadata = pageMetadata('/changelog')
// Releases are published from /admin/changelog; read them per request like the signed-in page does.
export const dynamic = 'force-dynamic'

export default async function PublicChangelogPage() {
  const releases = (await publishedChangelog()).map(serializeRelease)
  return (
    <article className="legal-doc changelog-public">
      <h1>What’s new in Aviary</h1>
      <p>Every release of the Aviary web app, newest first. Want something built? <Link href={FEEDBACK_BOARD_PATH}>Post it on the feedback board</Link>.</p>
      {!releases.length && <p>Updates will appear here when they’re published.</p>}
      {releases.map((release) => <ChangelogEntry key={release.id} release={release} />)}
    </article>
  )
}
