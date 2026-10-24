'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import { audit } from '@/lib/adminAudit'
import { getDb } from '@/lib/mongodb'
import { normalizeCode, REFERRAL_CODES, type ReferralCodeDoc } from '@/lib/referrals'
import type { ActionResult } from '../ActionForm'

const MAX_MONTHS = 12

function months(value: FormDataEntryValue | null): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= MAX_MONTHS ? n : null
}

/** A creator or ambassador code: chosen by hand, with its own reward and landing line. */
export async function createCodeAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const code = normalizeCode(form.get('code'))
  if (!code) return { ok: false, message: 'Codes are 3 to 16 letters or digits, no spaces' }
  const label = String(form.get('label') ?? '').trim().slice(0, 60)
  if (!label) return { ok: false, message: 'Say who this code is for' }
  const refereeMonths = months(form.get('refereeMonths'))
  if (refereeMonths === null) return { ok: false, message: `Months must be whole numbers from 1 to ${MAX_MONTHS}` }
  // Creators are paid outside the app, and a creator code has no account to reward.
  const referrerMonths = 0
  const offer = String(form.get('offer') ?? '').trim().slice(0, 120) || null

  const doc: ReferralCodeDoc = { _id: code, kind: 'creator', ownerId: null, label, refereeMonths, referrerMonths, offer, active: true, createdAt: new Date() }
  try {
    await (await getDb()).collection<ReferralCodeDoc>(REFERRAL_CODES).insertOne(doc)
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { ok: false, message: `${code} is taken` }
    throw err
  }
  await audit(adminId, 'referral.code_create', null, { code, label, refereeMonths, referrerMonths, offer })
  revalidatePath('/admin/referrals')
  return { ok: true, message: `${code} is live` }
}

/** Pause or resume a code. A paused code can't be applied; referrals already made keep going. */
export async function toggleCodeAction(code: string, _prev: ActionResult): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const coll = (await getDb()).collection<ReferralCodeDoc>(REFERRAL_CODES)
  const doc = await coll.findOne({ _id: code })
  if (!doc) return { ok: false, message: 'No such code' }
  await coll.updateOne({ _id: code }, { $set: { active: !doc.active } })
  await audit(adminId, 'referral.code_toggle', doc.ownerId, { code, active: !doc.active })
  revalidatePath('/admin/referrals')
  return { ok: true, message: doc.active ? `${code} paused` : `${code} resumed` }
}
