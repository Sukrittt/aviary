import { apiFetch } from './client'
import type { Forecast } from '@/lib/forecast'

export type { Forecast }

export async function getForecast(): Promise<Forecast> {
  const resp = await apiFetch('/api/forecast')
  if (!resp.ok) throw new Error(`Failed to load forecast: ${resp.status}`)
  return resp.json()
}
