// One-off: thank every tester in the `expenses` db and tell them Aviary is live.
// Reuses lib/email/transactionalTemplate.ts, so it needs node 23.6+ for type stripping.
//
// node --env-file=.env.local scripts/send-launch-email.mjs              dry run: lists recipients, writes preview HTML
// node --env-file=.env.local scripts/send-launch-email.mjs --to=a@b.com  sends one test copy
// node --env-file=.env.local scripts/send-launch-email.mjs --apply      sends to everyone (one Resend batch call)
import { writeFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { SUPPORT_EMAIL, transactionalTemplate } from '../lib/email/transactionalTemplate.ts'

const DB = 'expenses'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sukrit04.envelope'
const SUBJECT = 'Aviary is live. Thanks for testing'
const FROM = process.env.RESEND_FROM_EMAIL?.trim() || 'Aviary <hello@useaviary.com>'
const REPLY_TO = process.env.RESEND_REPLY_TO?.trim() || SUPPORT_EMAIL

const PARAGRAPHS = [
  'Aviary is officially out of testing and live on the Play Store.',
  'You were one of the first people to use it. Every bug you hit, every bit of feedback you sent, and every day you logged an expense helped shape the app everyone gets today. Thank you.',
  'Your account and all your envelopes carry over as is. Just update the app from the Play Store and you’re good to go. It works on the web too, at useaviary.com.',
  'If you’ve got a minute, a rating or a short review on the Play Store would mean a lot. It’s the single biggest thing that helps new people find us.',
  'Got more feedback? Keep it coming. Just reply to this email.',
]
const CTA = 'Open in Play Store'
const REASON = 'You’re getting this because you helped test Aviary before launch.'

function render(name) {
  return transactionalTemplate({ subject: SUBJECT, title: 'Aviary is *live*', kicker: 'Thank you', name, paragraphs: PARAGRAPHS, cta: CTA, url: PLAY_STORE_URL, secondary: { label: 'Or open it on the web', url: 'https://useaviary.com' }, reason: REASON })
}

const apply = process.argv.includes('--apply')
const testTo = process.argv.find(a => a.startsWith('--to='))?.slice(5)

const client = await MongoClient.connect(process.env.MONGODB_URI)
const users = await client.db(DB).collection('users')
  .find({ deleted_at: null, emailVerified: { $ne: false }, email: { $type: 'string' } }, { projection: { email: 1, name: 1, firstName: 1 } })
  .toArray()
  // Throwaway inboxes and the Play reviewer login aren't testers.
  .then(list => list.filter(u => !u.email.endsWith('@mailinator.com') && u.email !== process.env.REVIEW_LOGIN_EMAIL && u.email !== SUPPORT_EMAIL))
await client.close()

const emails = (testTo ? [{ email: testTo, name: users[0]?.name }] : users).map(u => ({
  from: FROM, to: [u.email], reply_to: REPLY_TO, subject: SUBJECT, ...render(u.firstName || u.name),
}))

if (!apply && !testTo) {
  console.log(`${emails.length} recipients in ${DB}:\n${emails.map(m => m.to[0]).join('\n')}`)
  writeFileSync('launch-email-preview.html', emails[0].html)
  console.log('\nPreview written to launch-email-preview.html. Re-run with --to=you@x.com or --apply.')
  process.exit(0)
}

if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
// Batch endpoint takes up to 100 emails; the key makes a retried run within 24h a no-op.
const res = await fetch('https://api.resend.com/emails/batch', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': testTo ? `launch-test/${Date.now()}` : 'launch-announcement/2026-10',
  },
  body: JSON.stringify(emails),
})
console.log(res.status, await res.text())
