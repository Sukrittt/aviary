'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin'
import { audit } from '@/lib/adminAudit'
import { getSystemSettings, saveSystemSettings, type SystemSettings } from '@/lib/systemSettings'
import type { ActionResult } from '../ActionForm'

const MESSAGE_MAX = 280
const VERSION_RE = /^\d+\.\d+\.\d+$/

export async function saveSettingsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const adminId = await requireAdmin()
  const message = String(form.get('maintenanceMessage') ?? '').trim().slice(0, MESSAGE_MAX)
  const latestVersion = String(form.get('androidLatestVersion') ?? '').trim().slice(0, 32)
  const minVersion = String(form.get('androidMinVersion') ?? '').trim().slice(0, 32)
  const storeUrl = String(form.get('androidStoreUrl') ?? '').trim().slice(0, 500)
  const capRaw = String(form.get('aiMonthlyCostUsd') ?? '').trim()
  const cap = capRaw === '' ? null : Number(capRaw)
  if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) return { ok: false, message: 'AI allowance must be a positive USD amount, or empty for no cap' }
  const next: SystemSettings = {
    aiDisabled: form.get('aiDisabled') === 'on',
    aiMonthlyCostUsd: cap,
    maintenance: { on: form.get('maintenanceOn') === 'on', message },
    appUpdate: { android: { latestVersion, minVersion, storeUrl } },
    // Two independent switches, on purpose: purchase entry can go live for a
    // test cohort while nobody is locked out yet, and enforcement can be
    // rolled back without hiding the way to pay. See
    // payment-subscriptions-plan.md, "Controlled launch".
    billing: {
      enforced: form.get('billingEnforced') === 'on',
      purchaseEnabled: form.get('billingPurchaseEnabled') === 'on',
      audience: form.get('billingAudience') === 'everyone' ? 'everyone' : 'testers',
      retentionDeleteEnabled: form.get('billingRetentionDelete') === 'on',
    },
  }
  if (next.maintenance.on && !message) return { ok: false, message: 'Add a banner message before turning it on' }
  if (latestVersion && !VERSION_RE.test(latestVersion)) return { ok: false, message: 'Use an Android version like 2.3.0' }
  if (minVersion && !VERSION_RE.test(minVersion)) return { ok: false, message: 'Use a minimum version like 2.3.0' }
  if (minVersion && !latestVersion) return { ok: false, message: 'Set the latest version too when setting a minimum' }
  if ((latestVersion || minVersion) && !storeUrl.startsWith('https://')) return { ok: false, message: 'Add a valid HTTPS Play Store URL' }

  const before = await getSystemSettings()
  await saveSystemSettings(next)
  await audit(adminId, 'system.settings', null, { from: before, to: next })
  revalidatePath('/admin/system')
  return { ok: true, message: 'Saved. Other server instances pick this up within 30 seconds.' }
}
