/**
 * Onboarding's "Suggested split": the 50/30/20 rule. Needs get half the
 * income, wants 30%, savings 20%. Each category is tagged need/want/savings,
 * by name for the defaults the wizard offers, by Jev for names the user typed
 * (see /api/onboarding/split-buckets), and by group name as a last resort.
 */

export type Bucket = 'need' | 'want' | 'savings'

export const BUCKETS: readonly Bucket[] = ['need', 'want', 'savings']

export const BUCKET_SHARES: Record<Bucket, number> = { need: 50, want: 30, savings: 20 }

/** A category on the assign step. `key` is whatever the caller indexes amounts by. */
export interface SplitItem {
  key: string
  name: string
  group: string
}

/** Jev's tags, keyed by `normName(category name)`. */
export type BucketTags = Partial<Record<string, Bucket>>

// The wizard's default categories, and how much of their bucket each takes
// relative to the others (rent usually dwarfs utilities).
const KNOWN: Record<string, { bucket: Bucket; weight: number }> = {
  rent: { bucket: 'need', weight: 4 },
  groceries: { bucket: 'need', weight: 2 },
  utilities: { bucket: 'need', weight: 1 },
  transport: { bucket: 'need', weight: 1 },
  'eating out': { bucket: 'want', weight: 1 },
  entertainment: { bucket: 'want', weight: 1 },
  software: { bucket: 'want', weight: 1 },
  subscriptions: { bucket: 'want', weight: 1 },
  shopping: { bucket: 'want', weight: 1 },
  'emergency fund': { bucket: 'savings', weight: 1 },
  investments: { bucket: 'savings', weight: 1 },
}

// The wizard's default groups, for a category neither list above nor Jev could tag.
const KNOWN_GROUPS: Record<string, Bucket> = { essentials: 'need', lifestyle: 'want', savings: 'savings' }

export const normName = (s: string) => s.trim().toLowerCase()

export function knownBucket(name: string): Bucket | null {
  return KNOWN[normName(name)]?.bucket ?? null
}

function bucketFor(item: SplitItem, tags: BucketTags): Bucket {
  return knownBucket(item.name) ?? tags[normName(item.name)] ?? KNOWN_GROUPS[normName(item.group)] ?? 'want'
}

// Round to a unit that suits the income's size: hundreds for 61,600, tens for 3,000.
function roundingUnit(income: number): number {
  return 10 ** Math.max(0, String(Math.floor(income)).length - 3)
}

/**
 * Splits `income` by `weights`, each share floored to a round unit, with the
 * leftover on the biggest share. Always adds up to `income` exactly.
 */
export function allocate(income: number, weights: Record<string, number>): Record<string, number> {
  const keys = Object.keys(weights)
  if (!keys.length) return {}
  const total = keys.reduce((n, k) => n + weights[k], 0)
  const share = (k: string) => (total > 0 ? weights[k] / total : 1 / keys.length)
  const unit = roundingUnit(income)
  const out: Record<string, number> = {}
  let used = 0
  let biggest = keys[0]
  for (const k of keys) {
    out[k] = Math.floor((income * share(k)) / unit) * unit
    used += out[k]
    if (share(k) > share(biggest)) biggest = k
  }
  out[biggest] += income - used
  return out
}

export function suggestSplit(income: number, items: SplitItem[], tags: BucketTags): Record<string, number> {
  const buckets = items.map((it) => bucketFor(it, tags))
  const itemWeight = (it: SplitItem) => KNOWN[normName(it.name)]?.weight ?? 1
  const bucketWeight: Record<Bucket, number> = { need: 0, want: 0, savings: 0 }
  items.forEach((it, i) => (bucketWeight[buckets[i]] += itemWeight(it)))
  // A bucket nobody picked drops out; the rest keep their ratio to each other.
  const weights: Record<string, number> = {}
  items.forEach((it, i) => {
    const b = buckets[i]
    weights[it.key] = (BUCKET_SHARES[b] * itemWeight(it)) / bucketWeight[b]
  })
  return allocate(income, weights)
}

export function splitEvenly(income: number, keys: string[]): Record<string, number> {
  return allocate(income, Object.fromEntries(keys.map((k) => [k, 1])))
}

/** Categories worth asking Jev about: names the defaults don't cover, one per name. */
export function unknownCategories(items: SplitItem[]): { name: string; group: string }[] {
  const seen = new Set<string>()
  const out: { name: string; group: string }[] = []
  for (const it of items) {
    const n = normName(it.name)
    if (!n || KNOWN[n] || seen.has(n)) continue
    seen.add(n)
    out.push({ name: it.name.trim(), group: it.group.trim() })
  }
  return out
}
