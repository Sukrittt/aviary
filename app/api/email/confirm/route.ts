import { getDb } from '@/lib/mongodb'
import { verifyLink } from '@/lib/email/links'
import { LEADS, type LeadDoc } from '@/lib/email/outbox'

export const dynamic = 'force-dynamic'

/** The "Send me the tips" link in a salary plan email: the lead's opt-in to everything after it. */
export async function GET(req: Request) {
  const subject = verifyLink(new URL(req.url).searchParams.get('t'))
  const done = (state: string) => Response.redirect(new URL(`/emails?done=${state}`, req.url), 303)
  if (!subject?.startsWith('l:')) return done('invalid')
  // Keeps the first confirmation; clicking again after unsubscribing is asking to come back.
  await (await getDb()).collection<LeadDoc>(LEADS).updateOne({ _id: subject.slice(2) }, [{ $set: { confirmedAt: { $ifNull: ['$confirmedAt', new Date()] }, optedOutAt: null } }])
  return done('subscribed')
}
