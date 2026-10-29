const RELOADED_AT_KEY = 'aviary-stale-build-reload'
const LOOP_GUARD_MS = 60_000

const CHUNK_FAILURE = /ChunkLoadError|Loading (CSS )?chunk .* failed|Failed to (fetch dynamically imported module|load chunk)/i

/**
 * Every push to main replaces production, and Vercel Hobby has no Skew
 * Protection: a tab opened before the deploy still runs the old build, whose
 * JS chunks now 404. The next lazy import (a route it hadn't visited, a
 * drawer) throws a ChunkLoadError into the nearest error boundary, which used
 * to show "Something went wrong". A reload picks up the new build and fixes it.
 *
 * `pathname` is the route that failed to render. A click's chunks fail before
 * the address bar moves, so a plain reload would land back on the page the
 * person was leaving; loading the route itself finishes their click.
 *
 * Reloads at most once a minute, so a chunk that's genuinely broken still
 * reaches the error screen instead of looping. Returns whether it reloaded.
 */
export function reloadIfStaleBuild(error: Error, pathname?: string | null): boolean {
  if (!CHUNK_FAILURE.test(`${error.name} ${error.message}`)) return false
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0)
    if (Date.now() - last < LOOP_GUARD_MS) return false
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()))
  } catch {
    // storage blocked: without the guard a reload could loop, so show the error screen
    return false
  }
  if (pathname && pathname !== window.location.pathname) window.location.assign(pathname)
  else window.location.reload()
  return true
}
