import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { findCode } from '@/lib/referrals'
import { getDb } from '@/lib/mongodb'
import { displayName, type UserDoc } from '@/lib/users'
import { BirdMark } from '@/src/components/BirdMark'
import { GET_ANDROID_URL } from '@/src/components/billing/copy'

// Public: a share link opens here signed out. Middleware notes the code in
// `aviary_attr`, so the account made next (on the web, or on Android via the
// Play link's install referrer) is tied to it. Not in middleware's APP_PATHS.
export const metadata = pageMetadata('/r/[code]')

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || null

export default async function ReferralLanding({ params }: { params: Promise<{ code: string }> }) {
  const code = await findCode((await params).code)
  const live = code?.active ? code : null
  let headline = 'Plan your money before you spend it'
  let body = 'Aviary helps you plan your money before you spend it, so you always know what\u2019s left. Free for 30 days.'
  if (live?.kind === 'creator') {
    headline = live.offer ?? 'You’re invited to Aviary'
    body = `Join with this link and get ${live.refereeMonths === 1 ? 'a month' : `${live.refereeMonths} months`} of Pro on top of your free trial.`
  } else if (live) {
    const owner = live.ownerId ? await (await getDb()).collection<UserDoc>('users').findOne({ _id: live.ownerId }, { projection: { name: 1, firstName: 1, lastName: 1 } }) : null
    const name = owner ? firstName(displayName(owner)) : null
    headline = name ? `${name} invited you to Aviary` : 'A friend invited you to Aviary'
    body = 'Know what you can spend before you spend it. Join with this link and get a month of Pro on top of your free trial.'
  }

  return (
    <div className="auth-card join-card">
      <div className="auth-logo" aria-hidden="true">
        <BirdMark size={40} />
      </div>
      <h1 className="auth-headline">{headline}</h1>
      <p className="auth-subhead">{body}</p>
      {live && <p className="auth-subhead referral-landing-code">Code {live._id} · added for you</p>}
      <div className="auth-actions">
        <a href={GET_ANDROID_URL} className="auth-btn auth-btn--primary">Get it on Android</a>
        <Link href="/sign-in" className="auth-btn auth-btn--outline">Use it on the web</Link>
      </div>
    </div>
  )
}
