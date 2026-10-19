'use client'

import { useRef, useState } from 'react'
import { UploadSimpleIcon } from '@/src/components/icons'
import { Scrim, Sheet } from '@/src/components/MotionSheet'
import { LoadingCaption } from '@/src/components/LoadingCaption'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useCategories } from '@/src/hooks/useCategories'
import { useAddExpense } from '@/src/hooks/useExpenses'
import { formatDateShort } from '@/src/lib/format'
import { track } from '@/src/lib/analytics'
import { readStatement, StatementFailure, type StatementItem, type StatementProposal } from '@/src/api/statement'
import { base64Of, dataUrlFromFile } from '../scan-bill/image'
import { creditsLine, statementExpense } from './gap'

const MAX_SCREENSHOTS = 5
/** Five screenshots have to fit one request, so each goes smaller than a single bill scan. */
const SCREENSHOT_ENCODING = { maxEdge: 1600, quality: 0.6 }
const STATEMENT_FILE = /\.(csv|tsv|txt|xlsx|pdf)$/i
const UNREADABLE = "Couldn't read that one. Try a CSV or Excel statement, or a screenshot of your payments."

const SKIP_LABEL = { logged: 'Looks logged already', before_last: 'Before your last log' } as const

type RowState = { checked: boolean; category: string }

/**
 * "Add from statement or screenshot": the days you didn't log, read back
 * from your own UPI or bank history. Same propose-then-confirm as chat
 * capture: nothing is logged until you tick the rows and tap Log. Each row
 * logs through POST /api/expenses with a hashed client_id, so uploading the
 * same file twice adds nothing.
 */
export function StatementModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review' | 'error'>('pick')
  const [proposal, setProposal] = useState<StatementProposal | null>(null)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [error, setError] = useState('')
  const [logError, setLogError] = useState('')
  const button = useButtonPhase()
  const addExpense = useAddExpense()
  // Rows a partly failed attempt already logged; a retry skips them (their client_ids would dedupe anyway).
  const logged = useRef(new Set<string>())

  function fail(message: string) {
    setError(message)
    setPhase('error')
  }

  async function read(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    const doc = files.find((f) => !f.type.startsWith('image/') && STATEMENT_FILE.test(f.name))
    if (!doc && images.length === 0) return fail('Pick screenshots, or a CSV, Excel or PDF statement.')
    if (!doc && images.length > MAX_SCREENSHOTS) return fail(`Up to ${MAX_SCREENSHOTS} screenshots at a time. Pick the ones that cover the days you missed.`)
    setPhase('reading')
    try {
      const result = doc
        ? await readStatement({ file: doc })
        : await readStatement({
            images: await Promise.all(images.map(async (f) => ({ data: base64Of(await dataUrlFromFile(f, SCREENSHOT_ENCODING)), mimeType: 'image/jpeg' }))),
          })
      if (result.items.length === 0) return fail(creditsLine(result.credits) ? "Only money coming in there, so there's nothing to add." : UNREADABLE)
      setProposal(result)
      setRows(Object.fromEntries(result.items.map((i) => [i.id, { checked: !i.suggestSkip, category: i.category }])))
      setPhase('review')
      track('statement_read', { kind: doc ? 'file' : 'screenshots', rows: result.items.length, credits: result.credits })
    } catch (err) {
      fail(err instanceof StatementFailure ? err.message : UNREADABLE)
    }
  }

  async function log(toLog: StatementItem[]) {
    if (!proposal) return
    button.start()
    setLogError('')
    let failed = 0
    // One at a time, oldest first, so Activity keeps the statement's order.
    for (const item of toLog) {
      if (logged.current.has(item.id)) continue
      try {
        await addExpense.mutateAsync(statementExpense(item, rows[item.id].category))
        logged.current.add(item.id)
      } catch {
        failed++
      }
    }
    if (failed > 0) {
      button.fail()
      setLogError(`Couldn't log ${failed === toLog.length ? 'these' : failed}. Check your connection and try again.`)
      return
    }
    track('statement_logged', { rows: toLog.length, unchecked: proposal.items.length - toLog.length })
    button.succeed(onClose)
  }

  const busy = button.saving || button.success
  // Past the picker there's a read to lose, so a stray click on the scrim doesn't close it. The ✕ still does.
  const dismissable = phase === 'pick' || phase === 'error'

  return (
    <Scrim className="erd-modal-overlay" onClick={dismissable ? onClose : undefined}>
      <Sheet
        className={`erd-modal-card scan-modal ${phase === 'review' ? 'is-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add from statement or screenshot"
      >
        <div className="erd-modal-head">
          <h3>{phase === 'review' ? 'Check these, then log' : 'Add from statement or screenshot'}</h3>
          <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </div>

        {phase === 'pick' && <StatementPick onFiles={read} />}

        {phase === 'reading' && (
          <div className="scan-center">
            <LoadingCaption feature="readStatement" />
          </div>
        )}

        {phase === 'error' && (
          <div className="scan-center">
            <p className="scan-error-copy">{error}</p>
            <div className="scan-actions-row">
              <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={() => setPhase('pick')}>
                Try another
              </button>
            </div>
          </div>
        )}

        {phase === 'review' && proposal && (
          <StatementReview
            proposal={proposal}
            rows={rows}
            busy={busy}
            saving={button.saving}
            success={button.success}
            error={logError}
            onChange={(id, patch) => setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))}
            onLog={log}
          />
        )}
      </Sheet>
    </Scrim>
  )
}

/** A drop zone that takes up to five screenshots, or one statement file. */
function StatementPick({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={`scan-drop ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <UploadSimpleIcon className="scan-drop-icon" size={34} aria-hidden="true" />
      <p className="scan-drop-title">Drop screenshots or a statement here</p>
      <p className="scan-drop-copy">Your UPI or bank app already has the days you missed. We&apos;ll read the payments, you pick what to add.</p>
      <div className="scan-actions-row">
        <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={() => inputRef.current?.click()}>
          Choose files
        </button>
      </div>
      <p className="scan-drop-formats">Up to 5 screenshots · CSV, Excel or PDF</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.csv,.xlsx,.pdf,text/csv,application/pdf"
        hidden
        aria-label="Statement or screenshots"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </div>
  )
}

function StatementReview({ proposal, rows, busy, saving, success, error, onChange, onLog }: {
  proposal: StatementProposal
  rows: Record<string, RowState>
  busy: boolean
  saving: boolean
  success: boolean
  error: string
  onChange: (id: string, patch: Partial<RowState>) => void
  onLog: (items: StatementItem[]) => void
}) {
  const { formatMoney } = useCurrency()
  const categories = useCategories().data ?? []
  const checked = proposal.items.filter((i) => rows[i.id]?.checked)
  const missing = checked.filter((i) => !rows[i.id].category).length
  const total = checked.reduce((sum, i) => sum + i.amount, 0)
  const credits = creditsLine(proposal.credits)

  return (
    <div className="gap-review">
      <ul className="gap-rows">
        {proposal.items.map((item) => {
          const row = rows[item.id]
          return (
            <li key={item.id} className={`gap-row ${row.checked ? '' : 'is-off'}`}>
              <input
                type="checkbox"
                checked={row.checked}
                disabled={busy}
                onChange={(e) => onChange(item.id, { checked: e.target.checked })}
                aria-label={`Add ${item.item}, ${formatMoney(item.amount)}`}
              />
              <div className="gap-row-main">
                <span className="gap-row-name">{item.item}</span>
                <span className="gap-row-meta">
                  {formatDateShort(item.date)}
                  {item.suggestSkip && ` · ${SKIP_LABEL[item.suggestSkip]}`}
                </span>
              </div>
              <select
                className={`gap-row-category ${row.checked && !row.category ? 'is-missing' : ''}`}
                value={row.category}
                disabled={busy}
                onChange={(e) => onChange(item.id, { category: e.target.value })}
                aria-label={`Category for ${item.item}`}
              >
                <option value="">Pick a category</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <span className="gap-row-amount">{formatMoney(item.amount)}</span>
            </li>
          )
        })}
      </ul>
      {credits && <p className="gap-note">{credits}</p>}
      {missing > 0 && <p className="gap-note is-warn">Pick a category for the ticked rows to log them.</p>}
      {error && <p className="erd-log-error" role="alert">{error}</p>}
      <SuccessButton
        type="button"
        baseClass="erd-log-submit"
        saving={saving}
        success={success}
        savingLabel="Logging…"
        successLabel={`Logged ${checked.length}`}
        disabled={busy || checked.length === 0 || missing > 0}
        onClick={() => onLog(checked)}
      >
        {checked.length ? `Log ${checked.length} · ${formatMoney(total)}` : 'Tick what to add'}
      </SuccessButton>
    </div>
  )
}
