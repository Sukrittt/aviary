import type { ScopedCollection } from './scoped'

export interface CategoryMap {
  words: Record<string, string>
  /** Whole item (itemKey) → the category it was last saved under. Server-only: GET /api/category-map sends `words`. */
  items: Record<string, string>
  updatedAt: string
}

/** How `items` keys an item: lowercased, spaces collapsed. */
export const itemKey = (item: string) => item.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * One `category_map_overrides` doc: word → category, from a user correction
 * (`source: 'user'`) or, in older docs, an LLM pick (`source: 'llm'`).
 *
 * The word lives in a `word` field rather than being the `_id`. It used to be
 * the `_id`, which made it a globally unique key — two users could not both
 * teach the app what "swiggy" means. Uniqueness is now the compound index
 * `{user_id, word}`.
 */
export interface CategoryMapOverride {
  word: string
  category: string
  source: string
  createdAt: string
}

/**
 * Build the word → category autosuggest map from the expenses collection.
 * Port of the legacy buildCategoryMap (vite.config.ts), reading Mongo docs
 * instead of a CSV file.
 *
 * `overridesCollection`, when passed, is merged on top of the frequency-derived
 * words. User corrections win on conflicts; older LLM picks only fill words the
 * user has no history for.
 */
export async function buildCategoryMap(
  collection: ScopedCollection,
  overridesCollection?: ScopedCollection,
): Promise<CategoryMap> {
  const rows = await collection
    .find({}, { projection: { item: 1, category: 1, timestamp: 1, _id: 0 } })
    .toArray()

  const wordCategories = new Map<string, Map<string, number>>()
  // An exact item keeps the category it was last saved under, so a correction beats older votes.
  const itemLatest = new Map<string, { at: string; category: string }>()
  const vote = (votes: Map<string, Map<string, number>>, key: string, category: string) => {
    let catCount = votes.get(key)
    if (!catCount) {
      catCount = new Map()
      votes.set(key, catCount)
    }
    catCount.set(category, (catCount.get(category) ?? 0) + 1)
  }

  for (const row of rows) {
    const item = String(row.item ?? '')
    const category = String(row.category ?? '')
    if (!item || !category) continue
    for (const word of itemWords(item)) vote(wordCategories, word, category)
    const key = itemKey(item)
    const at = String(row.timestamp ?? '')
    const seen = itemLatest.get(key)
    if (!seen || at >= seen.at) itemLatest.set(key, { at, category })
  }

  const words = majority(wordCategories)

  if (overridesCollection) {
    const overrides = await overridesCollection.find({}).toArray()
    for (const doc of overrides) {
      const word = String(doc.word ?? '')
      const category = String(doc.category ?? '')
      if (!category || !isKeyWord(word)) continue
      // An AI guess only fills a gap: what the user actually saved knows better.
      if (doc.source === 'llm' && word in words) continue
      words[word] = category
    }
  }

  return { words, items: Object.fromEntries([...itemLatest].map(([key, { category }]) => [key, category])), updatedAt: new Date().toISOString() }
}

function majority(votes: Map<string, Map<string, number>>): Record<string, string> {
  // fromEntries, not assignment: a key like "__proto__" stays a plain entry.
  return Object.fromEntries([...votes].flatMap(([key, cats]) => {
    let bestCat = ''
    let bestCount = 0
    for (const [cat, count] of cats) {
      if (count > bestCount) {
        bestCat = cat
        bestCount = count
      }
    }
    return bestCat ? [[key, bestCat]] : []
  }))
}

// ponytail: unbounded Map on a personal app with a handful of users; swap for
// an LRU if the user count ever makes that a memory concern.
const cache = new Map<string, CategoryMap>()

/** Cached per-user map, built on first request per serverless instance. */
export async function getCachedCategoryMap(
  userId: string,
  collection: ScopedCollection,
  overridesCollection?: ScopedCollection,
): Promise<CategoryMap> {
  let map = cache.get(userId)
  if (!map) {
    map = await buildCategoryMap(collection, overridesCollection)
    cache.set(userId, map)
  }
  return map
}

/**
 * Bust one user's cached map — call after anything that changes its inputs:
 * a new/edited expense (item/category feed the word-frequency scan) or a new
 * override (a user correction). Without this the map only ever
 * refreshes when the serverless instance recycles.
 */
export function invalidateCategoryMap(userId: string): void {
  cache.delete(userId)
}

// Words too generic to say anything about a category. Fragments under three
// letters are dropped too: in prod they were mostly half-typed text ("ou", "ap").
const FILLER = new Set(['and', 'the', 'for', 'with', 'from', 'into'])

function isKeyWord(word: string): boolean {
  return word.length >= 3 && !FILLER.has(word)
}

/** Item words the map keys on: lowercased, whitespace-split, 3+ chars, no filler. */
function itemWords(item: string): string[] {
  return item.toLowerCase().split(/\s+/).filter(isKeyWord)
}

/**
 * What the log-expense screens would have auto-picked for `item`: the category
 * most of its words map to. Mirrors Mobile's/Web's client-side suggestCategory.
 */
export function suggestFromMap(map: Omit<CategoryMap, 'items'>, item: string): string {
  const scores = new Map<string, number>()
  for (const word of itemWords(item)) {
    // Own keys only: an item called "constructor" would otherwise find Object's.
    const cat = Object.hasOwn(map.words, word) ? map.words[word] : ''
    if (cat) scores.set(cat, (scores.get(cat) ?? 0) + 1)
  }
  let best = ''
  let bestScore = 0
  for (const [cat, score] of scores) {
    if (score > bestScore) {
      best = cat
      bestScore = score
    }
  }
  return best
}

/**
 * Remember a correction. When the map (as it stood before this save) would
 * have suggested a different category than the one the user saved, store
 * their choice as an override for every word in the item. Without this a
 * correction was one more frequency vote, so it lost to older votes and never
 * beat an earlier LLM override at all.
 *
 * Pass the map from *before* the write: afterwards the new row is already a
 * vote and can hide the mismatch. Returns whether anything was written.
 */
export async function learnCategoryCorrection(
  map: Omit<CategoryMap, 'items'>,
  item: string,
  category: string,
  overridesCollection: ScopedCollection,
): Promise<boolean> {
  const suggested = suggestFromMap(map, item)
  if (!suggested || suggested === category) return false
  const now = new Date().toISOString()
  await Promise.all(
    itemWords(item).map((word) =>
      overridesCollection.updateOne(
        { word },
        { $set: { word, category, source: 'user', createdAt: now } },
        { upsert: true },
      ),
    ),
  )
  return true
}
