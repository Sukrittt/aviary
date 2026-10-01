// User profile, notifications and data-management calls. Twin of
// Mobile/src/api/account.ts; here they ride the same-origin AuthKit session
// cookie rather than a bearer token.
//
// Mobile drops this device's push token before each destructive action here
// (delete account, revoke a session, sign out everywhere). Push is mobile-only
// per the parity plan, so a browser holds no token to drop and those calls
// have no counterpart below.
import { apiFetch } from './client'

export interface UserProfile {
  _id?: string
  currencyCode?: string
  email: string
  emailVerified: boolean
  name?: string | null
  avatarUrl?: string | null
  onboardedAt?: string | null
  getStartedAt?: string | null
  manualTransactionCompletedAt?: string | null
  guidedTourCompletedAt?: string | null
  notifyCadence?: 'off' | 'weekly' | 'daily'
  notifyThresholds?: boolean
  notifyBills?: boolean
  notifyBillLeadDays?: number
  notifyCoach?: boolean
  notifyWrapped?: boolean
  /** Set while the account is within its post-delete grace window — null once active or purged. */
  deletionScheduledFor?: string | null
}

export interface SessionRow {
  id: string
  userAgent: string | null
  authMethod: string
  createdAt: string
  current: boolean
}

export async function getUser(): Promise<UserProfile> {
  const resp = await apiFetch('/api/user')
  if (!resp.ok) throw new Error(`Failed to load user: ${resp.status}`)
  return resp.json()
}

export async function updateUser(patch: Partial<UserProfile>): Promise<UserProfile> {
  const resp = await apiFetch('/api/user', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!resp.ok) throw new Error(`Failed to update user: ${resp.status}`)
  return resp.json()
}

/** The server stamps this milestone once; replaying the tour is safe. */
export async function completeGuidedTour(): Promise<UserProfile> {
  const resp = await apiFetch('/api/user', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guidedTourCompleted: true }),
  })
  if (!resp.ok) throw new Error(`Failed to complete guided tour: ${resp.status}`)
  return resp.json()
}

export async function deleteAccount(email: string): Promise<void> {
  const resp = await apiFetch('/api/user', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!resp.ok) throw new Error(`Failed to delete account: ${resp.status}`)
}

/** Undoes a deleteAccount() within its grace window — 404s once the GC cron has purged it. */
export async function restoreAccount(): Promise<void> {
  const resp = await apiFetch('/api/user/restore', { method: 'POST' })
  if (!resp.ok) throw new Error(`Failed to restore account: ${resp.status}`)
}

export type ArchivableCollection = 'expenses' | 'budgets' | 'categories' | 'groups' | 'subscriptions' | 'holdings'

export interface ArchivedItem {
  id: string
  collection: ArchivableCollection
  label: string
  deletedAt: string
  purgesAt: string
  amount?: number
}

/** Every soft-deleted row still within its 7-day grace window, across all collections. */
export async function getArchive(): Promise<ArchivedItem[]> {
  const resp = await apiFetch('/api/archive')
  if (!resp.ok) throw new Error(`Failed to load archive: ${resp.status}`)
  const body: { items: ArchivedItem[] } = await resp.json()
  return body.items
}

export async function restoreArchivedItem(collection: ArchivableCollection, id: string): Promise<void> {
  const resp = await apiFetch('/api/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection, id }),
  })
  if (resp.status === 409) throw new Error('A live item with this name already exists.')
  if (!resp.ok) throw new Error(`Failed to restore item: ${resp.status}`)
}

/** Purges an archived item immediately instead of waiting out the 7-day grace window. */
export async function purgeArchivedItem(collection: ArchivableCollection, id: string): Promise<void> {
  const resp = await apiFetch('/api/archive', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection, id }),
  })
  if (!resp.ok) throw new Error(`Failed to delete item: ${resp.status}`)
}

export interface ExportRow {
  id: string
  status: 'pending' | 'ready' | 'failed'
  created_at: string
  error: string | null
}

export interface ExportsResponse {
  exports: ExportRow[]
  usedThisMonth: number
  limit: number
  canExport: boolean
  exitExport: boolean
  accessExpired: boolean
}

/** Kicks off a background export; throws `quota_exceeded` distinctly for a 429. */
export async function startExport(): Promise<{ id: string; status: string; remaining: number }> {
  const resp = await apiFetch('/api/data/export', { method: 'POST' })
  if (resp.status === 429) throw new Error('quota_exceeded')
  if (!resp.ok) throw new Error(`Failed to start export: ${resp.status}`)
  return resp.json()
}

export async function getExports(): Promise<ExportsResponse> {
  const resp = await apiFetch('/api/data/exports')
  if (!resp.ok) throw new Error(`Failed to load exports: ${resp.status}`)
  return resp.json()
}

/** Mints a short-lived signed URL for a ready export — the blob store is private, so there's no plain link to open. */
export async function getExportDownloadUrl(id: string): Promise<string> {
  const resp = await apiFetch(`/api/data/exports/${id}/download`)
  if (!resp.ok) throw new Error(`Failed to get export download link: ${resp.status}`)
  const body: { url: string } = await resp.json()
  return body.url
}

export async function clearTransactions(): Promise<void> {
  const resp = await apiFetch('/api/data/clear-transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  })
  if (!resp.ok) throw new Error(`Failed to clear transactions: ${resp.status}`)
}

/** Starts an email change. Commits immediately on WorkOS's side and sends a
 * verification code to the new address — see verifyEmailChange. */
export async function changeEmail(email: string): Promise<{ email: string; emailVerified: boolean }> {
  const resp = await apiFetch('/api/user/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (resp.status === 409) throw new Error('That email is already in use.')
  if (!resp.ok) throw new Error(`Failed to change email: ${resp.status}`)
  return resp.json()
}

export async function verifyEmailChange(code: string): Promise<boolean> {
  const resp = await apiFetch('/api/user/email/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return resp.ok
}

export async function resendEmailCode(): Promise<void> {
  await apiFetch('/api/user/email/resend', { method: 'POST' })
}

export async function getSessions(): Promise<SessionRow[]> {
  const resp = await apiFetch('/api/user/sessions')
  if (!resp.ok) throw new Error(`Failed to load sessions: ${resp.status}`)
  const body: { data: SessionRow[] } = await resp.json()
  return body.data
}

export async function revokeSession(id: string): Promise<void> {
  const resp = await apiFetch(`/api/user/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error(`Failed to revoke session: ${resp.status}`)
}

export async function revokeAllSessions(): Promise<void> {
  const resp = await apiFetch('/api/user/sessions', { method: 'DELETE' })
  if (!resp.ok) throw new Error(`Failed to sign out everywhere: ${resp.status}`)
}

export async function getIdentityProviders(): Promise<string[]> {
  const resp = await apiFetch('/api/user/identities')
  if (!resp.ok) throw new Error(`Failed to load identities: ${resp.status}`)
  const body: { providers: string[] } = await resp.json()
  return body.providers
}

export interface PrivacyProof {
  fields: string[]
  sample: Record<string, string> | null
}

/** The user's most recent expense exactly as stored — encrypted fields still `enc:v1:…`.
 *  Backs the "Your data, encrypted" proof section on the security screen. */
export async function getPrivacyProof(): Promise<PrivacyProof> {
  const resp = await apiFetch('/api/privacy/proof')
  if (!resp.ok) throw new Error(`Failed to load privacy proof: ${resp.status}`)
  return resp.json()
}
