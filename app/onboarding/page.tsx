'use client'

import { CurrencyPicker } from '@/src/components/CurrencyPicker'
import { CurrencyScope, useCurrency } from '@/src/context/CurrencyContext'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import '../../src/expense-redesign.css'

import { currentMonthKey, INCOME_CATEGORY } from '../../src/lib/envelope'
import { getBudgets, updateBudget } from '../../src/api/budgets'
import { addGroup } from '../../src/api/groups'
import { addCategory } from '../../src/api/categories'
import { updateUser } from '../../src/api/account'
import { completeOnboarding } from '../../src/api/billing'
import { DEFAULT_ALERT_PCTS } from '../../src/lib/alerts'
import { startTimer, track } from '../../src/lib/analytics'
import { AmountTicker } from '../../src/components/onboarding/AmountTicker'
import { Confetti } from '../../src/components/onboarding/Confetti'

// Twin of Mobile's app/setup.tsx: income → groups → categories → assign →
// done. Writes land on finish, same reasoning as mobile — groups/categories
// aren't renameable server-side until they exist. No numpad/bottom-sheet
// here: those exist on mobile because a thumb keyboard is painful, and a
// desktop already has a real one, so a plain input (under the ticker) and
// inline number fields replace them.
const EMOJI_CYCLE = ['🏠', '🎬', '🌱', '🛒', '💡', '🚌', '🍜', '📺', '🛍', '🛟', '📈', '🎓', '🐶', '💊', '✈️', '🎁']
const QUICK_PICKS = ['30000', '50000', '75000', '100000']

interface Item {
  id: string
  emoji: string
  name: string
  on: boolean
}

interface LiveCat {
  key: string
  groupId: string
  catId: string
  gi: number
  emoji: string
  name: string
}

let nextId = 1
const makeId = () => `setup-${nextId++}`

function defaultGroups(): Item[] {
  return [
    { id: 'g1', emoji: '🏠', name: 'Essentials', on: true },
    { id: 'g2', emoji: '🎬', name: 'Lifestyle', on: true },
    { id: 'g3', emoji: '🌱', name: 'Savings', on: false },
  ]
}

function defaultCats(): Record<string, Item[]> {
  return {
    g1: [
      { id: makeId(), emoji: '🏠', name: 'Rent', on: true },
      { id: makeId(), emoji: '🛒', name: 'Groceries', on: true },
      { id: makeId(), emoji: '💡', name: 'Utilities', on: true },
      { id: makeId(), emoji: '🚌', name: 'Transport', on: false },
    ],
    g2: [
      { id: makeId(), emoji: '🍜', name: 'Eating out', on: true },
      { id: makeId(), emoji: '🎬', name: 'Entertainment', on: true },
      { id: makeId(), emoji: '💻', name: 'Software', on: false },
      { id: makeId(), emoji: '📺', name: 'Subscriptions', on: false },
      { id: makeId(), emoji: '🛍', name: 'Shopping', on: false },
    ],
    g3: [
      { id: makeId(), emoji: '🛟', name: 'Emergency fund', on: true },
      { id: makeId(), emoji: '📈', name: 'Investments', on: false },
    ],
  }
}

function nextEmoji(current: string): string {
  const i = EMOJI_CYCLE.indexOf(current)
  return EMOJI_CYCLE[(i + 1 + EMOJI_CYCLE.length) % EMOJI_CYCLE.length]
}

function label(item: Item): string {
  return `${item.emoji} ${item.name.trim()}`
}

async function ignoreConflict(err: unknown): Promise<void> {
  if (err instanceof Error && err.message.toLowerCase().includes('already exists')) return
  if (err instanceof Error && err.message.includes('409')) return
  throw err
}

// group 0 gets the biggest weighted share, group 1 next, every group after
// that (including "rest") shares the same smaller weight.
function groupWeight(gi: number, weighted: boolean): number {
  if (!weighted) return 1
  if (gi === 0) return 3
  if (gi === 1) return 2
  return 1.5
}

// Analytics names for the five steps, so a funnel reads 'groups' rather than '2'.
const STEP_NAMES = ['currency', 'income', 'groups', 'categories', 'assign'] as const

const TITLES: Record<number, [string, string]> = {
  0: ['Choose your currency', 'The currency you use for your budget. You can change it later in More.'],
  1: ['What lands each month?', 'Your take-home income. This becomes the pot you assign from. You can change it any month.'],
  2: ['Group your money', 'Groups are the big buckets. Accept these or rename them to fit your life.'],
  3: ['Add your categories', 'These are the envelopes you actually spend from. Pick the ones you recognize.'],
  4: ['Assign your money', 'We suggested a split. Change any amount. The leftover has to reach zero.'],
}

export default function SetupWizardPage() {
  const current = useCurrency()
  const [currencyCode, setCurrencyCode] = useState(current.currencyCode)
  return <CurrencyScope code={currencyCode}><CurrencyWizard currencyCode={currencyCode} onCurrencyChange={code => setCurrencyCode(code as typeof currencyCode)} /></CurrencyScope>
}

function CurrencyWizard({ currencyCode, onCurrencyChange }: { currencyCode: string; onCurrencyChange: (code: string) => void }) {
  const { formatMoney } = useCurrency()

  const router = useRouter()
  const qc = useQueryClient()

  const [step, setStep] = useState(0)
  const [income, setIncome] = useState('')
  // Drive AmountTicker's roll/flash/delta animation, same as mobile: `tick`
  // replays it, `dir` picks the roll direction, `delta` (quick-pick jumps
  // only) floats a badge.
  const [tick, setTick] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [delta, setDelta] = useState(0)
  const [groups, setGroups] = useState<Item[]>(defaultGroups)
  const [cats, setCats] = useState<Record<string, Item[]>>(defaultCats)
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ income: number; groupCount: number; categoryCount: number; assigned: number } | null>(null)

  // Timing for the onboarding funnel, same as mobile's setup.tsx: the whole
  // wizard, and each step. Refs, since no render depends on them.
  const wizardTimer = useRef<() => number>(() => 0)
  const stepTimer = useRef<() => number>(() => 0)
  // Whether the user touched the suggested split on the assign step.
  const editedSplit = useRef(false)

  useEffect(() => {
    wizardTimer.current = startTimer()
    track('onboarding_started')
  }, [])

  useEffect(() => {
    if (step > 4) return
    stepTimer.current = startTimer()
    track('onboarding_step_viewed', { step, step_name: STEP_NAMES[step] })
  }, [step])

  const selectedGroups = groups.filter((g) => g.on && g.name.trim())
  const selectedCatCount = selectedGroups.reduce(
    (n, g) => n + (cats[g.id] ?? []).filter((c) => c.on && c.name.trim()).length,
    0,
  )

  function liveCats(): LiveCat[] {
    const out: LiveCat[] = []
    selectedGroups.forEach((g, gi) => {
      ;(cats[g.id] ?? []).forEach((c) => {
        if (c.on && c.name.trim()) out.push({ key: `${g.id}:${c.id}`, groupId: g.id, catId: c.id, gi, emoji: c.emoji, name: c.name })
      })
    })
    return out
  }

  const assignedTotal = () => liveCats().reduce((n, c) => n + (amounts[c.key] ?? 0), 0)
  const remainder = () => (Number(income) || 0) - assignedTotal()

  function distribute(weighted: boolean): Record<string, number> {
    const items = liveCats()
    const incomeValue = Number(income) || 0
    if (!items.length) return {}
    const weights = items.map((it) => groupWeight(it.gi, weighted))
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    const out: Record<string, number> = {}
    let used = 0
    items.forEach((it, idx) => {
      let v = idx === items.length - 1 ? incomeValue - used : Math.round((incomeValue * weights[idx]) / totalWeight / 100) * 100
      if (v < 0) v = 0
      used += v
      out[it.key] = v
    })
    return out
  }

  const canAdvance = step === 0 ? true :
    step === 1
      ? Number(income) > 0
      : step === 2
        ? selectedGroups.length > 0
        : step === 3
          ? selectedCatCount > 0
          : step === 4
            ? remainder() === 0 && assignedTotal() > 0
            : true

  // What each step's choice was, as counts and flags. Never the income or the
  // names typed in: those are the sensitive half of this app's data.
  const stepDetails = (): Record<string, string | number | boolean> => {
    if (step === 0) return { currency: currencyCode }
    if (step === 1) return { used_quick_pick: QUICK_PICKS.includes(income) }
    if (step === 2) {
      const defaults = new Map(defaultGroups().map((g) => [g.id, g.name]))
      return {
        groups_selected: selectedGroups.length,
        groups_added: selectedGroups.filter((g) => !defaults.has(g.id)).length,
        groups_renamed: selectedGroups.filter((g) => defaults.has(g.id) && defaults.get(g.id) !== g.name.trim()).length,
      }
    }
    if (step === 3) return { categories_selected: selectedCatCount }
    return { edited_split: editedSplit.current }
  }

  const trackStepCompleted = () =>
    track('onboarding_step_completed', {
      step,
      step_name: STEP_NAMES[step],
      seconds_on_step: stepTimer.current(),
      ...stepDetails(),
    })

  const patchGroup = (id: string, patch: Partial<Item>) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)))

  const patchCat = (groupId: string, catId: string, patch: Partial<Item>) =>
    setCats((c) => ({ ...c, [groupId]: (c[groupId] ?? []).map((cat) => (cat.id === catId ? { ...cat, ...patch } : cat)) }))

  const addGroupRow = () => {
    const id = makeId()
    setGroups((gs) => [...gs, { id, emoji: '🎁', name: '', on: true }])
    setCats((c) => ({ ...c, [id]: [] }))
  }

  const addCatRow = (groupId: string) => {
    setCats((c) => ({ ...c, [groupId]: [...(c[groupId] ?? []), { id: makeId(), emoji: '🎁', name: '', on: true }] }))
  }

  const setAmount = (key: string, v: number) => {
    editedSplit.current = true
    setAmounts((prev) => ({ ...prev, [key]: Math.max(0, v) }))
  }

  const fillRemainder = (key: string) => {
    const cur = amounts[key] ?? 0
    const rest = assignedTotal() - cur
    setAmount(key, Math.max(0, (Number(income) || 0) - rest))
  }

  const changeIncome = (v: string, jump = false) => {
    const prev = Number(income) || 0
    const next = Number(v) || 0
    setIncome(v)
    setTick((t) => t + 1)
    setDir(next >= prev ? 1 : -1)
    setDelta(jump ? next - prev : 0)
  }

  const back = () => {
    if (step > 0) track('onboarding_back_tapped', { from_step: step, step_name: STEP_NAMES[step] })
    setError('')
    setStep((s) => Math.max(0, s - 1))
  }

  const commit = async () => {
    if (pending) return
    setPending(true)
    setError('')
    try {
      const month = currentMonthKey()
      const incomeValue = Math.round(Number(income)) || 0
      // Capture one coherent revision snapshot immediately before writing.
      // Missing rows are conceptual version 0 and are created conditionally.
      const budgetVersions = new Map(
        (await getBudgets()).map((row) => [`${row.month}\u0000${row.category}`, row.version]),
      )
      const versionFor = (category: string) => budgetVersions.get(`${month}\u0000${category}`) ?? 0
      await updateBudget(month, INCOME_CATEGORY, { assigned: String(incomeValue), rolled_over: '0' }, versionFor(INCOME_CATEGORY))

      for (const g of selectedGroups) {
        await addGroup(label(g)).catch(ignoreConflict)
      }

      let categoryCount = 0
      const items = liveCats()
      for (const g of selectedGroups) {
        const groupLabel = label(g)
        const rows = (cats[g.id] ?? []).filter((c) => c.on && c.name.trim())
        for (const c of rows) {
          await addCategory(label(c), groupLabel).catch(ignoreConflict)
          categoryCount += 1
        }
      }

      for (const item of items) {
        const catLabel = `${item.emoji} ${item.name.trim()}`
        await updateBudget(month, catLabel, { assigned: String(amounts[item.key] ?? 0), rolled_over: '0' }, versionFor(catLabel))
      }

      // Two calls rather than one: the currency is an ordinary profile field,
      // but completing onboarding starts the 45-day trial, so its instant is
      // the server's — the browser's clock has no say in when the trial ends.
      await updateUser({ currencyCode })
      const { user } = await completeOnboarding()
      qc.setQueryData(['user'], user)
      await qc.invalidateQueries()

      trackStepCompleted()
      track('onboarding_completed', {
        total_seconds: wizardTimer.current(),
        groups_count: selectedGroups.length,
        categories_count: categoryCount,
        currency: currencyCode,
      })
      setResult({ income: incomeValue, groupCount: selectedGroups.length, categoryCount, assigned: assignedTotal() })
      setStep(5)
    } catch {
      track('onboarding_failed', { reason: 'save_failed' })
      setError('Something went wrong. Try again.')
    } finally {
      setPending(false)
    }
  }

  const next = () => {
    if (!canAdvance) return
    // The assign step reports itself once the save lands (see commit).
    if (step < 4) trackStepCompleted()
    if (step === 3) {
      setAmounts((prev) => (Object.keys(prev).length ? prev : distribute(true)))
      setStep(4)
      return
    }
    if (step === 4) {
      commit()
      return
    }
    setStep((s) => s + 1)
  }

  if (step === 5 && result) {
    return (
      <div className="expense-redesign setup-page">
        <SetupDone result={result} onFinish={() => router.push('/account/guided-tour?fresh=1')} />
      </div>
    )
  }

  const [title, blurb] = TITLES[step]
  const rem = remainder()
  const hint = step === 0 ? '' :
    step === 1
      ? canAdvance
        ? ''
        : 'Enter an amount to continue'
      : step === 2
        ? canAdvance
          ? `${selectedGroups.length} groups selected`
          : 'Keep at least one group'
        : step === 3
          ? canAdvance
            ? `${selectedCatCount} categories across ${selectedGroups.length} groups`
            : 'Pick at least one category'
          : canAdvance
            ? 'Everything assigned'
            : rem > 0
              ? `${formatMoney(rem)} still to assign`
              : `${formatMoney(-rem)} over your income`

  const remState = rem === 0 ? 'is-zero' : rem < 0 ? 'is-over' : 'is-under'
  const remLabel = rem === 0 ? 'All assigned' : rem < 0 ? 'Over by' : 'Left to assign'

  return (
    <div className="expense-redesign setup-page">
      <div className="setup-top">
        <button type="button" className="setup-back" onClick={back} disabled={step === 0}>
          ←
        </button>
        <div className="setup-dots">
          {[0, 1, 2, 3, 4].map((n) => (
            <span key={n} className={`setup-dot ${n <= step ? 'is-active' : ''}`} />
          ))}
        </div>
        <span className="setup-step-counter">{step + 1}/5</span>
      </div>

      <h1 className="setup-title">{title}</h1>
      <p className="setup-blurb">{blurb}</p>

      {step === 0 && (<div className="setup-body"><CurrencyPicker value={currencyCode} onChange={onCurrencyChange} /></div>)}

      {step === 1 && (
        <div className="setup-body">
          <label className="setup-amount-field">
            <AmountTicker text={formatMoney(Number(income) || 0)} tick={tick} dir={dir} delta={delta} dimmed={!income} />
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              className="setup-amount-hidden"
              aria-label="Monthly income"
              value={income}
              onChange={(e) => changeIncome(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9))}
            />
          </label>
          <p className="setup-amount-hint">{income ? '' : 'Type an amount, or pick one below'}</p>
          <div className="setup-quick-row">
            {QUICK_PICKS.map((v) => (
              <button
                key={v}
                type="button"
                className={`setup-chip ${income === v ? 'is-active' : ''}`}
                onClick={() => changeIncome(v, true)}
              >
                {formatMoney(Number(v))}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="setup-body setup-row-list">
          {groups.map((g) => (
            <PickRow
              key={g.id}
              emoji={g.emoji}
              name={g.name}
              on={g.on}
              placeholder="Group name"
              onCycleEmoji={() => patchGroup(g.id, { emoji: nextEmoji(g.emoji) })}
              onChangeName={(name) => patchGroup(g.id, { name })}
              onToggle={() => patchGroup(g.id, { on: !g.on })}
            />
          ))}
          <button type="button" className="setup-add-row" onClick={addGroupRow}>
            + Add your own group
          </button>
          <p className="setup-micro-hint">tap a name to rename · tap the emoji to change it</p>
        </div>
      )}

      {step === 3 && (
        <div className="setup-body setup-section-list">
          {selectedGroups.map((g) => {
            const rows = cats[g.id] ?? []
            return (
              <div key={g.id} className="setup-section">
                <div className="setup-section-header">
                  <span>{g.emoji}</span>
                  <span className="setup-section-title">{g.name.toUpperCase()}</span>
                  <span className="setup-section-count">{rows.filter((c) => c.on).length} picked</span>
                </div>
                {rows.map((c) => (
                  <PickRow
                    key={c.id}
                    emoji={c.emoji}
                    name={c.name}
                    on={c.on}
                    placeholder="Category name"
                    onCycleEmoji={() => patchCat(g.id, c.id, { emoji: nextEmoji(c.emoji) })}
                    onChangeName={(name) => patchCat(g.id, c.id, { name })}
                    onToggle={() => patchCat(g.id, c.id, { on: !c.on })}
                  />
                ))}
                <button type="button" className="setup-add-pill" onClick={() => addCatRow(g.id)}>
                  + Add category
                </button>
              </div>
            )
          })}
          {selectedCatCount > 0 && (
            <p className="setup-micro-hint">
              🔔 Alerts at {DEFAULT_ALERT_PCTS.join(' · ')}% by default. Change any category&apos;s alerts later from Envelopes.
            </p>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="setup-body">
          <div className={`setup-rem-chip ${remState}`}>
            <span className="setup-rem-label">{remLabel}</span>
            <span className="setup-rem-value">{formatMoney(Math.abs(rem))}</span>
          </div>
          <div className="setup-split-row">
            <button type="button" className="setup-split-btn" onClick={() => setAmounts(distribute(true))}>
              Suggested split
            </button>
            <button type="button" className="setup-split-btn" onClick={() => setAmounts(distribute(false))}>
              Split evenly
            </button>
          </div>
          <div className="setup-section-list">
            {selectedGroups.map((g) => {
              const rows = (cats[g.id] ?? []).filter((c) => c.on && c.name.trim())
              const subtotal = rows.reduce((n, c) => n + (amounts[`${g.id}:${c.id}`] ?? 0), 0)
              return (
                <div key={g.id} className="setup-section">
                  <div className="setup-section-header">
                    <span>{g.emoji}</span>
                    <span className="setup-section-title">{g.name.toUpperCase()}</span>
                    <span className="setup-section-subtotal">{formatMoney(subtotal)}</span>
                  </div>
                  {rows.map((c) => {
                    const key = `${g.id}:${c.id}`
                    const v = amounts[key] ?? 0
                    return (
                      <div key={c.id} className="setup-assign-row">
                        <span className="setup-assign-emoji">{c.emoji}</span>
                        <span className="setup-assign-name">{c.name}</span>
                        <input
                          type="number"
                          className="txn-entry-input setup-assign-input"
                          placeholder="0"
                          min={0}
                          value={v || ''}
                          onChange={(e) => setAmount(key, Math.round(Number(e.target.value) || 0))}
                        />
                        {rem !== 0 && (
                          <button type="button" className="setup-fill-btn" onClick={() => fillRemainder(key)} title="Give this the leftover">
                            fill
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {error !== '' && <p className="setup-error">{error}</p>}

      <button type="button" className="setup-cta" disabled={!canAdvance || pending} onClick={next}>
        {pending ? 'Saving…' : step === 4 ? 'Finish setup' : 'Continue'}
      </button>
      {error === '' && <p className="setup-cta-hint">{hint}</p>}
    </div>
  )
}

function PickRow({
  emoji,
  name,
  on,
  placeholder,
  onCycleEmoji,
  onChangeName,
  onToggle,
}: {
  emoji: string
  name: string
  on: boolean
  placeholder: string
  onCycleEmoji: () => void
  onChangeName: (name: string) => void
  onToggle: () => void
}) {
  return (
    <div className={`setup-pick-row ${on ? 'is-on' : ''}`}>
      <button type="button" className="setup-pick-emoji" onClick={onCycleEmoji} title="Change emoji">
        {emoji}
      </button>
      <input
        type="text"
        className="setup-pick-input"
        placeholder={placeholder}
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
      />
      <button type="button" className={`setup-pick-check ${on ? 'is-on' : ''}`} onClick={onToggle} aria-label={on ? 'Included' : 'Excluded'}>
        {on ? '✓' : ''}
      </button>
    </div>
  )
}

function SetupDone({
  result,
  onFinish,
}: {
  result: { income: number; groupCount: number; categoryCount: number; assigned: number }
  onFinish: () => void
}) {
  const { currencySymbol, formatMoney } = useCurrency()

  const summary = [
    { icon: currencySymbol, label: 'Monthly income', value: formatMoney(result.income) },
    { icon: '📁', label: 'Groups', value: String(result.groupCount) },
    { icon: '✉️', label: 'Categories', value: String(result.categoryCount) },
    { icon: '✓', label: 'Assigned', value: formatMoney(result.assigned) },
  ]

  return (
    <div className="setup-done">
      <Confetti />
      <div className="setup-done-badge">✓</div>
      <h1 className="setup-done-title">Your budget is ready to go.</h1>
      <p className="setup-done-blurb">Everything below can be changed later from Envelopes.</p>
      <div className="setup-done-list">
        {summary.map((s) => (
          <div key={s.label} className="setup-done-row">
            <span className="setup-done-icon">{s.icon}</span>
            <span className="setup-done-label">{s.label}</span>
            <span className="setup-done-value">{s.value}</span>
          </div>
        ))}
      </div>
      <button type="button" className="setup-cta" onClick={onFinish}>
        Show me how it works
      </button>
    </div>
  )
}
