import { apiFetch } from './client'
import type { WeekRecap } from '@/lib/weekRecap'

export type { WeekRecap }


/** Days 1 to 7, before the recap is due: the first week so far, for the Home card. */
export interface WeekLearning {
  day: number
  loggedDates: string[]
  /** The date the recap becomes due. */
  unlocksOn: string
}

export async function getWeekRecap(): Promise<{ due: boolean; recap?: WeekRecap; learning?: WeekLearning }> {
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
