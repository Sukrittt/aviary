import { apiFetch, apiErrorMessage } from './client'
import type { CategoryRow } from '@/src/types'
import { BUCKETS, type Bucket, type BucketTags } from '@/src/lib/budgetSplit'

export async function getCategories(): Promise<CategoryRow[]> {
  const resp = await apiFetch('/api/categories')
  if (!resp.ok) throw new Error(`Failed to load categories: ${resp.status}`)
  return resp.json()
}

export async function addCategory(name: string, group = ''): Promise<void> {
  const resp = await apiFetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, group }),
  })
  if (!resp.ok) throw new Error(await apiErrorMessage(resp, 'Failed to add category'))
}

export async function updateCategory(
  name: string,
  updates: { newName?: string; group?: string; alertPcts?: number[] | null },
): Promise<void> {
  const resp = await apiFetch('/api/categories', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...updates }),
  })
  if (!resp.ok) throw new Error(await apiErrorMessage(resp, 'Failed to update category'))
}

export async function deleteCategory(name: string): Promise<void> {
  const resp = await apiFetch('/api/categories', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) throw new Error(`Failed to delete category: ${resp.status}`)
}

export async function moveCategory(name: string, toIndex: number): Promise<void> {
  const resp = await apiFetch('/api/categories/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, toIndex }),
  })
  if (!resp.ok) throw new Error(`Failed to move category: ${resp.status}`)
}

// Onboarding waits on this before showing the split, so it gives up fast and
// the split falls back to the default tags.
const SPLIT_BUCKETS_TIMEOUT_MS = 4_000

/**
 * Jev's need/want/savings tags for onboarding categories the defaults don't
 * cover, keyed by lowercased name. Never throws: `{}` on any failure.
 */
export async function getSplitBuckets(categories: { name: string; group: string }[]): Promise<BucketTags> {
  try {
    const resp = await apiFetch('/api/onboarding/split-buckets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories }),
      signal: AbortSignal.timeout(SPLIT_BUCKETS_TIMEOUT_MS),
    })
    if (!resp.ok) return {}
    const { buckets } = (await resp.json()) as { buckets?: Record<string, unknown> }
    return Object.fromEntries(
      Object.entries(buckets ?? {}).filter((e): e is [string, Bucket] => BUCKETS.includes(e[1] as Bucket)),
    )
  } catch {
    return {}
  }
}
