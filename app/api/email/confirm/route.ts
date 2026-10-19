import { getDb } from '@/lib/mongodb'
import { verifyLink } from '@/lib/email/links'
import { LEADS, type LeadDoc } from '@/lib/email/outbox'

export const dynamic = 'force-dynamic'

/**
 * The "Send me the tips" button on /emails: the lead's opt-in to everything
 * after the plan. POST only, like unsubscribe, because mail scanners open
 * every link in a message and must not be able to sign anyone up.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const subject = verifyLink(String(form?.get('t') ?? ''))
  const done = (state: string) => Response.redirect(new URL(`/emails?done=${state}`, req.url), 303)
  if (!subject?.startsWith('l:')) return done('invalid')
  // Keeps the first confirmation; pressing it again after unsubscribing is asking to come back.
  await (await getDb()).collection<LeadDoc>(LEADS).updateOne({ _id: subject.slice(2) }, [{ $set: { confirmedAt: { $ifNull: ['$confirmedAt', new Date()] }, optedOutAt: null } }])
  return done('subscribed')
}
