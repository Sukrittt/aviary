'use client'

import { useCurrency } from '@/src/context/CurrencyContext'
import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { CalendarBlankIcon, XIcon } from '@/src/components/icons'
import { Scrim, Sheet } from './MotionSheet'
import { SuccessButton, useButtonPhase } from './SuccessButton'
import { DatePicker } from './DatePicker'
import { CategoryPicker } from './CategoryPicker'
import { useAddSubscription, useUpdateSubscription } from '../hooks/useSubscriptions'
import { suggestPresets } from '../lib/subscriptionPresets'

interface SubscriptionEdit {
  service: string
  amount_inr: string
  billing_cycle: string
  next_due_date: string
  notes: string
  category: string
}

interface Props {
  onClose: () => void
  onSaved: () => void
  editData?: SubscriptionEdit
  initialValues?: SubscriptionEdit
  suggestionId?: string
}

const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly', 'one-time'] as const
type BillingCycle = (typeof BILLING_CYCLES)[number]

/** Display casing — never CSS `capitalize`, which would mangle "one-time". */
const CYCLE_LABEL: Record<BillingCycle, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  'one-time': 'One-time',
}

/** "/ month"-style suffix next to the amount, matching the picked cycle. */
const CYCLE_NOUN: Record<BillingCycle, string> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
  'one-time': '',
}

/** Service chips shown before "Show more". */
const PRESETS_COLLAPSED = 5

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDateInput(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** Date as a local `YYYY-MM-DD` string. */
function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function futureDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return toDateInputValue(d)
}

function firstOfNextMonth(): string {
  const d = new Date()
  return toDateInputValue(new Date(d.getFullYear(), d.getMonth() + 1, 1))
}

function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${SHORT_MONTHS[m - 1]} ${y}`
}

export function SubscriptionModal({ onClose, onSaved, editData, initialValues, suggestionId }: Props) {
  const { currencySymbol, currencyCode } = useCurrency()

  const isEdit = !!editData
  const initial = editData ?? initialValues
  const [service, setService] = useState(initial?.service ?? '')
  const [amount, setAmount] = useState(initial?.amount_inr ?? '')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    (initial?.billing_cycle as BillingCycle) ?? 'monthly',
  )
  // Deliberately unselected — a guessed default would silently create the wrong reminder.
  const [dueDate, setDueDate] = useState(() =>
    initial?.next_due_date ? toDateInput(initial.next_due_date) : '',
  )
  const [showAllPresets, setShowAllPresets] = useState(false)
  const reduceMotion = useReducedMotion()
  const [showNote, setShowNote] = useState(() => !!initial?.notes?.trim())
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [showCalendar, setShowCalendar] = useState(false)
  const pickDateChipRef = useRef<HTMLButtonElement>(null)
  const { saving, success, start, succeed, fail } = useButtonPhase()
  const [error, setError] = useState('')
  const addSub = useAddSubscription()
  const updateSub = useUpdateSubscription()

  const amt = parseFloat(amount)
  const amountOk = amount.trim() !== '' && !Number.isNaN(amt) && amt > 0
  const canSave = service.trim() !== '' && amountOk && dueDate !== ''

  const missing: string[] = []
  if (!service.trim()) missing.push('a service')
  if (!amountOk) missing.push('an amount')
  if (!dueDate) missing.push('a due date')

  const presets = suggestPresets(currencyCode, service, Infinity)
  const unitNoun = CYCLE_NOUN[billingCycle]
  const in7 = futureDate(7)
  const in30 = futureDate(30)
  const firstNext = firstOfNextMonth()
  const customDate = dueDate !== '' && dueDate !== in7 && dueDate !== in30 && dueDate !== firstNext

  function handleAmountChange(value: string) {
    if (/[^0-9.]/.test(value)) return
    setAmount(value)
  }

  function handleDatePick(value: string) {
    setDueDate(value)
    setShowCalendar(false)
  }

  async function handleSave() {
    if (!canSave || saving || success) return
    setError('')
    start()
    try {
      if (isEdit) {
        const updates: Record<string, string> = { amount_inr: String(amt) }
        if (service.trim() !== editData!.service) updates.new_service = service.trim()
        if (billingCycle !== editData!.billing_cycle) updates.billing_cycle = billingCycle
        if (dueDate !== toDateInput(editData!.next_due_date)) updates.next_due_date = dueDate || ''
        if (notes !== editData!.notes) updates.notes = notes.trim()
        if (category !== editData!.category) updates.category = category
        await updateSub.mutateAsync({ service: editData!.service, updates })
      } else {
        await addSub.mutateAsync({
          suggestion_id: suggestionId,
          service: service.trim(),
          amount_inr: String(amt),
          billing_cycle: billingCycle,
          next_due_date: dueDate || undefined,
          notes: notes.trim(),
          category,
        })
      }
      onSaved()
      succeed(onClose)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subscription')
      fail()
    }
  }

  return (
    <Scrim className="erd-modal-overlay" onClick={success ? undefined : onClose}>
      <Sheet className="erd-modal-card erd-sub-card" onClick={(e) => e.stopPropagation()}>
        <div className="erd-modal-head">
          <h3>{isEdit ? 'Edit subscription' : 'New subscription'}</h3>
          <button
            type="button"
            className="erd-modal-close"
            onClick={onClose}
            aria-label="Close"
            disabled={success}
          >
            <XIcon size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="erd-sub-body">
          {error && <p className="erd-log-error">{error}</p>}

          <section className="erd-sub-section">
            <label className="erd-log-label" htmlFor="erd-sub-service">
              Service
            </label>
            <input
              id="erd-sub-service"
              className="erd-log-input"
              placeholder="e.g. Hotstar"
              value={service}
              onChange={(e) => setService(e.target.value)}
              autoFocus
            />
            {isEdit || suggestionId ? null : (
              <div className="erd-sub-picks">
                {(showAllPresets ? presets : presets.slice(0, PRESETS_COLLAPSED)).map((name, i) => (
                  <motion.button
                    key={name}
                    type="button"
                    className="erd-chip"
                    onClick={() => setService(name)}
                    // Chips past the first five pop in with a short stagger when "Show more" opens them.
                    initial={i < PRESETS_COLLAPSED || reduceMotion ? false : { opacity: 0, scale: 0.9, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut', delay: Math.max(0, i - PRESETS_COLLAPSED) * 0.015 }}
                  >
                    {name}
                  </motion.button>
                ))}
                {presets.length > PRESETS_COLLAPSED && (
                  <button type="button" className="erd-chip is-selected" onClick={() => setShowAllPresets((v) => !v)}>
                    {showAllPresets ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="erd-sub-section">
            <label className="erd-log-label" htmlFor="erd-sub-amount">
              Amount
            </label>
            <div className="erd-amount-field">
              <span className="erd-amount-symbol" aria-hidden="true">
                {currencySymbol}
              </span>
              <input
                id="erd-sub-amount"
                className="erd-amount-input erd-sub-amount-input"
                type="text"
                inputMode="decimal"
                placeholder="0"
                size={Math.max(4, amount.length)}
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
              />
              {unitNoun && (
                <span className="erd-sub-unit" aria-hidden="true">
                  / {unitNoun}
                </span>
              )}
            </div>
          </section>

          <section className="erd-sub-section">
            <div className="erd-log-label">Billing cycle</div>
            <div className="erd-seg-row" role="group" aria-label="Billing cycle">
              {BILLING_CYCLES.map((cycle) => (
                <button
                  key={cycle}
                  type="button"
                  className={`erd-seg-btn${billingCycle === cycle ? ' is-active' : ''}`}
                  aria-pressed={billingCycle === cycle}
                  onClick={() => setBillingCycle(cycle)}
                >
                  {CYCLE_LABEL[cycle]}
                </button>
              ))}
            </div>
          </section>

          <section className="erd-sub-section">
            <div className="erd-log-label">Next due date</div>
            <div className="erd-date-row" role="group" aria-label="Next due date">
              <button
                type="button"
                className={`erd-date-chip${dueDate === in7 ? ' is-active' : ''}`}
                onClick={() => handleDatePick(in7)}
              >
                In 7 days
              </button>
              <button
                type="button"
                className={`erd-date-chip${dueDate === in30 ? ' is-active' : ''}`}
                onClick={() => handleDatePick(in30)}
              >
                In 30 days
              </button>
              <button
                type="button"
                className={`erd-date-chip${dueDate === firstNext ? ' is-active' : ''}`}
                onClick={() => handleDatePick(firstNext)}
              >
                1st of next month
              </button>
              <button
                type="button"
                ref={pickDateChipRef}
                className={`erd-date-chip${showCalendar || customDate ? ' is-active' : ''}`}
                onClick={() => setShowCalendar((v) => !v)}
              >
                <CalendarBlankIcon size={15} aria-hidden="true" />
                {showCalendar ? 'Close' : customDate ? formatDueDate(dueDate) : 'Pick date'}
              </button>
            </div>
            {dueDate && <p className="erd-sub-due">Due {formatDueDate(dueDate)}</p>}
            <DatePicker
              mode="single"
              value={dueDate}
              onChange={handleDatePick}
              disableFuture={false}
              hideTrigger
              open={showCalendar}
              onOpenChange={setShowCalendar}
              anchorRef={pickDateChipRef}
            />
          </section>

          <section className="erd-sub-section">
            <div className="erd-log-label">Category (optional)</div>
            <CategoryPicker value={category} onChange={setCategory} />
            <p className="erd-sub-hint">Used when this is logged as an expense.</p>
          </section>

          {showNote ? (
            <section className="erd-sub-section">
              <label className="erd-log-label" htmlFor="erd-sub-notes">
                Note
              </label>
              <input
                id="erd-sub-notes"
                className="erd-log-input"
                placeholder="Anything worth remembering"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </section>
          ) : (
            <button
              type="button"
              className="erd-sub-note-toggle"
              onClick={() => setShowNote(true)}
            >
              + Add note
            </button>
          )}
        </div>

        <div className="erd-sub-footer">
          <SuccessButton
            type="button"
            baseClass="erd-log-submit"
            saving={saving}
            success={success}
            successLabel="Subscription saved"
            disabled={!canSave || saving || success}
            onClick={handleSave}
          >
            {isEdit ? 'Save changes' : 'Add subscription'}
          </SuccessButton>
          {!canSave && missing.length > 0 && (
            <p className="erd-sub-save-hint">Enter {missing.join(' and ')} to save.</p>
          )}
        </div>
      </Sheet>
    </Scrim>
  )
}
