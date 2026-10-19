// Twin of Mobile's src/lib/activityFeed.ts.

// Every feed refetch re-signs every photo, and a new URL is a cache miss, so
// each image would reload on any write. Keep the first URL seen for a blob
// while it's sure to still be valid. The server signs feed URLs for an hour
// but keeps handing out a cached one until half that is gone, so a URL may
// arrive with only 30 minutes left; stay under that (lib/expensePhoto.ts).
// Keyed by the path, which changes when a photo is replaced.
const REUSE_MS = 25 * 60 * 1000
// Far more photos than one session scrolls past; past it, the oldest go.
const MAX_SEEN = 500
const seen = new Map<string, { url: string; at: number }>()

export function stablePhotoUrl(url: string, now: number = Date.now()): string {
  const path = url.split('?')[0]
  const hit = seen.get(path)
  if (hit && now - hit.at < REUSE_MS) return hit.url
  seen.delete(path)
  seen.set(path, { url, at: now })
  if (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value!)
  return url
}
