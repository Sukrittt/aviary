'use client'

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { LIST_SPRING } from '@/src/components/landing/mobile/kit'
import { LoadingCaption } from '@/src/components/LoadingCaption'
import { analyticsReady, isAnalyticsEnabled, setAnalyticsEnabled, track } from '@/src/lib/analytics'

interface Summary {
  transactionCount: number
  envelopeCount: number
}

interface ExportRow {
  id: string
  status: 'pending' | 'ready' | 'failed'
  created_at: string
  blob_url: string | null
}

interface ExportsResponse {
  exports: ExportRow[]
  usedThisMonth: number
  limit: number
  canExport: boolean
  /** The one final export a lapsed account gets after access ends. */
  exitExport: boolean
  accessExpired: boolean
}

async function fetchExports(): Promise<ExportsResponse | null> {
  const res = await fetch('/api/data/exports')
  if (!res.ok) return null
  return res.json()
}

export default function DataPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState<number | null>(null)
  const [exports, setExports] = useState<ExportsResponse | null>(null)
  const [exportsLoading, setExportsLoading] = useState(true)
  const [exportsLoadError, setExportsLoadError] = useState(false)
  const [starting, setStarting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  // Null until mounted: the opt-out lives in this browser's storage, which the
  // server render can't see.
  const [analyticsOn, setAnalyticsOn] = useState<boolean | null>(null)

  useEffect(() => {
    // PostHog loads lazily, so ask only once it's there.
    void analyticsReady().then(() => setAnalyticsOn(isAnalyticsEnabled()))
  }, [])

  function toggleAnalytics() {
    const next = !analyticsOn
    setAnalyticsEnabled(next)
    setAnalyticsOn(next)
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/data/summary')
      if (!res.ok) return
      setSummary(await res.json())
    })()
  }, [])

  async function refreshExports(initial = false) {
    if (initial) setExportsLoading(true)
    try {
      const next = await fetchExports()
      if (next) {
        setExports(next)
        setExportsLoadError(false)
      } else {
        setExportsLoadError(true)
      }
    } catch {
      setExportsLoadError(true)
    } finally {
      if (initial) setExportsLoading(false)
    }
  }

  useEffect(() => {
    void refreshExports(true)
  }, [])

  // Poll only while something's still building — the push notification is
  // the real "it's done" signal, this just catches the UI up if the user is
  // still looking at the screen.
  useEffect(() => {
    if (!exports?.exports.some((e) => e.status === 'pending')) return
    const id = setInterval(() => void refreshExports(), 4000)
    return () => clearInterval(id)
  }, [exports])

  async function startExport() {
    setStarting(true)
    setExportError(null)
    const res = await fetch('/api/data/export', { method: 'POST' })
    setStarting(false)
    if (res.status === 429) {
      // The atLimit banner below already covers this once the refetch lands.
      void refreshExports()
      return
    }
    if (!res.ok) {
      setExportError('Could not start export. Try again.')
      return
    }
    track('data_exported')
    void refreshExports()
  }

  async function clearTransactions() {
    setClearing(true)
    const res = await fetch('/api/data/clear-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    setClearing(false)
    setConfirmingClear(false)
    if (res.ok) {
      const data = await res.json()
      setCleared(data.deleted ?? 0)
      setSummary((s) => (s ? { ...s, transactionCount: 0 } : s))
    }
  }

  // The server decides, not the count: the cap can be spent and an export
  // still be allowed, so an expired account can take its data with it.
  const atLimit = exports ? !exports.canExport : false
  const pending = exports?.exports.some((e) => e.status === 'pending') ?? false

  return (
    <>
      <div className="account-export-row">
        <div className="account-export-title">Export</div>
        <div className="account-export-meta">
          {summary ? `${summary.transactionCount} transactions · ${summary.envelopeCount} envelopes` : '—'}
          {exports
            ? ` · ${Math.min(exports.usedThisMonth, exports.limit)} of ${exports.limit} exports used this month`
            : ''}
        </div>
        <div className="account-export-actions">
          <button type="button" onClick={startExport} disabled={starting || pending || atLimit}>
            {pending ? 'Building…' : starting ? 'Starting…' : 'Export'}
          </button>
        </div>
        {pending ? <LoadingCaption feature="exportBuilding" placement="inline" /> : null}
        {exportError ? <div className="account-confirm-copy">{exportError}</div> : null}
        {atLimit && !exports?.accessExpired && !exportError ? (
          <div className="account-confirm-copy">
            You&apos;ve used all {exports?.limit} exports this month. Resets next month.
          </div>
        ) : null}
        {exports?.exitExport && !exportError ? (
          <div className="account-confirm-copy">
            Your subscription is inactive. This is your final export, so it isn&apos;t counted against the monthly limit.
          </div>
        ) : null}
        {exportsLoading ? (
          <LoadingCaption feature="exports" placement="inline" />
        ) : exportsLoadError && !exports ? (
          <div className="account-confirm-copy" role="alert">Couldn&apos;t load your exports.</div>
        ) : exports && exports.exports.length > 0 ? (
          <ul className="account-export-list">
            {exports.exports.map((e) => (
              <motion.li
                key={e.id}
                layout="position"
                transition={LIST_SPRING}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15 } }}
              >
                {e.status === 'ready' && e.blob_url ? (
                  <a href={e.blob_url} download>
                    {e.created_at}
                  </a>
                ) : (
                  <motion.span
                    key={e.status}
                    initial={{ opacity: 0 }}
                    // Mobile's pending pulse: 1 to 0.4 and back, 700ms each way.
                    animate={
                      e.status === 'pending'
                        ? { opacity: [1, 0.4], transition: { duration: 0.7, repeat: Infinity, repeatType: 'reverse' } }
                        : { opacity: 1, transition: { duration: 0.15 } }
                    }
                  >
                    {e.created_at} — {e.status}
                  </motion.span>
                )}
              </motion.li>
            ))}
          </ul>
        ) : null}
      </div>

      {analyticsOn !== null ? (
        <div className="account-export-row">
          <div className="account-export-title">Share usage analytics</div>
          <div className="account-export-meta">
            {analyticsOn
              ? 'Sends which features you use. Never amounts or what you bought.'
              : "Off. Nothing about how you use Aviary leaves this browser."}
          </div>
          <div className="account-export-actions">
            <button type="button" onClick={toggleAnalytics} aria-pressed={analyticsOn}>
              {analyticsOn ? 'Turn off' : 'Turn on'}
            </button>
          </div>
        </div>
      ) : null}

      <button type="button" className="account-clear-btn" onClick={() => setConfirmingClear(true)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden="true">🧹</span>
          <span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>Clear all transactions</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--erd-text2)', marginTop: 2 }}>
              Keeps envelopes, wipes history
            </span>
          </span>
        </span>
      </button>

      {confirmingClear ? (
        <div className="account-confirm-panel">
          <div className="account-confirm-copy">
            This deletes every transaction. Envelopes and budgets stay. There is no undo.
          </div>
          <div className="account-confirm-actions">
            <button type="button" className="account-confirm-cancel" onClick={() => setConfirmingClear(false)} disabled={clearing}>
              Cancel
            </button>
            <button type="button" className="account-danger-btn" onClick={clearTransactions} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Clear permanently'}
            </button>
          </div>
        </div>
      ) : null}

      {cleared !== null ? (
        <div className="account-confirm-copy">Cleared {cleared} transaction(s).</div>
      ) : null}
    </>
  )
}
