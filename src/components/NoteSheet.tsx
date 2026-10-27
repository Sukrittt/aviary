'use client'

import { useId, useState, type MouseEvent } from 'react'
import { AmountSheet } from './AmountSheet'
import { CountedTextarea } from './CountedTextarea'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useSpaces } from '../hooks/useSpaces'
import { useUpdateCategory } from '../hooks/useCategories'
import { splitEmoji } from '../lib/emoji'
import { todayIST } from '../lib/date'
import { dayLabel, goalFit, parseNote, toggleLine, type Segment } from '../lib/noteRender'
import type { CategoryRow } from '../types'

export const NOTE_MAX = 2000
const SAVE_FAILED = "Couldn't save. Check your connection and try again."

function placeholderFor(row?: CategoryRow): string {
  if (row?.goal || /sav|goal|fund|invest/i.test(row?.group ?? '')) return "What's it for? Break it down"
  if (/bill|utilit|rent|emi|loan|insur|subscri/i.test(`${row?.group ?? ''} ${row?.name ?? ''}`)) return 'Due date, account no., autopay?'
  return 'What this covers, reminders, anything useful'
}

function Piece({ s }: { s: Segment }) {
  switch (s.kind) {
    case 'date':
      return <span className={`note-chip ${s.days < 0 ? 'is-past' : ''}`} title={dayLabel(s.days)}>{s.text} <span className="note-chip-when">· {dayLabel(s.days)}</span></span>
    case 'amount':
      return <span className="note-amount">{s.text}</span>
    case 'url':
      return <a className="note-link" href={s.href} target="_blank" rel="noopener noreferrer">{s.text}</a>
    case 'phone':
      return <a className="note-link" href={s.href}>{s.text}</a>
    default:
      return <>{s.text}</>
  }
}

/** Read and write an envelope's note. Opens rendered when there's one, as a text box when there isn't. */
export function NoteSheet({ row, onClose }: { row: CategoryRow; onClose: () => void }) {
  const { readOnly } = useSpaces()
  const { formatCurrency, formatCompact } = useCurrency()
  const update = useUpdateCategory()
  const save = useButtonPhase()
  const id = useId()
  const [note, setNote] = useState(row.note ?? '')
  const [editing, setEditing] = useState(!row.note && !readOnly)
  const [draft, setDraft] = useState(row.note ?? '')
  const [error, setError] = useState('')
  const [ticking, setTicking] = useState(false)
  const busy = save.saving || save.success
  const today = todayIST()
  const fit = row.goal ? goalFit(note, row.goal.amount, today) : null

  async function write() {
    if (busy) return
    save.start()
    setError('')
    try {
      // Blank clears it: the server trims and stores null.
      await update.mutateAsync({ name: row.name, updates: { note: draft.trim() || null } })
      save.succeed(onClose)
    } catch {
      save.fail()
      setError(SAVE_FAILED)
    }
  }

  async function tick(index: number) {
    if (ticking || readOnly) return
    const before = note
    const next = toggleLine(note, index)
    setNote(next)
    setDraft(next)
    setTicking(true)
    setError('')
    try {
      await update.mutateAsync({ name: row.name, updates: { note: next } })
    } catch {
      setNote(before)
      setDraft(before)
      setError(SAVE_FAILED)
    } finally {
      setTicking(false)
    }
  }

  // A click on the note's text edits it; its checkboxes and links do their own thing.
  function onReadClick(e: MouseEvent) {
    if (readOnly || (e.target as HTMLElement).closest('a, input, label')) return
    setEditing(true)
  }

  const name = splitEmoji(row.name).text
  return (
    <AmountSheet
      title={`Note for ${name}`}
      onClose={onClose}
      busy={busy}
      footer={
        <div className="goal-sheet-actions">
          {editing ? (
            <>
              <button type="button" className="account-pill-btn" onClick={onClose} disabled={busy}>Cancel</button>
              <SuccessButton type="button" baseClass="erd-log-submit" saving={save.saving} success={save.success} successLabel="Saved" disabled={busy || draft.trim() === (row.note ?? '')} onClick={() => void write()}>
                Save note
              </SuccessButton>
            </>
          ) : readOnly ? (
            <button type="button" className="account-pill-btn" onClick={onClose}>Close</button>
          ) : (
            <button type="button" className="erd-log-submit" onClick={() => setEditing(true)}>Edit note</button>
          )}
        </div>
      }
    >
      {editing ? (
        <section className="erd-sub-section">
          <label className="erd-log-label" htmlFor={id}>Note</label>
          <CountedTextarea id={id} className="erd-log-input note-textarea" maxLength={NOTE_MAX} rows={7} autoFocus placeholder={placeholderFor(row)} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <p className="erd-sub-hint">Only people in this budget can see it.</p>
        </section>
      ) : (
        <div className={`note-read ${readOnly ? '' : 'is-editable'}`} onClick={onReadClick}>
          {!note && <p className="erd-sub-hint">No note yet.</p>}
          {parseNote(note, today).map((line, i) =>
            line.check === undefined ? (
              <p key={i} className="note-line">{line.segments.map((s, j) => <Piece key={j} s={s} />)}{!line.segments.length && ' '}</p>
            ) : (
              <label key={i} className={`note-line note-check ${line.check ? 'is-done' : ''}`}>
                <input type="checkbox" checked={line.check} disabled={readOnly || ticking} onChange={() => void tick(i)} />
                <span>{line.segments.map((s, j) => <Piece key={j} s={s} />)}</span>
              </label>
            ),
          )}
          {fit && (
            <p className={`note-sum ${fit.diff === 0 ? 'is-match' : ''}`}>
              = {formatCurrency(fit.sum)} · {fit.diff === 0 ? 'matches your goal' : `${formatCompact(Math.abs(fit.diff))} ${fit.diff < 0 ? 'short of' : 'over'} your goal`}
            </p>
          )}
        </div>
      )}
      {error && <p role="alert" className="erd-log-error">{error}</p>}
    </AmountSheet>
  )
}
