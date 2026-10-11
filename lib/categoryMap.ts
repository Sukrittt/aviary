import type { ScopedCollection } from './scoped'

export interface CategoryMap {
  words: Record<string, string>
  updatedAt: string
}

/**
 * One `category_map_overrides` doc: word → LLM-picked category.
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
 * words — overrides are deliberate LLM picks (from `/api/category-map/suggest`),
 * not majority-vote noise, so they win on conflicts.
 */
export async function buildCategoryMap(
  collection: ScopedCollection,
  overridesCollection?: ScopedCollection,
): Promise<CategoryMap> {
  const rows = await collection
    .find({}, { projection: { item: 1, category: 1, _id: 0 } })
    .toArray()

  const wordCategories = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const item = String(row.item ?? '')
    const category = String(row.category ?? '')
    if (!item || !category) continue
    const words = item.toLowerCase().split(/\s+/)
    for (const word of words) {
      if (word.length < 2) continue
      let catCount = wordCategories.get(word)
      if (!catCount) {
        catCount = new Map()
        wordCategories.set(word, catCount)
      }
      catCount.set(category, (catCount.get(category) ?? 0) + 1)
    }
  }

  const words: Record<string, string> = {}
  for (const [word, cats] of wordCategories) {
    let bestCat = ''
    let bestCount = 0
    for (const [cat, count] of cats) {
      if (count > bestCount) {
        bestCat = cat
        bestCount = count
      }
    }
    if (bestCat) words[word] = bestCat
  }

  if (overridesCollection) {
    const overrides = await overridesCollection.find({}).toArray()
    for (const doc of overrides) {
      const word = String(doc.word ?? '')
      const category = String(doc.category ?? '')
      if (word && category) words[word] = category
    }
  }

  return { words, updatedAt: new Date().toISOString() }
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
 * override (from /api/category-map/suggest). Without this the map only ever
 * refreshes when the serverless instance recycles.
 */
export function invalidateCategoryMap(userId: string): void {
  cache.delete(userId)
}

/** Item words the map keys on: lowercased, whitespace-split, 2+ chars. */
function itemWords(item: string): string[] {
  return item.toLowerCase().split(/\s+/).filter((word) => word.length >= 2)
}

/**
 * What the log-expense screens would have auto-picked for `item`: the category
 * most of its words map to. Mirrors Mobile's/Web's client-side suggestCategory.
 */
export function suggestFromMap(map: CategoryMap, item: string): string {
  const scores = new Map<string, number>()
  for (const word of itemWords(item)) {
    const cat = map.words[word]
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
  map: CategoryMap,
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
