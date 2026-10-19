'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { CaretDownIcon, CheckIcon, UploadSimpleIcon } from '@/src/components/icons'
import { CategoryIcon } from '@/src/components/CategoryIcon'
import { CategoryPicker } from '@/src/components/CategoryPicker'
import { Confetti } from '@/src/components/onboarding/Confetti'
import { Scrim, Sheet } from '@/src/components/MotionSheet'
import { LoadingCaption } from '@/src/components/LoadingCaption'
import { SuccessButton, useButtonPhase } from '@/src/components/SuccessButton'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useCategories, useCategoryStyle } from '@/src/hooks/useCategories'
import { useAddExpense } from '@/src/hooks/useExpenses'
import { formatDateShort } from '@/src/lib/format'
import { splitEmoji } from '@/src/lib/emoji'
import { track } from '@/src/lib/analytics'
import { readStatement, StatementFailure, type StatementItem, type StatementProposal } from '@/src/api/statement'
import { base64Of, dataUrlFromFile } from '../scan-bill/image'
import { byDay, caughtUp, creditsLine, daySpan, statementExpense, type CaughtUp } from './gap'

const MAX_SCREENSHOTS = 5
/** Categories the done screen lists before folding the rest into "and N more". */
const DONE_CATEGORIES = 4
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
 * same file twice adds nothing. The review reads like the Activity it's
 * about to become, and it ends on "You're caught up": what got filled in
 * and where the money went, so the last thing you see is that it worked.
 */
export function StatementModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review' | 'error' | 'done'>('pick')
  const [proposal, setProposal] = useState<StatementProposal | null>(null)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [error, setError] = useState('')
  const [logError, setLogError] = useState('')
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState<CaughtUp | null>(null)
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
    setProgress(0)
    // One at a time, oldest first, so Activity keeps the statement's order.
    for (const [n, item] of toLog.entries()) {
      setProgress(n + 1)
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
    setDone(caughtUp(toLog.map((i) => ({ amount: i.amount, date: i.date, category: rows[i.id].category }))))
    button.succeed(() => setPhase('done'))
  }

  const busy = button.saving || button.success
  // Past the picker there's a read to lose, so a stray click on the scrim doesn't close it. The ✕ still does.
  const dismissable = phase === 'pick' || phase === 'error' || phase === 'done'

  return (
    <Scrim className="erd-modal-overlay" onClick={dismissable ? onClose : undefined}>
      <Sheet
        className={`erd-modal-card scan-modal ${phase === 'review' ? 'is-wide' : ''} ${phase === 'done' ? 'gap-done-card' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add from statement or screenshot"
      >
        {phase !== 'done' && (
          <div className="erd-modal-head">
            <h3>{phase === 'review' ? 'Check these, then log' : 'Add from statement or screenshot'}</h3>
            <button type="button" className="erd-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>
              ✕
            </button>
          </div>
        )}

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
            progress={progress}
            error={logError}
            onChange={(ids, patch) => setRows((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, { ...prev[id], ...patch }])) }))}
            onLog={log}
          />
        )}

        {phase === 'done' && done && <StatementDone done={done} onClose={onClose} />}
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

function StatementReview({ proposal, rows, busy, saving, success, progress, error, onChange, onLog }: {
  proposal: StatementProposal
  rows: Record<string, RowState>
  busy: boolean
  saving: boolean
  success: boolean
  progress: number
  error: string
  onChange: (ids: string[], patch: Partial<RowState>) => void
  onLog: (items: StatementItem[]) => void
}) {
  const { formatMoney } = useCurrency()
  const categories = useCategories().data ?? []
  const styleOf = useCategoryStyle()
  const [picking, setPicking] = useState<string | null>(null)
  const items = proposal.items
  const checked = items.filter((i) => rows[i.id]?.checked)
  const missing = checked.filter((i) => !rows[i.id].category).length
  const total = checked.reduce((sum, i) => sum + i.amount, 0)
  const credits = creditsLine(proposal.credits)
  const dates = items.map((i) => i.date).sort()
  const allOn = checked.length === items.length
  const iconOf = (name: string) => categories.find((c) => c.name === name)

  return (
    <div className="gap-review">
      <div className="gap-review-head">
        <span>
          {items.length} {items.length === 1 ? 'payment' : 'payments'} · {daySpan(dates[0], dates[dates.length - 1])}
        </span>
        <button type="button" className="gap-tick-all" disabled={busy} onClick={() => onChange(items.map((i) => i.id), { checked: !allOn })}>
          {allOn ? 'Untick all' : 'Tick all'}
        </button>
      </div>
      <div className="gap-days">
        {byDay(items).map((day) => (
          <section key={day.date} className="gap-day">
            <header className="gap-day-head">
              <span>{formatDateShort(day.date)}</span>
              <span>{formatMoney(day.rows.reduce((sum, i) => sum + i.amount, 0))}</span>
            </header>
            {day.rows.map((item) => {
              const row = rows[item.id]
              const category = iconOf(row.category)
              const open = picking === item.id
              return (
                <div key={item.id} className="gap-row-wrap">
                  <div className={`gap-row${row.checked ? ' is-selected' : ' is-off'}`}>
                    <button
                      type="button"
                      role="checkbox"
                      className="gap-row-pick"
                      aria-checked={row.checked}
                      aria-label={`Add ${item.item}, ${formatMoney(item.amount)}`}
                      disabled={busy}
                      onClick={() => onChange([item.id], { checked: !row.checked })}
                    />
                    <span className="txn-check-slot" aria-hidden="true">
                      <span className={`txn-check${row.checked ? ' is-on' : ''}`}>
                        {row.checked && (
                          <svg viewBox="0 0 24 24" fill="none">
                            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
                          </svg>
                        )}
                      </span>
                    </span>
                    <span className="gap-row-icon" style={row.category ? styleOf(row.category) : undefined} aria-hidden="true">
                      <CategoryIcon name={row.category} icon={category?.icon} group={category?.group} />
                    </span>
                    <span className="gap-row-main">
                      <span className="gap-row-name">{item.item}</span>
                      <span className="gap-row-meta">
                        <button
                          type="button"
                          className={`gap-row-category${row.checked && !row.category ? ' is-missing' : ''}`}
                          aria-expanded={open}
                          aria-label={row.category ? `Category for ${item.item}: ${splitEmoji(row.category).text}. Change it` : `Pick a category for ${item.item}`}
                          disabled={busy}
                          onClick={() => setPicking(open ? null : item.id)}
                        >
                          {row.category ? splitEmoji(row.category).text : 'Pick a category'}
                          <CaretDownIcon size={11} weight="bold" aria-hidden="true" />
                        </button>
                        {item.suggestSkip && <span className="gap-row-hint">{SKIP_LABEL[item.suggestSkip]}</span>}
                      </span>
                    </span>
                    <span className="gap-row-amount">{formatMoney(item.amount)}</span>
                  </div>
                  {open && (
                    <div className="gap-row-picker">
                      <CategoryPicker
                        value={row.category}
                        onChange={(c) => {
                          onChange([item.id], { category: c, checked: true })
                          setPicking(null)
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        ))}
      </div>
      {credits && <p className="gap-note">{credits}</p>}
      {missing > 0 && <p className="gap-note is-warn">Pick a category for the ticked rows to log them.</p>}
      {error && <p className="erd-log-error" role="alert">{error}</p>}
      <SuccessButton
        type="button"
        baseClass="erd-log-submit"
        saving={saving}
        success={success}
        savingLabel={checked.length > 1 ? `Logging ${progress} of ${checked.length}…` : 'Logging…'}
        successLabel={`Logged ${checked.length}`}
        disabled={busy || checked.length === 0 || missing > 0}
        onClick={() => onLog(checked)}
      >
        {checked.length ? `Log ${checked.length} · ${formatMoney(total)}` : 'Tick what to add'}
      </SuccessButton>
    </div>
  )
}

/** The end of the flow: what got filled in and where it went. Calm, a little confetti, then out. */
function StatementDone({ done, onClose }: { done: CaughtUp; onClose: () => void }) {
  const { formatMoney } = useCurrency()
  const categories = useCategories().data ?? []
  const styleOf = useCategoryStyle()
  // "and 1 more" would take the room the row itself needs, so fold only when it saves two or more.
  const shown = done.categories.length > DONE_CATEGORIES + 1 ? done.categories.slice(0, DONE_CATEGORIES) : done.categories
  const more = done.categories.length - shown.length

  return (
    <div className="gap-done" role="status">
      <Confetti />
      <span className="gap-done-badge" aria-hidden="true">
        <CheckIcon size={28} weight="bold" />
      </span>
      <h3 className="gap-done-title">You&apos;re caught up.</h3>
      <p className="gap-done-copy">
        {daySpan(done.from, done.to)} is filled in. Your categories now match what you actually spent.
      </p>
      <div className="gap-done-summary">
        <div className="gap-done-total">
          <span>{done.count} {done.count === 1 ? 'payment' : 'payments'} added</span>
          <strong>{formatMoney(done.total)}</strong>
        </div>
        <ul className="gap-done-list">
          {shown.map((c) => {
            const row = categories.find((r) => r.name === c.name)
            return (
              <li key={c.name}>
                <span className="gap-row-icon" style={styleOf(c.name)} aria-hidden="true">
                  <CategoryIcon name={c.name} icon={row?.icon} group={row?.group} />
                </span>
                <span className="gap-done-name">{splitEmoji(c.name).text}</span>
                <span className="gap-row-amount">{formatMoney(c.total)}</span>
              </li>
            )
          })}
        </ul>
        {more > 0 && <p className="gap-done-more">and {more} more {more === 1 ? 'category' : 'categories'}</p>}
      </div>
      <p className="gap-note">Upload the same file again and nothing doubles up.</p>
      <div className="gap-done-actions">
        <Link href="/expense/transactions" className="account-pill-btn" onClick={onClose}>
          See them in Activity
        </Link>
        <button type="button" className="account-pill-btn account-pill-btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
