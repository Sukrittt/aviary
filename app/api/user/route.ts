import { isCurrencyCode } from '@/src/lib/currencies'
import { json, error, readBody, isValidTimezone } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { getDb } from '@/lib/mongodb'
import { getWorkOSClient } from '@/lib/workosClient'
import { serializeUser, HIDEABLE_FEATURES, type HideableFeature, type UserDoc } from '@/lib/users'
import { purgesAt } from '@/lib/archive'
import { softDeleteAccount } from '@/lib/accountLifecycle'
import { cancelWebSubscriptions, completeOnboarding } from '@/lib/billing/service'
import { BillingProviderError } from '@/lib/billing/providerError'

export const dynamic = 'force-dynamic'


export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  const db = await getDb()
  const user = await db.collection<UserDoc>('users').findOne({ _id: auth.userId })
  return json(serializeUser(user))
}

export async function PATCH(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  const body = await readBody(req)
  const name = typeof body.name === 'string' ? body.name.trim() : undefined

  const updates: Partial<
    Pick<
      UserDoc,
      | 'currencyCode'
      | 'timezone'
      | 'name'
      | 'notifyCadence'
      | 'notifyThresholds'
      | 'notifyBills'
      | 'notifyBillLeadDays'
      | 'notifyCoach'
      | 'notifyWrapped'
      | 'hiddenFeatures'
    >
  > = {}
  if ('currencyCode' in body) {
    if (!isCurrencyCode(body.currencyCode)) return error('invalid currency code')
    updates.currencyCode = body.currencyCode
  }
  if ('timezone' in body) {
    if (!isValidTimezone(body.timezone)) return error('invalid timezone')
    updates.timezone = body.timezone
  }
  if (name !== undefined) updates.name = name || null
  if (body.notifyCadence === 'off' || body.notifyCadence === 'weekly' || body.notifyCadence === 'daily') {
    updates.notifyCadence = body.notifyCadence
  }
  if (typeof body.notifyThresholds === 'boolean') updates.notifyThresholds = body.notifyThresholds
  if (typeof body.notifyBills === 'boolean') updates.notifyBills = body.notifyBills
  if (typeof body.notifyBillLeadDays === 'number' && body.notifyBillLeadDays >= 0 && body.notifyBillLeadDays <= 30) {
    updates.notifyBillLeadDays = body.notifyBillLeadDays
  }
  if (typeof body.notifyCoach === 'boolean') updates.notifyCoach = body.notifyCoach
  if (typeof body.notifyWrapped === 'boolean') updates.notifyWrapped = body.notifyWrapped
  if ('hiddenFeatures' in body) {
    const list = body.hiddenFeatures
    if (!Array.isArray(list) || !list.every((f) => HIDEABLE_FEATURES.includes(f))) return error('invalid hiddenFeatures')
    updates.hiddenFeatures = [...new Set(list as HideableFeature[])]
  }
  const completingGuidedTour = body.guidedTourCompleted === true
  const seeingWeekRecap = body.weekRecapSeen === true

  // `onboardedAt` is no longer a client-writable profile field: completing
  // onboarding is what starts the 45-day trial clock, so its instant has to
  // be the server's. Released app versions still PATCH it here, so the key
  // is honoured as a *request to complete onboarding* — the value they send
  // is discarded — and routed through the same server-owned action as
  // POST /api/onboarding/complete. See lib/billing/service.ts.
  const completing = 'onboardedAt' in body
  if (!completing && !completingGuidedTour && !seeingWeekRecap && Object.keys(updates).length === 0) return error('no valid fields')

  if (name !== undefined) {
    await getWorkOSClient().userManagement.updateUser({ userId: auth.userId, name: name || undefined })
  }

  const db = await getDb()
  if (Object.keys(updates).length > 0) {
    await db.collection<UserDoc>('users').updateOne({ _id: auth.userId }, { $set: updates })
  }
  if (completingGuidedTour) {
    // A boolean intent keeps the timestamp server-owned and makes retries safe.
    await db.collection<UserDoc>('users').updateOne(
      { _id: auth.userId, guidedTourCompletedAt: { $in: [null, undefined] } },
      { $set: { guidedTourCompletedAt: new Date().toISOString() } },
    )
  }
  if (seeingWeekRecap) {
    // Same shape as the guided tour: the first device to open the recap wins.
    await db.collection<UserDoc>('users').updateOne(
      { _id: auth.userId, weekRecapSeenAt: { $in: [null, undefined] } },
      { $set: { weekRecapSeenAt: new Date().toISOString() } },
    )
  }
  if (completing) {
    // Lenient on purpose — see completeOnboarding. This is the path released
    // app versions use, and they cannot be fixed by redeploying the API.
    // POST /api/onboarding/complete, which new clients use, stays strict:
    // that client can react to a 409 by retrying after its writes land.
    await completeOnboarding(db, auth.userId, new Date(), { requireSetup: false })
  }
  const user = await db.collection<UserDoc>('users').findOne({ _id: auth.userId })
  return json(serializeUser(user))
}

export async function DELETE(req: Request) {
  const auth = await getAuth(req)
  if (auth.readOnly) return error('unauthorized', 401)

  const body = await readBody(req)
  const confirmEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  const db = await getDb()
  // The client already gates the delete button on the typed email matching
  // the account's own — this re-checks it server-side, since that's the only
  // check that actually stops a direct API call (the old body.confirm===true
  // check was one curl call away from irreversible).
  const account = await db.collection<UserDoc>('users').findOne({ _id: auth.userId }, { projection: { email: 1 } })
  if (!account?.email || !confirmEmail || confirmEmail !== account.email.toLowerCase()) {
    return error('email confirmation required', 400)
  }

  // A web subscription is ours to stop, so stop it before the account goes.
  // If Razorpay can't be reached, refuse the delete rather than leave a
  // mandate billing someone whose account no longer exists. (A Google Play
  // subscription can only be cancelled in Play; the client warns about that.)
  try {
    await cancelWebSubscriptions(auth.userId)
  } catch (err) {
    if (err instanceof BillingProviderError) return error('could not cancel your web subscription, try again shortly', 503)
    throw err
  }

  // Soft delete, same as every other DELETE route (lib/scoped.ts) — a
  // recoverable grace window, not an immediate wipe. See lib/accountLifecycle.ts.
  const deletedAt = await softDeleteAccount(db, auth.userId)

  return json({ ok: true, deletionScheduledFor: purgesAt(deletedAt) })
}
