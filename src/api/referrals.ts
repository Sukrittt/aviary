import { apiFetch } from './client'

/** Twin of lib/referrals.ts's ReferralSummary. */
export interface ReferralSummary {
  code: string
  link: string
  joined: number
  activated: number
  monthsEarned: number
  canEnterCode: boolean
  referredBy: string | null
}

export type ApplyError = 'not_found' | 'inactive' | 'own_code' | 'already_referred' | 'too_late' | 'blocked' | 'rate_limited' | 'network'

export async function getReferrals(): Promise<ReferralSummary> {
  const res = await apiFetch('/api/referrals/me')
  if (!res.ok) throw new Error(`referrals ${res.status}`)
  return res.json()
}

/** Null when applied, else what went wrong as a code the screen words. */
export async function applyReferralCode(code: string): Promise<ApplyError | null> {
  let res: Response
  try {
    res = await apiFetch('/api/referrals/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
  } catch {
    return 'network'
  }
  if (res.ok) return null
  if (res.status === 429) return 'rate_limited'
  const body = (await res.json().catch(() => ({}))) as { error?: ApplyError }
  return body.error ?? 'network'
}

export const APPLY_ERROR_COPY: Record<ApplyError, string> = {
  not_found: "That code doesn't exist. Check it and try again.",
  inactive: "That code isn't active anymore.",
  own_code: "That's your own code.",
  already_referred: "You've already used a code.",
  too_late: 'Codes can be added in your first 7 days.',
  blocked: "This code can't be used with this account.",
  rate_limited: 'Too many tries. Give it an hour.',
  network: 'Check your connection and try again.',
}

export const APPLIED_COPY = "Code applied. Log expenses on three different days and your free month kicks in."

/** What the share sheet sends. Same words on Mobile. */
export function shareMessage(link: string): string {
  return `I plan my spending with Aviary. It tells me what I can still spend this month. Sign up with my link and we both get a month of Pro: ${link}`
}
