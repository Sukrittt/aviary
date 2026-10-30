/**
 * The category a description points to, from the category-map dictionary: the
 * one most of its words name, first seen on a tie. A dictionary name that's no
 * longer a category still counts if a category contains it, so renaming "Food"
 * to "Food & Dining" keeps working. Twin of Web's and Mobile's copy; keep them identical.
 */
export function matchCategory(item: string, words: Record<string, string>, categories: string[]): string {
  const votes = new Map<string, number>()
  for (const word of item.toLowerCase().split(/\s+/)) {
    if (word.length < 2) continue
    // Own keys only: the word "constructor" would otherwise find Object's.
    const match = Object.hasOwn(words, word) ? words[word] : ''
    if (!match) continue
    const live = categories.includes(match)
      ? match
      : categories.find((c) => c.toLowerCase().includes(match.toLowerCase()))
    if (live) votes.set(live, (votes.get(live) ?? 0) + 1)
  }
  let best = ''
  let bestVotes = 0
  for (const [category, count] of votes) {
    if (count > bestVotes) {
      best = category
      bestVotes = count
    }
  }
  return best
}
