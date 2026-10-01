import { apiFetch } from './client'
import type { CategoryMap } from '@/src/types'

export async function getCategoryMap(): Promise<CategoryMap> {
  const resp = await apiFetch('/api/category-map')
  if (!resp.ok) throw new Error(`Failed to load category map: ${resp.status}`)
  return resp.json()
}

/**
 * LLM fallback for when the local keyword match finds nothing. Never throws.
 * '' means the model found no fitting category; null means the request failed
 * (offline, rate limited), so callers can retry later instead of remembering "no fit".
 */
export async function suggestCategoryLLM(item: string, categories: string[]): Promise<string | null> {
  if (!item.trim()) return ''
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const resp = await apiFetch('/api/category-map/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, categories }),
      signal: controller.signal,
    })
    if (!resp.ok) return null
    const data: { category?: string } = await resp.json()
    return data.category ?? ''
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
