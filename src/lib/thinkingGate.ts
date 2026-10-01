// Decides when the "picking a category" state is visible while a slow
// suggestion (the AI fallback) is in flight. Dictionary hits never start it.
//
// - It only shows once a request has been pending for SHOW_AFTER_MS, so a
//   fast answer lands without a one-frame flash of the thinking state.
// - Once shown, it stays for at least MIN_VISIBLE_MS, for the same reason.
//
// Mobile keeps an identical copy in src/lib/thinkingGate.ts (only this comment differs).

export const SHOW_AFTER_MS = 150
export const MIN_VISIBLE_MS = 450

export interface ThinkingGate {
  /** A slow lookup started. Shows the thinking state after SHOW_AFTER_MS. */
  start(): void
  /**
   * The lookup answered. Runs `then` right away if thinking never showed,
   * otherwise after hiding it once it has been up for MIN_VISIBLE_MS.
   */
  finish(then?: () => void): void
  /** Drop any pending lookup and hide immediately (field cleared, manual pick, unmount). */
  cancel(): void
}

export function createThinkingGate(
  onChange: (visible: boolean) => void,
  { showAfterMs = SHOW_AFTER_MS, minVisibleMs = MIN_VISIBLE_MS, now = Date.now } = {},
): ThinkingGate {
  let showTimer: ReturnType<typeof setTimeout> | null = null
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let visibleSince: number | null = null

  function clearTimers() {
    if (showTimer) clearTimeout(showTimer)
    if (holdTimer) clearTimeout(holdTimer)
    showTimer = null
    holdTimer = null
  }

  return {
    start() {
      // A new lookup while one is still holding: stay up, drop the old hold.
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
      if (visibleSince !== null || showTimer) return
      showTimer = setTimeout(() => {
        showTimer = null
        visibleSince = now()
        onChange(true)
      }, showAfterMs)
    },
    finish(then) {
      if (showTimer) { clearTimeout(showTimer); showTimer = null }
      if (visibleSince === null) { then?.(); return }
      if (holdTimer) clearTimeout(holdTimer)
      const done = () => {
        holdTimer = null
        visibleSince = null
        onChange(false)
        then?.()
      }
      const remaining = minVisibleMs - (now() - visibleSince)
      if (remaining > 0) holdTimer = setTimeout(done, remaining)
      else done()
    },
    cancel() {
      clearTimers()
      if (visibleSince !== null) {
        visibleSince = null
        onChange(false)
      }
    },
  }
}
