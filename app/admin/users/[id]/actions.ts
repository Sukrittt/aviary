'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isCurrencyCode, resolveCurrency } from '@/src/lib/currencies'
import { prefsFor } from '@/lib/notifications/rules'
import { requireAdmin } from '@/lib/admin'
import { audit } from '@/lib/adminAudit'
import { purgeAccountNow, restoreAccount, softDeleteAccount } from '@/lib/accountLifecycle'
import { getDb } from '@/lib/mongodb'
import { cancelWebSubscriptions } from '@/lib/billing/service'
import type { UserDoc } from '@/lib/users'
import type { ActionResult } from '../../ActionForm'
import { getWorkOSClient } from '@/lib/workosClient'


const NOTIFY_FLAGS = ['notifyThresholds', 'notifyBills', 'notifyCoach', 'notifyWrapped'] as const

async function target(userId: string) {
  const db = await getDb()
  const user = await db.collection<UserDoc>('users').findOne({ _id: userId })
  return { db, user }
}

function done(userId: string, message: string): ActionResult {
  revalidatePath(`/admin/users/${encodeURIComponent(userId)}`)
  return { ok: true, message }
}

export async function updateUserAction(userId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const { db, user } = await target(userId)
  if (!user) return { ok: false, message: 'User not found' }

  const name = String(form.get('name') ?? '').trim().slice(0, 100)
  const currencyCode = form.get('currencyCode')
  const cadence = form.get('notifyCadence')
  const leadDays = Number(form.get('notifyBillLeadDays'))

  if (!isCurrencyCode(currencyCode)) return { ok: false, message: 'Invalid currency' }
  if (cadence !== 'off' && cadence !== 'weekly' && cadence !== 'daily') return { ok: false, message: 'Invalid digest cadence' }
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 30) return { ok: false, message: 'Bill lead days must be 0–30' }

  const next: Partial<UserDoc> = { name: name || null, currencyCode, notifyCadence: cadence, notifyBillLeadDays: leadDays }
  for (const flag of NOTIFY_FLAGS) next[flag] = form.get(flag) === 'on'

  // Compare against effective values (defaults applied), so saving an untouched form records no changes.
  const prefs = prefsFor(user)
  const current: Partial<UserDoc> = {
    name: user.name ?? null,
    currencyCode: resolveCurrency(user.currencyCode),
    notifyCadence: prefs.cadence,
    notifyBillLeadDays: prefs.billLeadDays,
    notifyThresholds: prefs.thresholds,
    notifyBills: prefs.bills,
    notifyCoach: prefs.coach,
    notifyWrapped: prefs.wrapped,
  }
  const changes = Object.fromEntries(
    Object.entries(next)
      .filter(([key, value]) => current[key as keyof UserDoc] !== value)
      .map(([key, value]) => [key, { from: current[key as keyof UserDoc], to: value }]),
  )
  if (Object.keys(changes).length === 0) return { ok: true, message: 'Nothing changed' }

  // Name mirrors into WorkOS, same as PATCH /api/user.
  if ('name' in changes) await getWorkOSClient().userManagement.updateUser({ userId, name: name || undefined })
  await db.collection<UserDoc>('users').updateOne({ _id: userId }, { $set: next })
  await audit(adminId, 'user.update', userId, { changes })
  return done(userId, `Saved ${Object.keys(changes).length} change(s)`)
}

export async function revokeSessionsAction(userId: string): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const workos = getWorkOSClient()
  const sessions = await workos.userManagement.listSessions(userId)
  const active = sessions.data.filter((s) => s.status === 'active')
  await Promise.all(active.map((s) => workos.userManagement.revokeSession({ sessionId: s.id })))
  await audit(adminId, 'user.revoke_sessions', userId, { revoked: active.length })
  return done(userId, `Revoked ${active.length} session(s)`)
}

export async function softDeleteAction(userId: string): Promise<ActionResult> {
  const adminId = await requireAdmin()
  if (userId === adminId) return { ok: false, message: "You can't delete your own account here" }
  const { db, user } = await target(userId)
  if (!user) return { ok: false, message: 'User not found' }
  if (user.deleted_at) return { ok: false, message: 'Already scheduled for deletion' }

  // Same as the user's own delete: a web subscription must not outlive the account.
  try {
    await cancelWebSubscriptions(userId)
  } catch (err) {
    return { ok: false, message: `Couldn't cancel their web subscription, nothing changed: ${(err as Error).message}` }
  }

  await softDeleteAccount(db, userId)
  await audit(adminId, 'user.soft_delete', userId, { email: user.email })
  return done(userId, 'Scheduled for deletion')
}

export async function restoreAction(userId: string): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const { db, user } = await target(userId)
  if (!user?.deleted_at) return { ok: false, message: 'Account is not scheduled for deletion' }

  await restoreAccount(db, userId)
  await audit(adminId, 'user.restore', userId, { email: user.email })
  return done(userId, 'Account restored')
}

export async function hardDeleteAction(userId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  if (userId === adminId) return { ok: false, message: "You can't delete your own account here" }
  const { db, user } = await target(userId)
  if (!user) return { ok: false, message: 'User not found' }

  const typed = String(form.get('confirmEmail') ?? '').trim().toLowerCase()
  if (!typed || typed !== user.email.toLowerCase()) return { ok: false, message: 'Typed email does not match' }

  const result = await purgeAccountNow(db, userId)
  await audit(adminId, 'user.hard_delete', userId, { email: user.email, ...result })
  redirect('/admin/users')
}
