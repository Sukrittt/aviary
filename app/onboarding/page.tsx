'use client'

import { CurrencyPicker } from '@/src/components/CurrencyPicker'
import { CurrencyScope, useCurrency } from '@/src/context/CurrencyContext'

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Check, CopyX, FolderOpen, Plus, Tags, WalletCards } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import '../../src/expense-redesign.css'

import { currentMonthKey, INCOME_CATEGORY } from '../../src/lib/envelope'
import { getBudgets, updateBudget } from '../../src/api/budgets'
import { addGroup } from '../../src/api/groups'
import { addCategory } from '../../src/api/categories'
import { getUser, updateUser } from '../../src/api/account'
import { completeOnboarding } from '../../src/api/billing'
import { DEFAULT_ALERT_PCTS } from '../../src/lib/alerts'
import { startTimer, track } from '../../src/lib/analytics'
import { AmountTicker } from '../../src/components/onboarding/AmountTicker'
import { Confetti } from '../../src/components/onboarding/Confetti'
import { LoadingCaption } from '../../src/components/LoadingCaption'
import { Toast } from '../../src/components/Toast'

// Twin of Mobile's app/setup.tsx: income → groups → categories → assign →
// done. Writes land on finish, same reasoning as mobile — groups/categories
// aren't renameable server-side until they exist. No numpad/bottom-sheet
// here: those exist on mobile because a thumb keyboard is painful, and a
// desktop already has a real one, so a plain input (under the ticker) and
// inline number fields replace them.
const EMOJI_CHOICES = ['🏠', '🎬', '🌱', '🛒', '💡', '🚌', '🍜', '📺', '🛍', '🛟', '📈', '🎓', '🐶', '💊', '✈️', '🎁']
const QUICK_PICKS = ['30000', '50000', '75000', '100000']
// Shortest time a Finish-button save step stays on screen.
const STEP_MIN_MS = 500
// The last step holds longer so it reads as finishing, not a flash before the success screen.
const LAST_STEP_MIN_MS = 1000

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

// A blank row stays unchecked; it checks itself the moment it gets a name,
// and unchecks again if the name is cleared.
function onForName(item: Item, name: string): boolean {
  if (!name.trim()) return false
  return item.name.trim() ? item.on : true
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

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
  const reduceMotion = useReducedMotion()
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
  // Real save progress for the Finish button: the step being written and the
  // share of writes that have landed, so a slow save visibly moves.
  const [saveStep, setSaveStep] = useState('')
  const [saveProgress, setSaveProgress] = useState(0)
  const [error, setError] = useState('')
  // Two checked groups (or categories) can't share a name; trying it shows this toast.
  const [dupToast, setDupToast] = useState({ n: 0, name: '', kind: 'group' })
  const [result, setResult] = useState<{ income: number; groupCount: number; categoryCount: number } | null>(null)

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

  const blockDup = (kind: 'group' | 'category', name: string) =>
    setDupToast((t) => ({ n: t.n + 1, name: name.trim(), kind }))

  // Whether `name` matches another checked row. Categories compare across
  // every selected group, since they all become envelopes side by side.
  const groupDup = (id: string) => (name: string) =>
    name.trim() !== '' && groups.some((g) => g.id !== id && g.on && sameName(g.name, name))
  const catDup = (catId: string) => (name: string) =>
    name.trim() !== '' &&
    selectedGroups.some((g) => (cats[g.id] ?? []).some((c) => c.id !== catId && c.on && sameName(c.name, name)))

  const toggleGuarded = (item: Item, isDup: (name: string) => boolean, kind: 'group' | 'category'): Partial<Item> | null => {
    if (!item.on && isDup(item.name)) {
      blockDup(kind, item.name)
      return null
    }
    return { on: !item.on }
  }

  const renameGuarded = (item: Item, name: string, isDup: (name: string) => boolean, kind: 'group' | 'category'): Partial<Item> => {
    const dup = isDup(name)
    const wasDup = isDup(item.name)
    // A row unchecked only because it was a duplicate checks again once renamed.
    const wantOn = wasDup && !item.on && name.trim() ? true : onForName(item, name)
    if (wantOn && dup && !wasDup) blockDup(kind, name)
    return { name, on: wantOn && !dup }
  }

  const toggleGroup = (g: Item) => {
    const patch = toggleGuarded(g, groupDup(g.id), 'group')
    if (patch) patchGroup(g.id, patch)
  }
  const renameGroup = (g: Item, name: string) => patchGroup(g.id, renameGuarded(g, name, groupDup(g.id), 'group'))
  const toggleCat = (groupId: string, c: Item) => {
    const patch = toggleGuarded(c, catDup(c.id), 'category')
    if (patch) patchCat(groupId, c.id, patch)
  }
  const renameCat = (groupId: string, c: Item, name: string) =>
    patchCat(groupId, c.id, renameGuarded(c, name, catDup(c.id), 'category'))

  const patchCat = (groupId: string, catId: string, patch: Partial<Item>) =>
    setCats((c) => ({ ...c, [groupId]: (c[groupId] ?? []).map((cat) => (cat.id === catId ? { ...cat, ...patch } : cat)) }))

  const addGroupRow = () => {
    const id = makeId()
    setGroups((gs) => [...gs, { id, emoji: '🎁', name: '', on: false }])
    setCats((c) => ({ ...c, [id]: [] }))
  }

  const addCatRow = (groupId: string) => {
    setCats((c) => ({ ...c, [groupId]: [...(c[groupId] ?? []), { id: makeId(), emoji: '🎁', name: '', on: false }] }))
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
    const incomeValue = Math.round(Number(income)) || 0
    const categories = selectedGroups.flatMap((g) =>
      (cats[g.id] ?? []).filter((c) => c.on && c.name.trim()).map((c) => ({ name: label(c), group: label(g) })),
    )
    const categoryCount = categories.length
    const finishSetup = (recoveredAfterError = false) => {
      trackStepCompleted()
      track('onboarding_completed', {
        total_seconds: wizardTimer.current(),
        groups_count: selectedGroups.length,
        categories_count: categoryCount,
        currency: currencyCode,
        ...(recoveredAfterError ? { recovered_after_error: true } : {}),
      })
      setResult({ income: incomeValue, groupCount: selectedGroups.length, categoryCount })
      setStep(5)
    }
    const live = liveCats()
    // Groups, categories, income, each envelope, then currency + completion.
    const totalWrites = selectedGroups.length + categoryCount + 1 + live.length + 2
    let doneWrites = 0
    const tick = () => setSaveProgress(++doneWrites / totalWrites)
    setSaveProgress(0)
    setSaveStep('Creating your envelopes…')
    // Each step stays readable for at least STEP_MIN_MS, so a fast write never
    // flashes its text past the user or cuts straight to the next screen.
    let stepShownAt = Date.now()
    const holdStep = (minMs = STEP_MIN_MS) => new Promise<void>((r) => setTimeout(r, Math.max(0, stepShownAt + minMs - Date.now())))
    const showStep = async (text: string) => {
      await holdStep()
      setSaveStep(text)
      stepShownAt = Date.now()
    }
    try {
      const month = currentMonthKey()
      const budgetVersions = new Map(
        (await getBudgets()).map((row) => [`${row.month}\u0000${row.category}`, row.version]),
      )
      const versionFor = (category: string) => budgetVersions.get(`${month}\u0000${category}`) ?? 0
      // Keep ordering within each collection while independent writes run
      // together, matching mobile. Completion waits for every setup write.
      await Promise.all([
        (async () => {
          for (const g of selectedGroups) await addGroup(label(g)).catch(ignoreConflict).then(tick)
        })(),
        (async () => {
          for (const c of categories) await addCategory(c.name, c.group).catch(ignoreConflict).then(tick)
        })(),
        updateBudget(month, INCOME_CATEGORY, { assigned: String(incomeValue), rolled_over: '0' }, versionFor(INCOME_CATEGORY)).then(tick),
        ...live.map((item) => {
          const catLabel = `${item.emoji} ${item.name.trim()}`
          return updateBudget(month, catLabel, { assigned: String(amounts[item.key] ?? 0), rolled_over: '0' }, versionFor(catLabel)).then(tick)
        }),
      ])
      await showStep('Starting your budget…')
      await updateUser({ currencyCode })
      tick()
      const { user } = await completeOnboarding()
      tick()
      qc.setQueryData(['user'], user)
      void qc.invalidateQueries()
      await holdStep(LAST_STEP_MIN_MS)
      finishSetup()
    } catch {
      // The response may be lost after completion committed. Check the
      // server-owned flag before asking the user to retry.
      try {
        const user = await getUser()
        if (user.onboardedAt) {
          qc.setQueryData(['user'], user)
          void qc.invalidateQueries()
          await holdStep(LAST_STEP_MIN_MS)
          finishSetup(true)
          return
        }
      } catch {
        // A retry stays available when confirmation also fails.
      }
      track('onboarding_failed', { reason: 'save_failed' })
      setError("Couldn't confirm your setup. Check your connection and try again. If it already saved, reopening the app will continue to your budget.")
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
        <SetupDone result={result} onFinish={() => router.replace('/account/trial-notice')} />
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
        <button type="button" className="setup-back" onClick={back} disabled={step === 0} aria-label="Back">
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <div className="setup-dots" role="img" aria-label={`Step ${step + 1} of 5`}>
          {[0, 1, 2, 3, 4].map((n) => (
            <span key={n} className={`setup-dot ${n <= step ? 'is-active' : ''}`} />
          ))}
        </div>
      </div>

      <h1 className="setup-title">{title}</h1>
      <p className="setup-blurb">{blurb}</p>

      {step === 0 && (<div className="setup-body"><CurrencyPicker value={currencyCode} onChange={onCurrencyChange} /></div>)}

      {step === 1 && (
        <div className="setup-body setup-income-body">
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
              <motion.button
                whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                key={v}
                type="button"
                className={`setup-chip ${income === v ? 'is-active' : ''}`}
                onClick={() => changeIncome(v, true)}
              >
                {formatMoney(Number(v))}
              </motion.button>
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
              onPickEmoji={(emoji) => patchGroup(g.id, { emoji })}
              onChangeName={(name) => renameGroup(g, name)}
              onToggle={() => toggleGroup(g)}
            />
          ))}
          <button type="button" className="setup-add-row" onClick={addGroupRow}>
            <Plus size={16} aria-hidden="true" /> Add your own group
          </button>
          <p className="setup-micro-hint">click a name to rename · click the emoji to pick another</p>
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
                <div className="setup-section-rows">
                  {rows.map((c) => (
                    <PickRow
                      key={c.id}
                      emoji={c.emoji}
                      name={c.name}
                      on={c.on}
                      placeholder="Category name"
                      onPickEmoji={(emoji) => patchCat(g.id, c.id, { emoji })}
                      onChangeName={(name) => renameCat(g.id, c, name)}
                      onToggle={() => toggleCat(g.id, c)}
                    />
                  ))}
                </div>
                <button type="button" className="setup-add-pill" onClick={() => addCatRow(g.id)}>
                  <Plus size={14} aria-hidden="true" /> Add category
                </button>
              </div>
            )
          })}
          {selectedCatCount > 0 && (
            <p className="setup-micro-hint">
              Default alerts: {DEFAULT_ALERT_PCTS.map((pct) => `${pct}%`).join(' · ')}
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
            <motion.button whileTap={reduceMotion ? undefined : { scale: 0.97 }} type="button" className="setup-split-btn" onClick={() => setAmounts(distribute(true))}>
              Suggested split
            </motion.button>
            <motion.button whileTap={reduceMotion ? undefined : { scale: 0.97 }} type="button" className="setup-split-btn" onClick={() => setAmounts(distribute(false))}>
              Split evenly
            </motion.button>
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

      <Toast trigger={dupToast.n} message={`You've already got a ${dupToast.kind} called ${dupToast.name}.`} icon={CopyX} />

      {error !== '' && <p className="setup-error">{error}</p>}

      <button
        type="button"
        className={`setup-cta${pending ? ' is-saving' : ''}`}
        disabled={!canAdvance || pending}
        onClick={next}
        style={pending ? ({ '--save-progress': saveProgress } as React.CSSProperties) : undefined}
      >
        {pending ? (
          <LoadingCaption phrases={[saveStep || 'Saving…']} placement="inline" align="center" className="setup-cta-caption" />
        ) : step === 4 ? 'Finish setup' : 'Continue'}
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
  onPickEmoji,
  onChangeName,
  onToggle,
}: {
  emoji: string
  name: string
  on: boolean
  placeholder: string
  onPickEmoji: (emoji: string) => void
  onChangeName: (name: string) => void
  onToggle: () => void
}) {
  // Where the popover sits, in viewport coordinates. It's position: fixed so a
  // scrolling category column can't clip it; null means closed.
  const [picking, setPicking] = useState<{ top: number; left: number } | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const togglePicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (picking) return setPicking(null)
    const r = e.currentTarget.getBoundingClientRect()
    // Flip above the button when there's no room for the grid below it.
    const top = r.bottom + 108 > window.innerHeight ? r.top - 108 : r.bottom + 8
    setPicking({ top, left: r.left })
  }

  useEffect(() => {
    if (!picking) return
    const close = () => setPicking(null)
    const onDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    // A fixed popover would drift off its button on scroll, so close instead.
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
    }
  }, [picking])

  return (
    <div className={`setup-pick-row ${on ? 'is-on' : ''}`}>
      <div className="setup-pick-emoji-wrap" ref={pickerRef}>
        <button
          type="button"
          className="setup-pick-emoji"
          onClick={togglePicker}
          aria-label={`Change emoji for ${name || placeholder}`}
          aria-expanded={picking !== null}
        >
          {emoji}
        </button>
        {picking && (
          <div className="setup-emoji-pop" role="group" aria-label="Pick an emoji" style={picking}>
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                className={`setup-emoji-opt ${e === emoji ? 'is-active' : ''}`}
                aria-pressed={e === emoji}
                onClick={() => {
                  onPickEmoji(e)
                  setPicking(null)
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        type="text"
        className="setup-pick-input"
        placeholder={placeholder}
        // Rows only mount empty when just added: focus them, which also
        // scrolls them into view inside a scrolling category column.
        autoFocus={name === ''}
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
      />
      <button type="button" className={`setup-pick-check ${on ? 'is-on' : ''}`} onClick={onToggle} role="checkbox" aria-checked={on} aria-label={`${on ? 'Deselect' : 'Select'} ${name || placeholder}`}>
        <Check size={16} strokeWidth={3} aria-hidden="true" className="setup-pick-check-icon" />
      </button>
    </div>
  )
}

function SetupDone({
  result,
  onFinish,
}: {
  result: { income: number; groupCount: number; categoryCount: number }
  onFinish: () => void
}) {
  const { formatMoney } = useCurrency()

  const summary = [
    { icon: WalletCards, label: 'Monthly income', value: formatMoney(result.income) },
    { icon: FolderOpen, label: 'Groups', value: String(result.groupCount) },
    { icon: Tags, label: 'Categories', value: String(result.categoryCount) },
  ]

  return (
    <div className="setup-done">
      <Confetti />
      <div className="setup-done-badge"><Check size={30} strokeWidth={2.4} aria-hidden="true" /></div>
      <h1 className="setup-done-title">Your budget is ready to go.</h1>
      <p className="setup-done-blurb">Everything below can be changed later from Envelopes.</p>
      <div className="setup-done-list">
        {summary.map((s) => (
          <div key={s.label} className="setup-done-row">
            <span className="setup-done-icon"><s.icon size={16} strokeWidth={2.2} aria-hidden="true" /></span>
            <span className="setup-done-label">{s.label}</span>
            <span className="setup-done-value">{s.value}</span>
          </div>
        ))}
      </div>
      <button type="button" className="setup-cta" onClick={onFinish}>
        Continue
      </button>
    </div>
  )
}
