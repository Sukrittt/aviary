import { apiFetch, apiErrorMessage } from './client'
import { allowanceHit } from './ai'

export interface ScanItem {
  name: string
  price: number
  qty: number
}

export interface ScanResult {
  merchant: string
  total: number
  date?: string
  category?: string
  items: ScanItem[]
}

/**
 * The server is allowed 60s for a vision call — apiFetch's default
 * REQUEST_TIMEOUT_MS is 15s, which would abort before that. Pass a longer
 * explicit signal; apiFetch honours a caller-supplied one.
 */
export async function scanBill(params: {
  image: string
  mimeType: string
  categories: string[]
}): Promise<ScanResult> {
  const resp = await apiFetch('/api/expenses/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(45_000),
  })
  if (!resp.ok) {
    await allowanceHit(resp, 'scan')
    throw new Error(await apiErrorMessage(resp, 'Failed to scan bill'))
  }
  return resp.json()
}
