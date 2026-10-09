'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, MessageSquareText, PencilLine, Plus, Tag, TriangleAlert, WalletMinimal } from 'lucide-react'
import { useOptionalMoneyBrain } from '@/components/moneyBrainContext'
import { Scrim, Sheet } from './MotionSheet'
import { DatePicker, formatShort } from './DatePicker'
import { getCategoryMap } from '../api/categoryMap'
import { suggestCategoryLLM } from '../lib/autoCategory'
import { MANUAL_LOG_EVENT } from '@/src/lib/captureTip'
import { track } from '../lib/analytics'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { AddCategoryModal } from './AddCategoryModal'
import type { CategoryRow } from '../types'
import { CategoryPicker } from './CategoryPicker'
import { useCategories } from '../hooks/useCategories'
import { useAddExpense, useDeleteExpense, useRecentExpenses, useUploadExpensePhoto } from '../hooks/useExpenses'
import { unusualAmount } from '../lib/unusualAmount'
import { categoryEmoji, splitEmoji } from '../lib/emoji'
import { createThinkingGate, type ThinkingGate } from '../lib/thinkingGate'
import { AutoPickStatus } from '../features/log-expense/AutoPickStatus'
import { EMPTY } from '../lib/constants'
import { missingFields, missingFieldsMessage } from '../features/log-expense/missingFields'
import { Toast } from './Toast'
import { ExpenseAdded, PreloadExpenseAddedTick, type AddedExpense } from '../features/log-expense/ExpenseAdded'
import { useNudge, useShake } from './landing/mobile/kit'
import { ExpensePhotoMore } from './ExpensePhotoMore'
import { base64Of, dataUrlFromFile, PHOTO_ENCODING } from '../features/scan-bill/image'

interface Props {
  onClose: () => void
  onSaved: () => void
}

/** Shortest item text worth asking the model about — "T" or "Tr" can't be categorised. */
const MIN_LLM_CHARS = 3

// Model answers per item text, for the page's lifetime. '' (nothing fits) is
// cached too, so retyping or backspacing never re-asks for the same text.
const llmAnswers = new Map<string, string>()

/** Date as a local `YYYY-MM-DD` string (DatePicker's `parseISO` reads it back as a local Date). */
function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Today / Yesterday / … as an ISO date, rendered in local time. */
function offsetDateValue(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return toDateInputValue(d)
}

export function LogExpenseModal({ onClose, onSaved }: Props) {
  const { currencySymbol, formatMoney } = useCurrency()
  const brain = useOptionalMoneyBrain()

  const categoriesQ = useCategories()
  const addExpenseM = useAddExpense()
  const expensesQ = useRecentExpenses()
  const categories = useMemo(
    () => (categoriesQ.data ?? EMPTY).map((c) => c.name).filter(Boolean),
    [categoriesQ.data],
  )

  const [item, setItem] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<string>('')
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [createdCategory, setCreatedCategory] = useState<CategoryRow | null>(null)
  const [date, setDate] = useState(toDateInputValue(new Date()))
  const [showCalendar, setShowCalendar] = useState(false)
  const pickDateChipRef = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState('')
  const { saving, success, start, fail, reset } = useButtonPhase()
  const uploadPhotoM = useUploadExpensePhoto()
  const photoSeq = useRef(0)
  // Set by a successful add: the dialog swaps the form for Mobile's expense-added beats.
  const [added, setAdded] = useState<AddedExpense | null>(null)
  const deleteExpenseM = useDeleteExpense()
  const [undoError, setUndoError] = useState('')
  // Optional photo, picked behind "More": a downscaled JPEG data URL, uploaded once the expense exists.
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [photoNotice, setPhotoNotice] = useState('')
  const [categoryWords, setCategoryWords] = useState<Record<string, string>>({})
  const [categoryPickTick, setCategoryPickTick] = useState(0)
  // True while the category is one we picked, not one the user chose (the
  // Miscellaneous fallback doesn't count). Drives the "Picked for you" status.
  const [autoPicked, setAutoPicked] = useState(false)
  // What made the current pick, for ai_category_suggested on save (same as mobile).
  const suggestedBy = useRef<null | 'keyword' | 'ai'>(null)
  // "Picking…" is only shown for the slow AI fallback, and only once it's been
  // pending long enough to be worth showing (see thinkingGate.ts).
  const [suggesting, setSuggesting] = useState(false)
  const gateRef = useRef<ThinkingGate | null>(null)
  if (gateRef.current == null) gateRef.current = createThinkingGate(setSuggesting)
  // A manual choice wins for this name; editing the name starts prediction again.
  const categoryTouchedRef = useRef(false)
  const llmDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The item text the latest keystroke produced; a model reply for any other text is stale.
  const latestItemRef = useRef('')
  // No suggestion means nothing selected. Defaulting to the first category
  // silently filed items like "Travel" under whatever category came first.
  const effectiveCategory = category
  // Typo guard: an amount far above the category's usual blocks the first
  // save with a warning; the relabelled button then saves it as entered.
  const [unusualWarnedFor, setUnusualWarnedFor] = useState('')
  const parsedAmount = Math.round(Number(amount))
  const unusual = useMemo(
    () => unusualAmount(parsedAmount, effectiveCategory, expensesQ.data ?? EMPTY, date),
    [parsedAmount, effectiveCategory, expensesQ.data, date],
  )
  const warnKey = `${amount}|${effectiveCategory}`
  const warning = unusual && unusualWarnedFor === warnKey ? unusual : null
  const [unusualNudge, setUnusualNudge] = useState(0)

  const rollEmojis = useMemo(
    () => [...new Set((categoriesQ.data ?? EMPTY).map((c) => categoryEmoji(c.name, c.group)).filter(Boolean))],
    [categoriesQ.data],
  )
  const selectedRow = (categoriesQ.data ?? EMPTY).find((c) => c.name === category)
    ?? (createdCategory?.name === category ? createdCategory : undefined)
  const selectedCategory = selectedRow
    ? { emoji: categoryEmoji(selectedRow.name, selectedRow.group), name: splitEmoji(selectedRow.name).text }
    : null

  // Bumped on each blocked save; 0 means nothing is highlighted yet.
  const [nudge, setNudge] = useState(0)
  const missing = missingFields({ amount, item, category: effectiveCategory })
  const flag = (f: (typeof missing)[number]) => nudge > 0 && missing.includes(f)
  const amountNudgeRef = useNudge<HTMLDivElement>(nudge, missing.includes('amount'))
  const itemNudgeRef = useNudge<HTMLInputElement>(nudge, missing.includes('item'))
  const categoryNudgeRef = useNudge<HTMLDivElement>(nudge, missing.includes('category'))
  const [amountShakeRef, shakeAmount] = useShake<HTMLInputElement>()

  useEffect(() => {
    getCategoryMap()
      .then((map) => setCategoryWords(map.words))
      .catch(() => {})
  }, [])

  // Cancel any pending debounced LLM lookup on unmount.
  useEffect(() => {
    return () => {
      if (llmDebounceRef.current) clearTimeout(llmDebounceRef.current)
      gateRef.current?.cancel()
    }
  }, [])

  function applyLlmAnswer(value: string, llmCategory: string) {
    if (categoryTouchedRef.current || latestItemRef.current !== value) return
    if (llmCategory && categories.includes(llmCategory)) {
      suggestedBy.current = 'ai'
      setCategory(llmCategory)
      setAutoPicked(true)
      // Mirror the server's word overrides so the same words match locally, instantly, next time.
      const learned = Object.fromEntries(
        value.toLowerCase().split(/\s+/).filter((w) => w.length >= 2).map((w) => [w, llmCategory]),
      )
      setCategoryWords((words) => ({ ...words, ...learned }))
      return
    }
    const misc = categories.find((c) => c.toLowerCase().includes('miscellaneous'))
    setCategory(misc ?? '')
    setAutoPicked(false)
  }

  function handleItemChange(value: string) {
    setItem(value)
    latestItemRef.current = value
    if (llmDebounceRef.current) {
      clearTimeout(llmDebounceRef.current)
      llmDebounceRef.current = null
    }
    const gate = gateRef.current!
    gate.cancel()
    categoryTouchedRef.current = false
    setCategory('')
    setAutoPicked(false)
    suggestedBy.current = null
    const words = value.toLowerCase().split(/\s+/)
    for (const word of words) {
      const match = categoryWords[word]
      if (!match) continue
      const live = categories.includes(match)
        ? match
        : categories.find((c) => c.toLowerCase().includes(match.toLowerCase()))
      if (live) {
        gate.finish(() => {
          suggestedBy.current = 'keyword'
          setCategory(live)
          setAutoPicked(true)
        })
        return
      }
    }
    const key = value.trim().toLowerCase()
    if (key.length < MIN_LLM_CHARS) {
      gate.cancel()
      return
    }
    const known = llmAnswers.get(key)
    if (known !== undefined) {
      gate.finish(() => applyLlmAnswer(value, known))
      return
    }

    // No local match — debounce an LLM fallback lookup instead of firing per keystroke.
    llmDebounceRef.current = setTimeout(() => {
      gate.start()
      suggestCategoryLLM(value, categories).then((llmCategory) => {
        if (llmCategory !== null) llmAnswers.set(key, llmCategory)
        // A reply for text the user has since changed must not end the newer lookup's thinking.
        if (categoryTouchedRef.current || latestItemRef.current !== value) return
        gate.finish(() => applyLlmAnswer(value, llmCategory ?? ''))
      })
    }, 200)
  }

  function handleAmountChange(value: string) {
    // Numbers only: an invalid keystroke is dropped outright, with Mobile's invalid-entry shake.
    if (/[^0-9.]/.test(value)) {
      shakeAmount()
      return
    }
    setAmount(value)
  }

  function handleCategoryPick(c: string) {
    if (llmDebounceRef.current) {
      clearTimeout(llmDebounceRef.current)
      llmDebounceRef.current = null
    }
    gateRef.current?.cancel()
    setCategory(c)
    setCategoryPickTick((tick) => tick + 1)
    categoryTouchedRef.current = true
    setAutoPicked(false)
  }

  function handleDatePick(value: string) {
    setDate(value)
    setShowCalendar(false)
  }

  async function handlePhotoPick(file: File) {
    // Decoding is async: only the latest pick (or a later remove) may land.
    const seq = ++photoSeq.current
    setPhotoError('')
    try {
      const dataUrl = await dataUrlFromFile(file, PHOTO_ENCODING)
      if (seq === photoSeq.current) setPhoto(dataUrl)
    } catch {
      // createImageBitmap rejects what the browser can't decode (HEIC outside Safari, a corrupt file).
      if (seq === photoSeq.current) setPhotoError("Couldn't read that photo. Try another one.")
    }
  }

  function handlePhotoRemove() {
    photoSeq.current++
    setPhoto(null)
  }

  // The expense is already saved, so a failed upload only costs the photo, never the expense.
  async function uploadPhoto(id: string | undefined, dataUrl: string) {
    const notice = "Your expense is saved, but the photo didn't upload. Try adding it again from Activity."
    if (!id) {
      setPhotoNotice(notice)
      return
    }
    try {
      await uploadPhotoM.mutateAsync({ id, image: base64Of(dataUrl) })
      onSaved()
    } catch {
      setPhotoNotice(notice)
    }
  }

  function closeAndReset() {
    setItem('')
    setAmount('')
    setCategory('')
    setDate(toDateInputValue(new Date()))
    setShowCalendar(false)
    setPhoto(null)
    setPhotoError('')
    setPhotoNotice('')
    categoryTouchedRef.current = false
    setAutoPicked(false)
    gateRef.current?.cancel()
    onClose()
  }

  async function handleSubmit() {
    const parsed = Number(amount)
    if (missing.length > 0) {
      setError('')
      setNudge((n) => n + 1)
      return
    }
    if (unusual && !warning) {
      setUnusualWarnedFor(warnKey)
      setUnusualNudge((n) => n + 1)
      setError('')
      return
    }
    start()
    setError('')
    // The photo controls are locked while saving, so this is what the user sees.
    const pickedPhoto = photo
    try {
      const result = await addExpenseM.mutateAsync({
        item: item.trim(),
        amount_inr: String(Math.round(parsed)),
        category: effectiveCategory,
        date: date || undefined,
        source: 'manual',
      })
      if (suggestedBy.current) track('ai_category_suggested', { accepted: autoPicked, source: suggestedBy.current })
      window.dispatchEvent(new Event(MANUAL_LOG_EVENT))
      onSaved()
      reset()
      setUndoError('')
      setAdded({
        id: result.id,
        version: result.version,
        timestamp: result.timestamp ?? '',
        item: item.trim(),
        category: effectiveCategory,
        date,
        amount: Math.round(parsed),
        loggedAt: result.timestamp || new Date().toISOString(),
        categorySnapshot: createdCategory?.name === effectiveCategory ? createdCategory : undefined,
      })
      setPhotoNotice('')
      if (pickedPhoto) void uploadPhoto(result.id, pickedPhoto)
    } catch {
      setError('Could not save — try again.')
      fail()
    }
  }

  // Undo deletes the row and hands the form back as it was, like Mobile.
  async function handleUndo() {
    if (!added || deleteExpenseM.isPending) return
    setUndoError('')
    try {
      await deleteExpenseM.mutateAsync({
        id: added.id,
        version: added.version,
        timestamp: added.timestamp,
        item: added.item,
        amountInr: added.amount,
      })
      onSaved()
      setAdded(null)
    } catch {
      setUndoError("Couldn't undo. The expense is still saved.")
    }
  }

  const today = offsetDateValue(0)
  const yesterday = offsetDateValue(1)

  return (
    <>
    <Scrim className="erd-modal-overlay" onClick={success || showAddCategory ? undefined : onClose}>
      <Sheet className="erd-modal-card erd-log-card" inert={showAddCategory} onClick={(e) => e.stopPropagation()}>
        {added ? (
          <ExpenseAdded
            expense={added}
            undoing={deleteExpenseM.isPending}
            undoError={undoError}
            notice={photoNotice}
            onUndo={() => void handleUndo()}
            onDone={closeAndReset}
          />
        ) : (
          <>
            <PreloadExpenseAddedTick />
            <Toast
              trigger={nudge}
              message={missingFieldsMessage(missing)}
              icon={missing[0] === 'amount' ? WalletMinimal : missing[0] === 'item' ? PencilLine : Tag}
            />
            <Toast
              trigger={unusualNudge}
              message={
                unusual
                  ? `${formatMoney(parsedAmount)} is ${unusual.ratio}× your usual ${splitEmoji(effectiveCategory).text} (${formatMoney(Math.round(unusual.typical))}). Save again to keep it.`
                  : ''
              }
              icon={TriangleAlert}
            />
            <div className="erd-modal-head">
              <h3>Log expense</h3>
              <button
                type="button"
                className="erd-modal-close"
                onClick={onClose}
                aria-label="Close"
                disabled={success}
              >
                ✕
              </button>
            </div>

            <div className="erd-log-body">
              <section className="erd-log-section">
                <label className="erd-log-label" htmlFor="erd-log-amount">
                  Amount
                </label>
                <div
                  ref={amountNudgeRef}
                  className={`erd-amount-field${warning ? ' is-warn' : ''}${flag('amount') ? ' is-missing' : ''}`}
                >
                  <span className="erd-amount-symbol" aria-hidden="true">
                    {currencySymbol}
                  </span>
                  <input
                    ref={amountShakeRef}
                    id="erd-log-amount"
                    className="erd-amount-input"
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    placeholder="0"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    onKeyDown={(e) => {
                      // Mobile's numpad shakes on backspace at zero.
                      if (e.key === 'Backspace' && !(Number(amount) > 0) && !amount.includes('.')) shakeAmount()
                    }}
                  />
                </div>
              </section>

              <section className="erd-log-section">
                <label className="erd-log-label" htmlFor="erd-log-item">
                  What was it for?
                </label>
                <div className="erd-log-item-field">
                  <input
                    ref={itemNudgeRef}
                    id="erd-log-item"
                    className={`erd-log-input${flag('item') ? ' is-missing' : ''}`}
                    placeholder="e.g. Bike repair"
                    value={item}
                    onChange={(e) => handleItemChange(e.target.value)}
                  />
                  <AutoPickStatus thinking={suggesting} picked={autoPicked ? selectedCategory : null} selected={selectedCategory} pickTick={categoryPickTick} rollEmojis={rollEmojis} />
                </div>
              </section>

              <section className="erd-log-section">
                <div className="erd-log-label-row">
                  <div ref={categoryNudgeRef} className={`erd-log-label${flag('category') ? ' is-missing' : ''}`}>
                    Category
                  </div>
                  <button type="button" className="erd-chip" style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowAddCategory(true)}>
                    <Plus size={15} aria-hidden="true" />
                    Add
                  </button>
                </div>
                <CategoryPicker value={effectiveCategory} onChange={handleCategoryPick} additionalCategory={createdCategory} />
              </section>

              <section className="erd-log-section">
                <div className="erd-log-label">Date</div>
                <div className="erd-date-row" role="group" aria-label="Date">
                  <button
                    type="button"
                    className={`erd-date-chip${date === today ? ' is-active' : ''}`}
                    onClick={() => handleDatePick(today)}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`erd-date-chip${date === yesterday ? ' is-active' : ''}`}
                    onClick={() => handleDatePick(yesterday)}
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    ref={pickDateChipRef}
                    className={`erd-date-chip${showCalendar || (date !== today && date !== yesterday) ? ' is-active' : ''}`}
                    onClick={() => setShowCalendar((v) => !v)}
                  >
                    <Calendar size={15} aria-hidden="true" />
                    {showCalendar
                      ? 'Close'
                      : date !== today && date !== yesterday
                        ? formatShort(date)
                        : 'Pick date'}
                  </button>
                </div>
                <DatePicker
                  mode="single"
                  value={date}
                  onChange={handleDatePick}
                  hideTrigger
                  open={showCalendar}
                  onOpenChange={setShowCalendar}
                  anchorRef={pickDateChipRef}
                />
              </section>

              <ExpensePhotoMore
                photoUrl={photo}
                error={photoError}
                busy={saving || success}
                onPick={(file) => void handlePhotoPick(file)}
                onRemove={handlePhotoRemove}
              />

              {error && <p className="erd-log-error">{error}</p>}
            </div>

            <div className="erd-log-footer">
              <SuccessButton
                type="button"
                baseClass="erd-log-submit"
                saving={saving}
                success={success}
                successLabel="Expense saved"
                disabled={saving || success}
                onClick={handleSubmit}
              >
                {warning ? `Save ${formatMoney(parsedAmount)} anyway` : 'Save expense'}
              </SuccessButton>
              {brain && !saving && !success && (
                <button
                  type="button"
                  className="erd-log-several"
                  onClick={() => {
                    onClose()
                    brain.openCapture()
                  }}
                >
                  <MessageSquareText size={14} aria-hidden="true" /> Log several at once
                </button>
              )}
            </div>
          </>
        )}
      </Sheet>
    </Scrim>
    {showAddCategory && (
      <AddCategoryModal
        onClose={() => setShowAddCategory(false)}
        onCreated={(created) => {
          setCreatedCategory(created)
          handleCategoryPick(created.name)
          setShowAddCategory(false)
        }}
      />
    )}
    </>
  )
}
