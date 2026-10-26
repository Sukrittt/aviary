import { json, error, readBody, EMAIL_RE } from '@/lib/http'
import { getDb } from '@/lib/mongodb'
import { isRateLimited, clientIp } from '@/lib/rateLimit'
import { salaryPlan } from '@/lib/tools/money'
import { queueLeadPlan, scheduleOutboxSend } from '@/lib/email/lifecycle'

export const dynamic = 'force-dynamic'

// The planner's money fields keep 10 digits, so anything they accept is accepted here.
const MAX_SALARY = 9_999_999_999
// ponytail: one global bucket, so a flood blocks real visitors too. Add a captcha if that bites.
const MAX_PLANS_PER_DAY = 50

/**
 * Public, unauthenticated: the salary and paycheck planners' "Email me this plan". The plan
 * is rebuilt here from salary and rent rather than trusted from the page, so
 * the email can only ever carry the planner's own numbers. New and repeat
 * addresses get the same answer, so the form can't be used to probe the list.
 */
export async function POST(req: Request) {
  const body = await readBody(req)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return error('a valid email is required')
  const salary = Number(body.salary)
  const rent = body.rent === null || body.rent === undefined || body.rent === '' ? undefined : Number(body.rent)
  if (!Number.isFinite(salary) || salary <= 0 || salary > MAX_SALARY) return error('a salary is required')
  if (rent !== undefined && (!Number.isFinite(rent) || rent < 0 || rent > MAX_SALARY)) return error('rent must be a positive amount')

  const limited = await isRateLimited(`leads:ip:${clientIp(req)}`, [
    { windowMs: 60 * 1000, limit: 3 },
    { windowMs: 60 * 60 * 1000, limit: 10 },
  ])
  if (limited) return error('rate limited', 429)
  // Every plan email shares the Resend quota with sign-in, receipts and trial notices.
  if (await isRateLimited('leads:global', { windowMs: 24 * 60 * 60 * 1000, limit: MAX_PLANS_PER_DAY })) return error('rate limited', 429)

  const rows = salaryPlan(salary, rent === undefined ? {} : { rent }).map((c): [string, number] => [c.name, c.amount])
  // The paycheck planner (/tools/paycheck-budget-planner) has no currency, so its email has none either.
  const intl = body.intl === true
  const rowId = await queueLeadPlan(await getDb(), email, { salary: Math.floor(salary), rows, ...(intl && { intl }) })
  scheduleOutboxSend(rowId)
  return json({ ok: true })
}
