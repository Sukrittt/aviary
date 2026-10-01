import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { saveSession } from '@workos-inc/authkit-nextjs'
import { getWorkOSClient } from '@/lib/workosClient'
import { ensureUser } from '@/lib/users'
import { readBody, EMAIL_RE } from '@/lib/http'
import { isRateLimited, clientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 60 * 60 * 1000
const PER_EMAIL_LIMIT = 10
const PER_IP_LIMIT = 30
const BURST_WINDOW_MS = 60 * 1000
const BURST_PER_EMAIL_LIMIT = 5
const BURST_PER_IP_LIMIT = 10

/**
 * Payment-gateway reviewers (Razorpay KYC) can't read our emailed codes, so one
 * allowlisted email may sign in with a fixed code instead. Off unless both env
 * vars are set; point it at a throwaway account and unset after review.
 */
function isReviewLogin(email: string, code: string): boolean {
  const reviewEmail = process.env.REVIEW_LOGIN_EMAIL?.trim().toLowerCase()
  const reviewCode = process.env.REVIEW_LOGIN_CODE?.trim()
  if (!reviewEmail || !reviewCode || email !== reviewEmail) return false
  const a = Buffer.from(code)
  const b = Buffer.from(reviewCode)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Shared by both clients: web relies on the cookie saveSession() sets;
 * mobile has no cookie jar, so the tokens ride along in the JSON body too.
 */
export async function POST(req: Request) {
  const body = await readBody(req)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const device = body.device
  if (!email || !EMAIL_RE.test(email) || !code)
    return NextResponse.json({ error: 'email and code required' }, { status: 400 })

  const [emailLimited, ipLimited] = await Promise.all([
    isRateLimited(`magic-auth-verify:email:${email}`, [
      { windowMs: BURST_WINDOW_MS, limit: BURST_PER_EMAIL_LIMIT },
      { windowMs: WINDOW_MS, limit: PER_EMAIL_LIMIT },
    ]),
    isRateLimited(`magic-auth-verify:ip:${clientIp(req)}`, [
      { windowMs: BURST_WINDOW_MS, limit: BURST_PER_IP_LIMIT },
      { windowMs: WINDOW_MS, limit: PER_IP_LIMIT },
    ]),
  ])
  if (emailLimited || ipLimited) return NextResponse.json({ error: 'rate limited' }, { status: 429 })

  // `device` is the RN app's own label (expo-device); it identifies the phone
  // far better than the generic RN fetch user-agent string would.
  const userAgent = typeof device === 'string' && device ? device : req.headers.get('user-agent') ?? undefined

  try {
    const workos = getWorkOSClient().userManagement
    // WorkOS still issues the session: mint a real code and redeem it at once.
    const realCode = isReviewLogin(email, code) ? (await workos.createMagicAuth({ email })).code : code
    const { user, accessToken, refreshToken } = await workos.authenticateWithMagicAuth({
      clientId: process.env.WORKOS_CLIENT_ID!,
      email,
      code: realCode,
      userAgent,
    })
    await ensureUser(user)
    await saveSession({ accessToken, refreshToken, user }, req.url)
    return NextResponse.json(typeof device === 'string' && device.trim() ? { ok: true, accessToken, refreshToken } : { ok: true })
  } catch {
    return NextResponse.json({ error: 'invalid or expired code' }, { status: 401 })
  }
}
