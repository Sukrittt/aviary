import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Signed links in lifecycle emails: unsubscribe (users and leads) and the
 * lead's "send me the tips" confirmation. The token names who it's for
 * (`u:<userId>` or `l:<leadId>`) and can't be forged or pointed at someone else.
 *
 * Keyed off CRON_SECRET so there's no new secret to provision. Rotating it
 * breaks links in emails already sent; /emails then asks the reader to reply instead.
 */
export type LinkSubject = `u:${string}` | `l:${string}`

const SITE = 'https://useaviary.com'

function key(): Buffer {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('CRON_SECRET is not configured')
  return createHmac('sha256', secret).update('aviary-email-links').digest()
}

const mac = (subject: string) => createHmac('sha256', key()).update(subject).digest()

export function signLink(subject: LinkSubject): string {
  return `${subject}.${mac(subject).toString('base64url')}`
}

export function verifyLink(token: string | null | undefined): LinkSubject | null {
  if (!token || token.length > 200) return null
  const dot = token.lastIndexOf('.')
  const subject = token.slice(0, dot)
  if (dot < 0 || !/^[ul]:[\w-]+$/.test(subject)) return null
  const given = Buffer.from(token.slice(dot + 1), 'base64url')
  try {
    const expected = mac(subject)
    return given.length === expected.length && timingSafeEqual(given, expected) ? subject as LinkSubject : null
  } catch {
    return null
  }
}

const q = (subject: LinkSubject) => `t=${encodeURIComponent(signLink(subject))}`
/** The page with an Unsubscribe button. A GET never unsubscribes: mail scanners open links. */
export const preferencesUrl = (subject: LinkSubject) => `${SITE}/emails?${q(subject)}`
/** RFC 8058 one-click target for the List-Unsubscribe header. */
export const oneClickUrl = (subject: LinkSubject) => `${SITE}/api/email/unsubscribe?${q(subject)}`
/** The lead's opt-in page. Like unsubscribe, only its button (a POST) confirms, so a scanner can't sign anyone up. */
export const confirmUrl = (leadId: string) => `${SITE}/emails?ask=tips&${q(`l:${leadId}`)}`

/** Headers that give Gmail and others a native unsubscribe button. */
export function unsubscribeHeaders(subject: LinkSubject): Record<string, string> {
  return { 'List-Unsubscribe': `<${oneClickUrl(subject)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
}
