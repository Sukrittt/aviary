'use client'

import { CurrencyPicker } from '@/src/components/CurrencyPicker'
import { CurrencyScope, useCurrency } from '@/src/context/CurrencyContext'

import { useEffect, useId, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeftIcon, CheckIcon, CopyIcon, FolderOpenIcon, PlusIcon, TagIcon, CardholderIcon } from '@/src/components/icons'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import '../../src/expense-redesign.css'

import { currentMonthKey, INCOME_CATEGORY } from '../../src/lib/envelope'
import { getBudgets, updateBudget } from '../../src/api/budgets'
import { addGroup } from '../../src/api/groups'
import { addCategory, getSplitBuckets } from '../../src/api/categories'
import { BUCKET_LABELS, BUCKET_PLURALS, bucketsOf, summarizeSplit, normName, splitEvenly, suggestSplit, unknownCategories, type BucketTags } from '../../src/lib/budgetSplit'
import { getUser, updateUser } from '../../src/api/account'
import { completeOnboarding } from '../../src/api/billing'
import { DEFAULT_ALERT_PCTS } from '../../src/lib/alerts'
import { startTimer, track } from '../../src/lib/analytics'
import { AmountTicker } from '../../src/components/onboarding/AmountTicker'
import { Confetti } from '../../src/components/onboarding/Confetti'
import { PickExtras } from '../../src/components/onboarding/PickExtras'
import { HeardFrom } from '../../src/components/onboarding/HeardFrom'
import { ImportFlow, ImportHistory, type ImportDone } from '../../src/components/onboarding/ImportFlow'
import { LoadingCaption } from '../../src/components/LoadingCaption'
import { Toast } from '../../src/components/Toast'
import { CategoryIcon, CATEGORY_ICON_COMPONENTS } from '../../src/components/CategoryIcon'
import { CategoryIconPicker } from '../../src/components/CategoryIconPicker'
import { categoryIconKey, type CategoryIconKey } from '../../src/lib/categoryIcons'
import { avatarStyleFor } from '../../src/lib/emoji'

// Twin of Mobile's app/setup.tsx: currency → income → done on a starter
// budget, or "Pick my own" for groups → categories → assign. Writes land on finish, same reasoning as mobile — groups/categories
// aren't renameable server-side until they exist. No numpad/bottom-sheet
// here: those exist on mobile because a thumb keyboard is painful, and a
// desktop already has a real one, so a plain input (under the ticker) and
// inline number fields replace them.
const QUICK_PICKS = ['30000', '50000', '75000', '100000']
// Shortest time a Finish-button save step stays on screen.
const STEP_MIN_MS = 500
// The last step holds longer so it reads as finishing, not a flash before the success screen.
const LAST_STEP_MIN_MS = 1000

interface Item {
  id: string
  /** A category's picked icon. Unset follows its name; groups always do. */
  icon?: CategoryIconKey
  name: string
  on: boolean
}

interface LiveCat {
  key: string
  groupId: string
  catId: string
  group: string
  name: string
}

let nextId = 1
const makeId = () => `setup-${nextId++}`

function defaultGroups(): Item[] {
  return [
    { id: 'g1', name: 'Essentials', on: true },
    { id: 'g2', name: 'Lifestyle', on: true },
    { id: 'g3', name: 'Savings', on: false },
  ]
}

function defaultCats(): Record<string, Item[]> {
  return {
    g1: [
      { id: makeId(), icon: 'House', name: 'Rent', on: true },
      { id: makeId(), icon: 'ShoppingCart', name: 'Groceries', on: true },
      { id: makeId(), icon: 'Lightbulb', name: 'Utilities', on: true },
      { id: makeId(), icon: 'Bus', name: 'Transport', on: false },
    ],
    g2: [
      { id: makeId(), icon: 'ForkKnife', name: 'Eating out', on: true },
      { id: makeId(), icon: 'FilmSlate', name: 'Entertainment', on: true },
      { id: makeId(), icon: 'Laptop', name: 'Software', on: false },
      { id: makeId(), icon: 'Repeat', name: 'Subscriptions', on: false },
      { id: makeId(), icon: 'ShoppingBag', name: 'Shopping', on: false },
    ],
    g3: [
      { id: makeId(), icon: 'Lifebuoy', name: 'Emergency fund', on: true },
      { id: makeId(), icon: 'ChartLineUp', name: 'Investments', on: false },
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

function selectNamedItems(items: Item[], reservedNames: string[] = []): Item[] {
  // Keep existing choices when an unchecked row has the same name.
  const names = new Set([...reservedNames, ...items.filter((g) => g.on && g.name.trim()).map((g) => g.name.trim().toLowerCase())])
  return items.map((g) => {
    const name = g.name.trim().toLowerCase()
    if (g.on && name) return g
    const on = !!name && !names.has(name)
    if (on) names.add(name)
    return { ...g, on }
  })
}

function catIcon(c: Item, group: string): CategoryIconKey {
  return c.icon ?? categoryIconKey(c.name, undefined, group)
}

async function ignoreConflict(err: unknown): Promise<void> {
  if (err instanceof Error && err.message.toLowerCase().includes('already exists')) return
  if (err instanceof Error && err.message.includes('409')) return
  throw err
}

// Analytics names for the five steps, so a funnel reads 'groups' rather than '2'.
const STEP_NAMES = ['currency', 'income', 'groups', 'categories', 'assign'] as const

const TITLES: Record<number, [string, string]> = {
  0: ['Choose your currency', 'The currency you use for your budget. You can change it later in More.'],
  1: ['What lands each month?', 'Your take-home income. This becomes the pot you assign from. Not sure yet? Skip it and add it from Home later.'],
  2: ['Group your money', 'Groups are the big buckets. Accept these or rename them to fit your life.'],
  3: ['Add your categories', 'These are the buckets you actually spend from. Pick the ones you recognize.'],
  4: ['Assign your money', 'We suggested a split based on what each category is for. Change any amount. Anything you leave waits in Ready to Assign.'],
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
  // The first question, before any step: bring data from another app, or the
  // usual setup. 'fresh' runs the steps below exactly as they always were.
  const [entry, setEntry] = useState<'ask' | 'fresh'>('ask')
  // Set by an import: where it came from, for the done screen's welcome and its live history line.
  const [imported, setImported] = useState<{ app: string | null; total: number } | null>(null)
  // Whether the user chose to pick their own groups and categories. Without
  // it, setup finishes from the income step on the starter budget.
  const [custom, setCustom] = useState(false)
  const [income, setIncome] = useState('')
  // Drive AmountTicker's roll/flash/delta animation, same as mobile: `tick`
  // replays it, `dir` picks the roll direction, `delta` (quick-pick jumps
  // only) floats a badge.
  const [tick, setTick] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [delta, setDelta] = useState(0)
  const [groups, setGroups] = useState<Item[]>(defaultGroups)
  const [groupSelectionUndo, setGroupSelectionUndo] = useState<{ selectedIds: string[]; message: string } | null>(null)
  const [cats, setCats] = useState<Record<string, Item[]>>(defaultCats)
  const [categorySelectionUndo, setCategorySelectionUndo] = useState<{ groupIds: string[]; selectedIds: string[]; message: string } | null>(null)
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [pending, setPending] = useState(false)
  // Real save progress for the Finish button: the step being written and the
  // share of writes that have landed, so a slow save visibly moves.
  const [saveStep, setSaveStep] = useState('')
  const [saveProgress, setSaveProgress] = useState(0)
  const [error, setError] = useState('')
  // Why a row couldn't be checked (no name yet, or a name another checked row
  // already has); each bump of `n` shows it as a toast.
  const [rowToast, setRowToast] = useState({ n: 0, message: '' })
  // Setup was finished on another device; this tab has nothing left to save.
  const [alreadySetUp, setAlreadySetUp] = useState(false)
  const [result, setResult] = useState<{ income: number; groupCount: number; categoryCount: number } | null>(null)

  // Timing for the onboarding funnel, same as mobile's setup.tsx: the whole
  // wizard, and each step. Refs, since no render depends on them.
  const wizardTimer = useRef<() => number>(() => 0)
  const stepTimer = useRef<() => number>(() => 0)
  // Whether the user touched the suggested split on the assign step.
  const editedSplit = useRef(false)
  // Refresh automatic suggestions after a classification retry, while an
  // explicit manual or even split stays under the person's control.
  const allocationMode = useRef<'suggested' | 'custom'>('suggested')
  // Need/want/savings tags Jev gave the user's own categories, and every name already asked about.
  const [bucketTags, setBucketTags] = useState<BucketTags>({})
  const askedBuckets = useRef(new Set<string>())

  useEffect(() => {
    wizardTimer.current = startTimer()
    track('onboarding_started')
  }, [])

  useEffect(() => {
    if (step > 4 || entry !== 'fresh') return
    stepTimer.current = startTimer()
    track('onboarding_step_viewed', { step, step_name: STEP_NAMES[step] })
  }, [step, entry])

  const selectedGroups = groups.filter((g) => g.on && g.name.trim())
  const allSelectedGroups = selectNamedItems(groups)
  const canSelectAllGroups = allSelectedGroups.some((g, i) => g.on !== groups[i].on)
  const selectedCatCount = selectedGroups.reduce(
    (n, g) => n + (cats[g.id] ?? []).filter((c) => c.on && c.name.trim()).length,
    0,
  )

  function liveCats(): LiveCat[] {
    const out: LiveCat[] = []
    selectedGroups.forEach((g) => {
      ;(cats[g.id] ?? []).forEach((c) => {
        if (c.on && c.name.trim()) out.push({ key: `${g.id}:${c.id}`, groupId: g.id, catId: c.id, group: g.name, name: c.name })
      })
    })
    return out
  }

  const assignedTotal = () => liveCats().reduce((n, c) => n + (amounts[c.key] ?? 0), 0)
  const remainder = () => (Number(income) || 0) - assignedTotal()

  function distribute(weighted: boolean, tags: BucketTags = bucketTags): Record<string, number> {
    const items = liveCats()
    const incomeValue = Number(income) || 0
    return weighted ? suggestSplit(incomeValue, items, tags) : splitEvenly(incomeValue, items.map((it) => it.key))
  }

  const openAssign = (tags: BucketTags) => {
    setAmounts((prev) => allocationMode.current === 'custom' && Object.keys(prev).length
      ? prev
      : distribute(true, tags))
    setStep(4)
  }

  // Cache successful tags; a failed or partial request can retry when the
  // user returns to this step. Failure still opens the group-name fallback.
  // With nothing new to ask, the step opens at once.
  const tagThenOpenAssign = async () => {
    const ask = unknownCategories(liveCats()).filter((c) => !askedBuckets.current.has(normName(c.name)))
    if (!ask.length) return openAssign(bucketTags)
    setSaveProgress(0)
    setSaveStep('Working out your split…')
    setPending(true)
    const received = await getSplitBuckets(ask)
    ask.forEach((c) => {
      if (received[normName(c.name)]) askedBuckets.current.add(normName(c.name))
    })
    const tags = { ...bucketTags, ...received }
    setPending(false)
    setBucketTags(tags)
    openAssign(tags)
  }

  const canAdvance = step === 0 ? true :
    step === 1
      ? true
      : step === 2
        ? selectedGroups.length > 0
        : step === 3
          ? selectedCatCount > 0
          : step === 4
            ? remainder() >= 0
            : true

  // What each step's choice was, as counts and flags. Never the income or the
  // names typed in: those are the sensitive half of this app's data.
  const stepDetails = (): Record<string, string | number | boolean> => {
    if (step === 0) return { currency: currencyCode }
    if (step === 1) return { used_quick_pick: QUICK_PICKS.includes(income), skipped_income: !(Number(income) > 0), customized: custom }
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

  const trackStepCompleted = (extra?: Record<string, boolean>) =>
    track('onboarding_step_completed', {
      step,
      step_name: STEP_NAMES[step],
      seconds_on_step: stepTimer.current(),
      ...stepDetails(),
      ...extra,
    })

  const patchGroup = (id: string, patch: Partial<Item>) => {
    setGroupSelectionUndo(null)
    setCategorySelectionUndo(null)
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }

  const selectAllGroups = () => {
    const skippedDuplicates = allSelectedGroups.some((g) => g.name.trim() && !g.on)
    setGroupSelectionUndo({
      selectedIds: selectedGroups.map((g) => g.id),
      message: skippedDuplicates ? 'Named groups selected. Duplicate names left unselected.' : 'All named groups selected.',
    })
    setGroups(allSelectedGroups)
  }

  const deselectAllGroups = () => {
    setGroupSelectionUndo({ selectedIds: selectedGroups.map((g) => g.id), message: 'All groups deselected.' })
    setGroups((gs) => gs.map((g) => ({ ...g, on: false })))
  }

  const undoGroupSelection = () => {
    if (!groupSelectionUndo) return
    const selectedIds = new Set(groupSelectionUndo.selectedIds)
    setGroups((gs) => gs.map((g) => ({ ...g, on: selectedIds.has(g.id) })))
    setGroupSelectionUndo(null)
  }

  const categorySelection = (groupId?: string) => {
    const groupIds = selectedGroups.filter((g) => !groupId || g.id === groupId).map((g) => g.id)
    const targetIds = new Set(groupIds)
    const rows = groupIds.flatMap((id) => cats[id] ?? [])
    const reservedNames = selectedGroups.filter((g) => !targetIds.has(g.id)).flatMap((g) =>
      (cats[g.id] ?? []).filter((c) => c.on && c.name.trim()).map((c) => c.name.trim().toLowerCase()),
    )
    const nextRows = selectNamedItems(rows, reservedNames)
    return {
      groupIds,
      rows,
      nextRows,
      selectedCount: rows.filter((c) => c.on && c.name.trim()).length,
      canSelectAll: nextRows.some((c, i) => c.on !== rows[i].on),
    }
  }

  const setCategorySelection = (on: boolean, groupId?: string) => {
    const { groupIds, rows, nextRows } = categorySelection(groupId)
    const scope = groupId ? ` in ${selectedGroups.find((g) => g.id === groupId)?.name.trim()}` : ''
    const skippedDuplicates = on && nextRows.some((c) => c.name.trim() && !c.on)
    setCategorySelectionUndo({
      groupIds,
      selectedIds: rows.filter((c) => c.on).map((c) => c.id),
      message: on
        ? `Named categories${scope} selected.${skippedDuplicates ? ' Duplicate names left unselected.' : ''}`
        : `All categories${scope} deselected.`,
    })
    const selectedIds = new Set(on ? nextRows.filter((c) => c.on).map((c) => c.id) : [])
    setCats((prev) => ({
      ...prev,
      ...Object.fromEntries(groupIds.map((id) => [id, (prev[id] ?? []).map((c) => ({ ...c, on: selectedIds.has(c.id) }))])),
    }))
  }

  const undoCategorySelection = () => {
    if (!categorySelectionUndo) return
    const { groupIds, selectedIds } = categorySelectionUndo
    const selected = new Set(selectedIds)
    setCats((prev) => ({
      ...prev,
      ...Object.fromEntries(groupIds.map((id) => [id, (prev[id] ?? []).map((c) => ({ ...c, on: selected.has(c.id) }))])),
    }))
    setCategorySelectionUndo(null)
  }

  const blockRow = (message: string) => setRowToast((t) => ({ n: t.n + 1, message }))
  const blockDup = (kind: 'group' | 'category', name: string) =>
    blockRow(`You've already got a ${kind} called ${name.trim()}.`)

  // Whether `name` matches another checked row. Categories compare across
  // every selected group, since they all become envelopes side by side.
  const groupDup = (id: string) => (name: string) =>
    name.trim() !== '' && groups.some((g) => g.id !== id && g.on && sameName(g.name, name))
  const catDup = (catId: string) => (name: string) =>
    name.trim() !== '' &&
    selectedGroups.some((g) => (cats[g.id] ?? []).some((c) => c.id !== catId && c.on && sameName(c.name, name)))

  const toggleGuarded = (item: Item, isDup: (name: string) => boolean, kind: 'group' | 'category'): Partial<Item> | null => {
    if (!item.on && !item.name.trim()) {
      blockRow(`Give this ${kind} a name first.`)
      return null
    }
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

  // Renaming on the assign step. A blank name keeps the old one (a nameless
  // category would drop off this step), and a clashing one keeps the old one
  // with the duplicate toast.
  const renameAssigned = (groupId: string, c: Item, name: string) => {
    const next = name.trim()
    if (!next || next === c.name.trim()) return
    if (catDup(c.id)(next)) return blockDup('category', next)
    patchCat(groupId, c.id, { name: next })
  }

  const patchCat = (groupId: string, catId: string, patch: Partial<Item>) => {
    setCategorySelectionUndo(null)
    setCats((c) => ({ ...c, [groupId]: (c[groupId] ?? []).map((cat) => (cat.id === catId ? { ...cat, ...patch } : cat)) }))
  }

  const addGroupRow = () => {
    setGroupSelectionUndo(null)
    const id = makeId()
    setGroups((gs) => [...gs, { id, name: '', on: false }])
    setCats((c) => ({ ...c, [id]: [] }))
  }

  const addCatRow = (groupId: string) => {
    setCategorySelectionUndo(null)
    setCats((c) => ({ ...c, [groupId]: [...(c[groupId] ?? []), { id: makeId(), name: '', on: false }] }))
  }

  const setAmount = (key: string, v: number) => {
    editedSplit.current = true
    allocationMode.current = 'custom'
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
    setGroupSelectionUndo(null)
    setCategorySelectionUndo(null)
    if (step > 0) track('onboarding_back_tapped', { from_step: step, step_name: STEP_NAMES[step] })
    setError('')
    // Back from the first step is back to "How do you want to start?".
    if (step === 0) setEntry('ask')
    setStep((s) => Math.max(0, s - 1))
  }

  const commit = async (amounts: Record<string, number>) => {
    if (pending) return
    setPending(true)
    setError('')
    const incomeValue = Math.round(Number(income)) || 0
    const categories = selectedGroups.flatMap((g) =>
      (cats[g.id] ?? []).filter((c) => c.on && c.name.trim()).map((c) => ({ name: c.name.trim(), group: g.name.trim(), icon: catIcon(c, g.name) })),
    )
    const categoryCount = categories.length
    const finishSetup = (recoveredAfterError = false) => {
      trackStepCompleted()
      track('onboarding_completed', {
        total_seconds: wizardTimer.current(),
        groups_count: selectedGroups.length,
        categories_count: categoryCount,
        currency: currencyCode,
        customized: custom,
        skipped_income: incomeValue === 0,
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
    setSaveStep('Creating your categories…')
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
      // Setup may have been finished on another device while this tab sat in
      // the wizard. Writing now would lay a second budget over it.
      const me = await getUser()
      if (me.onboardedAt) {
        qc.setQueryData(['user'], me)
        setAlreadySetUp(true)
        return
      }
      const month = currentMonthKey()
      const budgetVersions = new Map(
        (await getBudgets()).map((row) => [`${row.month}\u0000${row.category}`, row.version]),
      )
      const versionFor = (category: string) => budgetVersions.get(`${month}\u0000${category}`) ?? 0
      // Keep ordering within each collection while independent writes run
      // together, matching mobile. Completion waits for every setup write.
      await Promise.all([
        (async () => {
          for (const g of selectedGroups) await addGroup(g.name.trim()).catch(ignoreConflict).then(tick)
        })(),
        (async () => {
          for (const c of categories) await addCategory(c.name, c.group, c.icon).catch(ignoreConflict).then(tick)
        })(),
        updateBudget(month, INCOME_CATEGORY, { assigned: String(incomeValue), rolled_over: '0' }, versionFor(INCOME_CATEGORY)).then(tick),
        ...live.map((item) => {
          const catLabel = item.name.trim()
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

  // The step that saves reports itself once the save lands (see commit).
  const next = () => {
    if (!canAdvance || pending) return
    setGroupSelectionUndo(null)
    setCategorySelectionUndo(null)
    const hasIncome = Number(income) > 0
    if (step === 1 && !custom) {
      // Starter budget: the pre-checked defaults, income split the suggested way.
      void commit(hasIncome ? distribute(true) : {})
      return
    }
    if (step === 3 && !hasIncome) {
      // Nothing to assign, so there's no assign step to show.
      void commit({})
      return
    }
    if (step === 4) {
      void commit(amounts)
      return
    }
    trackStepCompleted()
    if (step === 3) {
      void tagThenOpenAssign()
      return
    }
    setStep((s) => s + 1)
  }

  const pickOwn = () => {
    if (pending) return
    setCustom(true)
    trackStepCompleted({ customized: true })
    setStep(2)
  }

  // An import sets the account up on the server in one call, then lands on the same celebration.
  const onImported = ({ result: r, currency, app }: ImportDone) => {
    onCurrencyChange(currency)
    track('onboarding_completed', {
      total_seconds: wizardTimer.current(),
      groups_count: r.groupCount,
      categories_count: r.categoryCount,
      currency,
      imported: true,
      skipped_income: r.income === 0,
    })
    void qc.invalidateQueries()
    setResult({ income: r.income, groupCount: r.groupCount, categoryCount: r.categoryCount })
    setImported({ app, total: r.total })
    setStep(5)
  }

  if (alreadySetUp) {
    return (
      <div className="expense-redesign setup-page">
        <div className="setup-done">
          <div className="setup-done-badge"><CheckIcon size={30} weight="bold" aria-hidden="true" /></div>
          <h1 className="setup-done-title">You’re already set up</h1>
          <p className="setup-done-blurb">You finished setup on another device, so your budget is waiting.</p>
          <button type="button" className="setup-cta" onClick={() => router.replace('/expense')}>Go to my budget</button>
        </div>
      </div>
    )
  }

  if (entry === 'ask' && step < 5) {
    return (
      <div className="expense-redesign setup-page">
        <ImportFlow onFresh={() => setEntry('fresh')} onDone={onImported} onAlreadySetUp={() => setAlreadySetUp(true)} />
      </div>
    )
  }

  if (step === 5 && result) {
    return (
      <div className="expense-redesign setup-page">
        <SetupDone result={result} imported={imported} onFinish={() => setStep(6)} />
      </div>
    )
  }

  if (step === 6) {
    return (
      <div className="expense-redesign setup-page">
        <PickExtras onDone={() => setStep(7)} />
      </div>
    )
  }

  if (step === 7) {
    return (
      <div className="expense-redesign setup-page">
        <HeardFrom onDone={() => router.replace('/expense')} />
      </div>
    )
  }

  const [title, blurb] = TITLES[step]
  const rem = remainder()
  // Need/want/savings per category, labelled on the assign step so the suggested split explains itself.
  const buckets = bucketsOf(liveCats(), bucketTags)
  const summary = summarizeSplit(liveCats(), bucketTags)
  const hint = step === 0 ? '' :
    step === 1
      ? Number(income) > 0
        ? ''
        : 'You can add it from Home any time'
      : step === 2
        ? canAdvance
          ? `${selectedGroups.length} groups selected`
          : 'Select at least one group to continue'
        : step === 3
          ? canAdvance
            ? `${selectedCatCount} categories across ${selectedGroups.length} groups`
            : 'Select at least one category to continue'
          : rem === 0
            ? 'Everything assigned'
            : rem > 0
              ? `${formatMoney(rem)} left. It'll wait in Ready to Assign`
              : `${formatMoney(-rem)} over your income`

  const finishesHere = (step === 1 && !custom) || step === 4 || (step === 3 && !(Number(income) > 0))
  const ctaLabel = step === 1 && !(Number(income) > 0) ? 'Skip for now' : finishesHere ? 'Finish setup' : 'Continue'
  const dots = custom ? [0, 1, 2, 3, 4] : [0, 1]

  const remState = rem === 0 ? 'is-zero' : rem < 0 ? 'is-over' : 'is-under'
  const remLabel = rem === 0 ? 'All assigned' : rem < 0 ? 'Over by' : 'Left to assign'

  return (
    <div className="expense-redesign setup-page">
      <div className="setup-top">
        <button type="button" className="setup-back" onClick={back} aria-label="Back">
          <ArrowLeftIcon size={16} aria-hidden="true" />
        </button>
        <div className="setup-dots" role="img" aria-label={`Step ${step + 1} of ${dots.length}`}>
          {dots.map((n) => (
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
        <div className="setup-body setup-groups-body">
          <div className="setup-selection-toolbar" role="group" aria-label="Group selection">
            <p className="setup-selection-count" aria-live="polite" aria-atomic="true">
              {selectedGroups.length} {selectedGroups.length === 1 ? 'group' : 'groups'} selected
            </p>
            <div className="setup-selection-actions">
              <button type="button" className="setup-selection-action" onClick={selectAllGroups} disabled={!canSelectAllGroups}>Select all</button>
              <button type="button" className="setup-selection-action" onClick={deselectAllGroups} disabled={selectedGroups.length === 0}>Deselect all</button>
            </div>
            {groupSelectionUndo && (
              <div className="setup-selection-feedback">
                <span role="status">{groupSelectionUndo.message}</span>
                <button type="button" className="setup-selection-action" onClick={undoGroupSelection} aria-label="Undo group selection">Undo</button>
              </div>
            )}
          </div>
          <div className="setup-row-list">
            {groups.map((g) => (
              <PickRow
                key={g.id}
                name={g.name}
                on={g.on}
                placeholder="Group name"
                incompleteHint={!g.name.trim() ? 'Name to select' : undefined}
                onChangeName={(name) => renameGroup(g, name)}
                onToggle={() => toggleGroup(g)}
              />
            ))}
            <button type="button" className="setup-add-row" onClick={addGroupRow}>
              <PlusIcon size={16} aria-hidden="true" /> Add your own group
            </button>
            <p className="setup-micro-hint">click a name to rename it</p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="setup-body setup-groups-body">
          <div className="setup-selection-toolbar" role="group" aria-label="Category selection">
            <p className="setup-selection-count" aria-live="polite" aria-atomic="true">
              {selectedCatCount} {selectedCatCount === 1 ? 'category' : 'categories'} selected
            </p>
            <div className="setup-selection-actions">
              <button type="button" className="setup-selection-action" onClick={() => setCategorySelection(true)} disabled={!categorySelection().canSelectAll}>Select all</button>
              <button type="button" className="setup-selection-action" onClick={() => setCategorySelection(false)} disabled={selectedCatCount === 0}>Deselect all</button>
            </div>
            {categorySelectionUndo && (
              <div className="setup-selection-feedback">
                <span role="status">{categorySelectionUndo.message}</span>
                <button type="button" className="setup-selection-action" onClick={undoCategorySelection} aria-label="Undo category selection">Undo</button>
              </div>
            )}
          </div>
          <div className="setup-section-list">
            {selectedGroups.map((g) => {
              const rows = cats[g.id] ?? []
              const selection = categorySelection(g.id)
              return (
                <div key={g.id} className="setup-section">
                  <div className="setup-section-header">
                    <CategoryIcon kind="group" name={g.name} />
                    <span className="setup-section-title">{g.name.toUpperCase()}</span>
                    <span className="setup-section-count">{selection.selectedCount} picked</span>
                  </div>
                  <div className="setup-selection-actions" role="group" aria-label={`Category selection for ${g.name.trim()}`}>
                    <button type="button" className="setup-selection-action" onClick={() => setCategorySelection(true, g.id)} disabled={!selection.canSelectAll}>Select all</button>
                    <button type="button" className="setup-selection-action" onClick={() => setCategorySelection(false, g.id)} disabled={selection.selectedCount === 0}>Deselect all</button>
                  </div>
                  <div className="setup-section-rows">
                    {rows.map((c) => (
                      <PickRow
                        key={c.id}
                        icon={catIcon(c, g.name)}
                        name={c.name}
                        on={c.on}
                        placeholder="Category name"
                        incompleteHint={!c.name.trim() ? 'Name to select' : undefined}
                        onPickIcon={(icon) => patchCat(g.id, c.id, { icon })}
                        onChangeName={(name) => renameCat(g.id, c, name)}
                        onToggle={() => toggleCat(g.id, c)}
                      />
                    ))}
                  </div>
                  <button type="button" className="setup-add-pill" onClick={() => addCatRow(g.id)}>
                    <PlusIcon size={14} aria-hidden="true" /> Add category
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
        </div>
      )}

      {step === 4 && (
        <div className="setup-body">
          <div className={`setup-rem-chip ${remState}`}>
            <span className="setup-rem-label">{remLabel}</span>
            <span className="setup-rem-value">{formatMoney(Math.abs(rem))}</span>
          </div>
          <div className="setup-split-row">
            <motion.button whileTap={reduceMotion ? undefined : { scale: 0.97 }} type="button" className="setup-split-btn" onClick={() => {
              allocationMode.current = 'suggested'
              setAmounts(distribute(true))
            }}>
              Suggested split
            </motion.button>
            <motion.button whileTap={reduceMotion ? undefined : { scale: 0.97 }} type="button" className="setup-split-btn" onClick={() => {
              allocationMode.current = 'custom'
              editedSplit.current = true
              setAmounts(distribute(false))
            }}>
              Split evenly
            </motion.button>
          </div>
          {summary && (
            <p className="setup-split-why">
              <span>Suggested split:</span>
              {summary.map((s) => (
                <span key={s.bucket} className="setup-split-key">
                  <span className={`setup-split-dot is-${s.bucket}`} aria-hidden="true" />
                  {BUCKET_PLURALS[s.bucket]} {s.pct}%
                </span>
              ))}
            </p>
          )}
          <div className="setup-section-list">
            {selectedGroups.map((g) => {
              const rows = (cats[g.id] ?? []).filter((c) => c.on && c.name.trim())
              const subtotal = rows.reduce((n, c) => n + (amounts[`${g.id}:${c.id}`] ?? 0), 0)
              return (
                <div key={g.id} className="setup-section">
                  <div className="setup-section-header">
                    <CategoryIcon kind="group" name={g.name} />
                    <span className="setup-section-title">{g.name.toUpperCase()}</span>
                    <span className="setup-section-subtotal">{formatMoney(subtotal)}</span>
                  </div>
                  {rows.map((c) => {
                    const key = `${g.id}:${c.id}`
                    const v = amounts[key] ?? 0
                    const Icon = CATEGORY_ICON_COMPONENTS[catIcon(c, g.name)]
                    return (
                      <div key={c.id} className="setup-assign-row">
                        <span className="setup-assign-emoji" style={avatarStyleFor(c.name.trim())} aria-hidden="true">
                          <Icon size={18} />
                        </span>
                        <AssignName name={c.name} onCommit={(name) => renameAssigned(g.id, c, name)} />
                        <span className={`setup-assign-bucket is-${buckets[key]}`}>{BUCKET_LABELS[buckets[key]]}</span>
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

      <Toast trigger={rowToast.n} message={rowToast.message} icon={CopyIcon} />

      {error !== '' && <p className="setup-error">{error}</p>}

      <button
        type="button"
        className={`setup-cta${pending ? ' is-saving' : ''}`}
        disabled={!canAdvance || pending}
        aria-busy={pending}
        onClick={next}
        style={pending ? ({ '--save-progress': saveProgress } as React.CSSProperties) : undefined}
      >
        {pending ? (
          <LoadingCaption phrases={[saveStep || 'Saving…']} placement="inline" align="center" className="setup-cta-caption" />
        ) : ctaLabel}
      </button>
      {error === '' && <p className="setup-cta-hint">{hint}</p>}
      {step === 1 && !custom && (
        <button type="button" className="setup-pick-own" onClick={pickOwn} disabled={pending}>
          Pick my own groups and categories
        </button>
      )}
    </div>
  )
}

// The assign step's category name: reads as a label, edits in place, and only
// hands the new name up on blur or Enter (Esc throws the edit away).
function AssignName({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="text"
      className="setup-assign-name"
      aria-label={`Rename ${name}`}
      value={draft ?? name}
      onFocus={() => setDraft(name)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(draft)
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

// A group or category row. Categories get the icon picker beside their name;
// groups have no stored icon, so theirs just follows the name.
function PickRow({
  icon,
  name,
  on,
  placeholder,
  incompleteHint,
  onPickIcon,
  onChangeName,
  onToggle,
}: {
  icon?: CategoryIconKey
  name: string
  on: boolean
  placeholder: string
  incompleteHint?: string
  onPickIcon?: (icon: CategoryIconKey) => void
  onChangeName: (name: string) => void
  onToggle: () => void
}) {
  const nameHintId = useId()
  const tint = avatarStyleFor(name.trim())
  const fields = (
    <>
      <input
        type="text"
        className="setup-pick-input"
        placeholder={placeholder}
        aria-describedby={incompleteHint ? nameHintId : undefined}
        // Rows only mount empty when just added: focus them, which also
        // scrolls them into view inside a scrolling category column.
        autoFocus={name === ''}
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
      />
      {incompleteHint && <span id={nameHintId} className="setup-pick-name-hint">{incompleteHint}</span>}
      <button type="button" className={`setup-pick-check ${on ? 'is-on' : ''}`} onClick={onToggle} role="checkbox" aria-checked={on} aria-describedby={incompleteHint ? nameHintId : undefined} aria-label={`${on ? 'Deselect' : 'Select'} ${name || placeholder}`}>
        <CheckIcon size={16} weight="bold" aria-hidden="true" className="setup-pick-check-icon" />
      </button>
    </>
  )

  return (
    <div className={`setup-pick-row ${on ? 'is-on' : ''} ${incompleteHint ? 'is-incomplete' : ''}`}>
      {icon && onPickIcon ? (
        // The picker lays its tile out beside the name fields.
        <div style={{ flex: 1, minWidth: 0 }}>
          <CategoryIconPicker value={icon} onChange={onPickIcon} tint={tint}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>{fields}</div>
          </CategoryIconPicker>
        </div>
      ) : (
        <>
          <span className="setup-pick-emoji" style={{ ...tint, cursor: 'default' }} aria-hidden="true">
            <CategoryIcon kind="group" name={name} size={18} />
          </span>
          {fields}
        </>
      )}
    </div>
  )
}

function SetupDone({
  result,
  imported = null,
  onFinish,
}: {
  result: { income: number; groupCount: number; categoryCount: number }
  /** Set after an import: its transactions are still being booked behind the celebration. */
  imported?: { app: string | null; total: number } | null
  onFinish: () => void
}) {
  const { formatMoney } = useCurrency()

  const summary = [
    { icon: CardholderIcon, label: 'Monthly income', value: result.income > 0 ? formatMoney(result.income) : 'Add it later' },
    { icon: FolderOpenIcon, label: 'Groups', value: String(result.groupCount) },
    { icon: TagIcon, label: 'Categories', value: String(result.categoryCount) },
  ]

  return (
    <div className="setup-done">
      <Confetti />
      <div className="setup-done-badge"><CheckIcon size={30} weight="bold" aria-hidden="true" /></div>
      <h1 className="setup-done-title">{imported?.app ? `Welcome over from ${imported.app}.` : imported ? 'Your history has moved in.' : 'Your budget is ready to go.'}</h1>
      <p className="setup-done-blurb">
        {imported ? 'Your envelopes, accounts and payday are set up from it. Change anything later from Categories.' : 'Everything below can be changed later from Categories.'}
      </p>
      {imported && imported.total > 0 && <ImportHistory total={imported.total} />}
      <p className="setup-done-promise">Your first-week recap lands in 7 days</p>
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
