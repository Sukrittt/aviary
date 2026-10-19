import { getDb } from '@/lib/mongodb'
import { json } from '@/lib/http'
import type { UserDoc } from '@/lib/users'
import { verifyLink } from '@/lib/email/links'
import { LEADS, type LeadDoc } from '@/lib/email/outbox'

export const dynamic = 'force-dynamic'

/**
 * Turns off lifecycle and evergreen emails for whoever the signed token names.
 * Two callers: Gmail-style one-click unsubscribe (RFC 8058, token in the query)
 * and the button on /emails (token in the form). POST only, because mail
 * scanners open every link in a message and a GET must never unsubscribe.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const page = form?.get('from') === 'page'
  const subject = verifyLink(new URL(req.url).searchParams.get('t') ?? String(form?.get('t') ?? ''))
  const done = (state: string) => Response.redirect(new URL(`/emails?done=${state}`, req.url), 303)
  if (!subject) return page ? done('invalid') : json({ error: 'invalid link' }, { status: 400 })
  const db = await getDb()
  const id = subject.slice(2)
  if (subject.startsWith('u:')) await db.collection<UserDoc>('users').updateOne({ _id: id, emailOptOutAt: { $exists: false } }, { $set: { emailOptOutAt: new Date() } })
  else await db.collection<LeadDoc>(LEADS).updateOne({ _id: id, optedOutAt: null }, { $set: { optedOutAt: new Date() } })
  return page ? done('unsubscribed') : json({ ok: true })
}
