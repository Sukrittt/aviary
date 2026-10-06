import { apiFetch } from './client'
import type { WeekRecap } from '@/lib/weekRecap'

export type { WeekRecap }

export async function getWeekRecap(): Promise<{ due: boolean; recap?: WeekRecap }> {
  const resp = await apiFetch('/api/recap')
  if (!resp.ok) throw new Error(`Failed to load recap: ${resp.status}`)
  return resp.json()
}

/** First device to call this wins; the recap is never due again anywhere. */
export async function markWeekRecapSeen(): Promise<void> {
  const resp = await apiFetch('/api/user', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekRecapSeen: true }),
  })
  if (!resp.ok) throw new Error(`Failed to mark recap seen: ${resp.status}`)
}
