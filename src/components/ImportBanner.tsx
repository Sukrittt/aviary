'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { XIcon } from '@/src/components/icons'
import { continueImport, getImportStatus, type ImportStatus } from '@/src/api/imports'
import { readPref, writePref } from '@/src/lib/localPref'
import { track } from '@/src/lib/analytics'
import { bannerProgress } from './onboarding/importCopy'

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

export function ImportBanner() {
  const qc = useQueryClient()
  const { data } = useQuery<ImportStatus>({
    queryKey: ['import-status'],
    queryFn: getImportStatus,
    refetchInterval: (q) => (q.state.data?.status === 'importing' ? POLL_MS : false),
  })
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const lastContinue = useRef(0)
  const lastStatus = useRef<string | null>(null)

  const importId = data && data.status !== 'none' ? data.importId : null

  // Read after mount: a preference read during render desyncs server and client markup.
  useEffect(() => {
    if (importId && readPref(dismissKey(importId))) setDismissed(importId)
  }, [importId])

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

  if (!data || data.status === 'none') return null

  if (data.status === 'importing') {
    return (
      <div className="import-banner" role="status">
        <span>{bannerProgress(data.done, data.total)}</span>
        <span className="import-banner-bar" aria-hidden="true" style={{ '--import-progress': data.total ? data.done / data.total : 0 } as React.CSSProperties} />
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
    <div className="import-banner is-done" role="status">
      <span>All in. Want us to find your repeat payments?</span>
      <Link className="import-banner-action" href="/account/recurring" onClick={() => writePref(dismissKey(data.importId), '1')}>
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
  )
}
