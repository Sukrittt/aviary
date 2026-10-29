'use client'

import { useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { AmountSheet } from './AmountSheet'
import { CountedTextarea } from './CountedTextarea'
import { CalendarBlankIcon, CheckSquareIcon } from '@/src/components/icons'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { useCurrency } from '@/src/context/CurrencyContext'
import { useSpaces } from '../hooks/useSpaces'
import { useUpdateCategory } from '../hooks/useCategories'
import { getCategories } from '../api/categories'
import { HttpError } from '../api/client'
import { splitEmoji } from '../lib/emoji'
import { todayIST } from '../lib/date'
import { addTodo, dayLabel, insertAt, noteDate, goalFit, parseNote, toggleLine, type Segment } from '../lib/noteRender'
import type { CategoryRow } from '../types'

export const NOTE_MAX = 2000
const SAVE_FAILED = "Couldn't save. Check your connection and try again."
const CHANGED = 'This note changed on another device.'

/** The note as it's saved now, after a write was refused for being made from an older copy. Null if that can't be read either. */
async function latestNote(e: unknown, name: string): Promise<string | null> {
  if (!(e instanceof HttpError) || e.status !== 409) return null
  try {
    return (await getCategories()).find((c) => c.name === name)?.note ?? ''
  } catch {
    return null
  }
}

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
  const { formatCurrency, formatCompact, currencySymbol } = useCurrency()
  const update = useUpdateCategory()
  const save = useButtonPhase()
  const id = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  const caretAfter = useRef<number | null>(null)
  const datePick = useRef<HTMLInputElement>(null)
  // The last copy the server confirmed: every write says it was made from this one.
  const [note, setNote] = useState(row.note ?? '')
  // Derived, so a budget that turns out read-only once spaces load closes the editor.
  const [wantsEdit, setEditing] = useState(!row.note)
  const editing = wantsEdit && !readOnly
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
      await update.mutateAsync({ name: row.name, updates: { note: draft.trim() || null, prevNote: note } })
      save.succeed(onClose)
    } catch (e) {
      save.fail()
      // Their version becomes the base, so saving again replaces it on purpose.
      const fresh = await latestNote(e, row.name)
      if (fresh !== null) setNote(fresh)
      setError(fresh === null ? SAVE_FAILED : `${CHANGED} Save again to replace it.`)
    }
  }

  async function tick(index: number) {
    if (ticking || readOnly) return
    const before = note
    // Trimmed the way the server stores it, so the next tick's base matches.
    const next = toggleLine(note, index).trim()
    setNote(next)
    setDraft(next)
    setTicking(true)
    setError('')
    try {
      await update.mutateAsync({ name: row.name, updates: { note: next, prevNote: before } })
    } catch (e) {
      const fresh = await latestNote(e, row.name)
      setNote(fresh ?? before)
      setDraft(fresh ?? before)
      setError(fresh === null ? SAVE_FAILED : `${CHANGED} Here's the latest.`)
    } finally {
      setTicking(false)
    }
  }

  // The chips show what a note understands by writing it: the syntax is right there in the box.
  const caret = () => box.current?.selectionStart ?? draft.length
  function apply(next: { text: string; caret: number } | null) {
    if (!next) return
    caretAfter.current = next.caret
    setDraft(next.text)
  }
  function pickDate() {
    const input = datePick.current
    if (!input) return
    // No showPicker (older Safari): nothing to open, so the chip does nothing rather than focus an invisible field.
    try {
      input.showPicker()
    } catch {}
  }
  // Same commit as the new text, so a keystroke right after the tap lands at the caret, not where it was.
  useLayoutEffect(() => {
    if (caretAfter.current === null) return
    box.current?.focus()
    box.current?.setSelectionRange(caretAfter.current, caretAfter.current)
    caretAfter.current = null
  }, [draft])

  // A click on the note's text edits it; its checkboxes and links do their own thing.
  function onReadClick(e: MouseEvent) {
    // Not mid-tick: the tick writes the whole note, and an edit saved after it would race it.
    if (readOnly || ticking || (e.target as HTMLElement).closest('a, input, label')) return
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
              <SuccessButton type="button" baseClass="erd-log-submit" saving={save.saving} success={save.success} successLabel="Saved" disabled={busy || draft.trim() === note} onClick={() => void write()}>
                Save note
              </SuccessButton>
            </>
          ) : readOnly ? (
            <button type="button" className="account-pill-btn" onClick={onClose}>Close</button>
          ) : (
            <button type="button" className="erd-log-submit" disabled={ticking} onClick={() => setEditing(true)}>Edit note</button>
          )}
        </div>
      }
    >
      {editing ? (
        <section className="erd-sub-section">
          <label className="erd-log-label" htmlFor={id}>Note</label>
          <CountedTextarea ref={box} id={id} className="erd-log-input note-textarea" maxLength={NOTE_MAX} rows={7} autoFocus readOnly={busy} placeholder={placeholderFor(row)} value={draft} onChange={(e) => setDraft(e.target.value)} />
          {/* mousedown kept off the chips, so the box keeps its caret and focus. */}
          <div className="note-chips" onMouseDown={(e) => e.preventDefault()}>
            <button type="button" className="erd-chip" disabled={busy} onClick={() => apply(addTodo(draft, caret(), NOTE_MAX))}>
              <CheckSquareIcon size={14} aria-hidden="true" /> Add to-do
            </button>
            <span className="note-date-chip">
              <button type="button" className="erd-chip" disabled={busy} onClick={pickDate}>
                <CalendarBlankIcon size={14} aria-hidden="true" /> Date
              </button>
              <input ref={datePick} type="date" tabIndex={-1} aria-hidden="true" className="note-date-input"
                onChange={(e) => {
                  // Focus back to the box, or the next keystrokes edit this hidden date instead of the note.
                  const picked = e.target.value
                  e.target.value = ''
                  e.target.blur()
                  if (picked) apply(insertAt(draft, caret(), noteDate(picked, today), NOTE_MAX))
                }} />
            </span>
            <button type="button" className="erd-chip" disabled={busy} onClick={() => apply(insertAt(draft, caret(), currencySymbol, NOTE_MAX))}>
              <span aria-hidden="true">{currencySymbol}</span> Amount
            </button>
          </div>
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
