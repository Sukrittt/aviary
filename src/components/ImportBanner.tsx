'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useReducedMotion } from 'motion/react'
import { CheckIcon, XIcon } from '@/src/components/icons'
import { continueImport, getImportStatus, type ImportStatus } from '@/src/api/imports'
import { readPref, writePref } from '@/src/lib/localPref'
import { track } from '@/src/lib/analytics'
import { Confetti } from './onboarding/Confetti'
import { bannerProgress, bannerSub, historyDone, importEta } from './onboarding/importCopy'

/**
 * The slim line on Home while an import's history comes in, and the nudge
 * once it's all in. Polls every 5 seconds only while importing. When no pass
 * holds the import (the first one ran out of time, or a tab was closed), the
 * poll starts the next one, so an open Home finishes an import on its own.
 */

const POLL_MS = 5_000
/** A continue call takes a lease of ~70 s, so asking more often than this is just noise. */
const CONTINUE_EVERY_MS = 20_000

const dismissKey = (id: string) => `import-done-dismissed-${id}`
/** A sliver of bar from the start, so the first few hundred rows don't read as stuck. */
const MIN_FILL = 0.04

/**
 * Walks to each new `target` over `ms`, so a count that arrives in 5-second
 * jumps ticks up steadily instead. Lands one poll behind, never ahead. The
 * first known value shows as is: a reload shouldn't replay the import from 0.
 */
function useGlide(target: number | null, ms: number): number {
  const reduceMotion = useReducedMotion()
  const [value, setValue] = useState(target ?? 0)
  const [known, setKnown] = useState(target !== null)
  if (!known && target !== null) {
    setKnown(true)
    setValue(target)
  }
  const latest = useRef<number | null>(target)
  useEffect(() => {
    if (target === null || reduceMotion) return
    const from = latest.current
    if (from === null) {
      latest.current = target
      return
    }
    let frame = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / ms)
      latest.current = Math.round(from + (target - from) * t)
      setValue(latest.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, ms, reduceMotion])
  return reduceMotion && target !== null ? target : value
}

/**
 * The import's status, polled every `pollMs` while it's importing. Starts the
 * next pass when none holds the import, and on arriving at done refreshes
 * everything and reports it. Home's banner and the done screen share it.
 */
export function useImportStatus(pollMs = POLL_MS): ImportStatus | undefined {
  const qc = useQueryClient()
  const { data } = useQuery<ImportStatus>({
    queryKey: ['import-status'],
    queryFn: getImportStatus,
    refetchInterval: (q) => (q.state.data?.status === 'importing' ? pollMs : false),
  })
  const lastContinue = useRef(0)
  const lastStatus = useRef<string | null>(null)

  useEffect(() => {
    if (!data || data.status === 'none') return
    if (data.status === 'importing' && !data.leased && Date.now() - lastContinue.current > CONTINUE_EVERY_MS) {
      lastContinue.current = Date.now()
      void continueImport(data.importId).catch(() => {})
    }
    // Arriving at done: everything Home shows was written under it.
    if (lastStatus.current === 'importing' && data.status !== 'importing') {
      void qc.invalidateQueries()
      if (data.status === 'done') {
        const seconds = data.startedAt && data.finishedAt ? Math.round((Date.parse(data.finishedAt) - Date.parse(data.startedAt)) / 1000) : undefined
        track('import_done', { rows: data.total, failed: data.failed, ...(seconds !== undefined ? { seconds } : {}) })
      } else {
        track('import_failed', { stage: 'backfill' })
      }
    }
    lastStatus.current = data.status
  }, [data, qc])

  return data
}

/** Whether an import's history is still being booked, from the banner's own poll. */
export function useImportInProgress(): boolean {
  const { data } = useQuery<ImportStatus>({ queryKey: ['import-status'], queryFn: getImportStatus, staleTime: POLL_MS })
  return data?.status === 'importing'
}

export function ImportBanner() {
  const qc = useQueryClient()
  const data = useImportStatus()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  // Confetti only for an arrival they watched, not a done banner they come back to.
  const [arrived, setArrived] = useState(false)
  const lastStatus = useRef<string | null>(null)
  const status = data?.status ?? null
  useEffect(() => {
    if (lastStatus.current === 'importing' && status === 'done') setArrived(true)
    lastStatus.current = status
  }, [status])
  const shown = useGlide(data && data.status !== 'none' ? data.done : null, POLL_MS)

  const importId = data && data.status !== 'none' ? data.importId : null

  // Read after mount: a preference read during render desyncs server and client markup.
  useEffect(() => {
    if (importId && readPref(dismissKey(importId))) setDismissed(importId)
  }, [importId])

  if (!data || data.status === 'none') return null

  if (data.status === 'importing') {
    return (
      <div className="import-banner" role="status">
        <div className="import-banner-text">
          <span>{bannerProgress(shown, data.total)}</span>
          <span className="import-banner-sub">{bannerSub(importEta(data.done, data.total, data.startedAt))}</span>
        </div>
        <span className="import-banner-bar" aria-hidden="true" style={{ '--import-progress': Math.max(MIN_FILL, data.total ? shown / data.total : 0) } as React.CSSProperties} />
      </div>
    )
  }

  if (data.status === 'failed') {
    return (
      <div className="import-banner is-failed" role="alert">
        <span>Some of your history didn’t make it in. Check your connection and try again.</span>
        <button
          type="button"
          className="import-banner-action"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true)
            try {
              await continueImport(data.importId, true)
              await qc.invalidateQueries({ queryKey: ['import-status'] })
            } catch {
              // The banner stays as it is; the button is there to press again.
            } finally {
              setRetrying(false)
            }
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  if (dismissed === data.importId) return null
  return (
    <div className="import-banner-wrap">
      {arrived && <Confetti />}
      <div className="import-banner is-done" role="status">
        <CheckIcon size={14} weight="bold" aria-hidden="true" className="import-banner-check" />
        <div className="import-banner-text">
          <strong>{historyDone(data.total, data.failed)}</strong>
          <span className="import-banner-sub">Want us to find your repeat payments?</span>
        </div>
        <Link className="import-banner-action" href="/account/recurring?find=all" onClick={() => writePref(dismissKey(data.importId), '1')}>
          Find them
        </Link>
        <button
          type="button"
          className="import-banner-close"
          aria-label="Dismiss"
          onClick={() => {
            writePref(dismissKey(data.importId), '1')
            setDismissed(data.importId)
          }}
        >
          <XIcon size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
