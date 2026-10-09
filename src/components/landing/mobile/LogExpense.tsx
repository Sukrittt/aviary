'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { ChevronDown, MessageSquareText } from 'lucide-react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { categoryEmoji, groupEmoji, splitEmoji } from '@/src/lib/emoji'
import { formatDateTimeLong } from '@/src/lib/format'
import type { ThemeTokens } from '@/src/theme/tokens'
import {
  AmountText,
  BottomSheet,
  Button,
  Chip,
  NAV_HEIGHT,
  Numpad,
  PHONE,
  T,
  col,
  ease,
  font,
  pressable,
  radius,
  row,
  space,
  type,
  useAmountEntry,
} from './kit'
import { DAYS_LEFT, WORDS, toEnvelope, type DemoCategory } from './demo'
import { AutoCategoryPill } from './AutoCategoryPill'
import { chime } from '../LandingClient'
import { CaptureTipBubble } from './CaptureTipBubble'
import { evaluateAmount, formatExpression, hasOperator } from '@/src/lib/calcAmount'

/** Twins of Mobile's app/modals/log-expense.tsx, expense-added.tsx, CategoryPickerSheet and DeltaBar. */

export interface SubmitState {
  canSubmit: boolean
  saving: boolean
  success: boolean
  submit: () => void
}

export const EMPTY_SUBMIT: SubmitState = { canSubmit: false, saving: false, success: false, submit: () => {} }

export interface LoggedExpense {
  item: string
  amount: number
  category: string
  loggedAt: string
}

/** Stands in for the POST round-trip, so the nav circle's load phase gets seen. */
const FAKE_SAVE_MS = 900
/** Stands in for Mobile's AI lookup, so the pill's reel gets a beat to spin. */
const FAKE_LOOKUP_MS = 900

function suggestCategory(item: string, categories: string[]): string {
  if (!item.trim()) return ''
  const matched = new Map<string, number>()
  for (const word of item.toLowerCase().split(/\s+/)) {
    if (word.length < 2) continue
    const cat = WORDS[word]
    if (cat && categories.includes(cat)) matched.set(cat, (matched.get(cat) ?? 0) + 1)
  }
  let best = ''
  let bestScore = 0
  for (const [cat, score] of matched) {
    if (score > bestScore) {
      best = cat
      bestScore = score
    }
  }
  return best
}

const ON_ACCENT_DIM = 'rgba(255, 255, 255, 0.7)'
const FIELD_BG = 'rgba(255, 255, 255, 0.16)'

export function LogExpenseScreen({
  categories,
  groups,
  prefill,
  publish,
  onAdded,
  onSeveral,
  tip,
}: {
  categories: DemoCategory[]
  groups: string[]
  prefill?: LoggedExpense | null
  publish: (state: SubmitState) => void
  onAdded: (expense: LoggedExpense) => void
  /** The header's chat icon: Mobile opens Ask Aviary to type several spends at once. */
  onSeveral: () => void
  /** Mobile's batch capture tip, off the chat icon. */
  tip?: { body: string; onTry: () => void; onDismiss: () => void } | null
}) {
  const { formatAmountInput } = useCurrency()

  // `expr` is what was typed, maybe a sum ("5+5"); `amount` is its total.
  const { amount: expr, setAmount, pushDigit, handleBackspace, shakeRef } = useAmountEntry(
    prefill ? String(prefill.amount) : '',
  )
  const amount = hasOperator(expr) ? String(evaluateAmount(expr)) : expr
  const [item, setItem] = useState(prefill?.item ?? '')
  const [category, setCategory] = useState(prefill?.category ?? '')
  const [categoryTouched, setCategoryTouched] = useState(!!prefill?.category)
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'credit_card'>('bank')
  const [saving, setSaving] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pending = useRef<LoggedExpense | null>(null)

  const [thinking, setThinking] = useState(false)
  useEffect(() => {
    if (categoryTouched || !item.trim()) return
    let lookup = 0
    const timer = setTimeout(() => {
      const suggested = suggestCategory(
        item,
        categories.map((c) => c.name),
      )
      if (!suggested || suggested === category) return
      setThinking(true)
      lookup = window.setTimeout(() => {
        setCategory(suggested)
        setThinking(false)
      }, FAKE_LOOKUP_MS)
    }, 300)
    return () => {
      clearTimeout(timer)
      clearTimeout(lookup)
      setThinking(false)
    }
    // Re-runs per keystroke only; the current pick is read at lookup time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, categories, categoryTouched])

  const selectedCategory = categories.find((c) => c.name === category)
  const rollEmojis = useMemo(() => categories.map((c) => categoryEmoji(c.name, c.group)), [categories])
  const parsedAmount = Number(amount)
  // "What was it for?" is optional: left blank, the row is named after its category.
  const canSubmit = category !== '' && !Number.isNaN(parsedAmount) && parsedAmount > 0

  // Let the nav circle's ripple -> tick (~950ms) finish before the success screen replaces this one.
  useEffect(() => {
    if (!logSuccess || !pending.current) return
    const expense = pending.current
    const timer = setTimeout(() => onAdded(expense), 950)
    return () => clearTimeout(timer)
  }, [logSuccess, onAdded])

  useEffect(() => {
    if (!saving) return
    const timer = setTimeout(() => {
      setSaving(false)
      setLogSuccess(true)
    }, FAKE_SAVE_MS)
    return () => clearTimeout(timer)
  }, [saving])

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return
    pending.current = { item: item.trim() || splitEmoji(category).text, amount: parsedAmount, category, loggedAt: new Date().toISOString() }
    setSaving(true)
  }, [canSubmit, item, parsedAmount, category])

  useEffect(() => {
    publish({ canSubmit, saving, success: logSuccess, submit: handleSubmit })
  }, [canSubmit, saving, logSuccess, handleSubmit, publish])
  useEffect(() => () => publish(EMPTY_SUBMIT), [publish])

  return (
    <div style={{ ...col, height: '100%', background: T.accent, position: 'relative' }}>
      <div style={{ ...row, justifyContent: 'center', paddingTop: PHONE.top + space.sm, paddingInline: space.lg, paddingBottom: 8 }}>
        <span style={{ color: '#ffffff', ...font.displaySemiBold, fontSize: type.bodyLg }}>Log expense</span>
      </div>
      <button type="button" className="m-several" onClick={onSeveral} aria-label="Log several spends at once"
        style={{ ...pressable, ...row, justifyContent: 'center', position: 'absolute', left: space.lg, top: PHONE.top + space.xs, width: 36, height: 36, borderRadius: 18, background: FIELD_BG }}>
        <MessageSquareText size={18} color="#ffffff" />
      </button>
      {tip && <CaptureTipBubble anchor={{ top: PHONE.top + space.xs, left: space.lg, size: 36 }} title="Logging a few?" body={tip.body} onTry={tip.onTry} onDismiss={tip.onDismiss} />}

      <div style={{ ...col, flex: 1, paddingTop: 8, paddingInline: space.lg }}>
        <div style={{ ...col, flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
          <div ref={shakeRef}>
            <AmountText
              value={parsedAmount || 0}
              rawText={formatAmountInput(amount)}
              size={type.hero * 1.3}
              color={amount === '' ? ON_ACCENT_DIM : '#ffffff'}
              weight="displayBold"
              animate
            />
          </div>
          {hasOperator(expr) && <span style={{ color: ON_ACCENT_DIM, ...font.bodySemiBold, fontSize: type.caption }}>{formatExpression(expr)}</span>}
          <button type="button" onClick={() => setShowMore(true)} style={{ ...pressable, ...row, gap: space.xs }}>
            <span style={{ color: ON_ACCENT_DIM, ...font.bodySemiBold, fontSize: type.caption }}>More</span>
            <ChevronDown size={16} color={ON_ACCENT_DIM} />
          </button>
        </div>
      </div>

      <div
        style={{
          ...col,
          paddingInline: space.lg,
          paddingBottom: NAV_HEIGHT + PHONE.bottom + space.lg,
          gap: space.md,
        }}
      >
        <div style={{ position: 'relative' }}>
          <input
            className="m-input m-input-accent"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="What was it for?"
            style={{
              width: '100%',
              padding: 14,
              paddingRight: 150,
              background: FIELD_BG,
              borderRadius: radius.md,
              color: '#ffffff',
              ...font.bodySemiBold,
              fontSize: type.bodyLg,
            }}
          />
          <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
            <AutoCategoryPill
              selected={selectedCategory ? { emoji: categoryEmoji(selectedCategory.name, selectedCategory.group), name: splitEmoji(selectedCategory.name).text } : null}
              thinking={thinking}
              rollEmojis={rollEmojis}
              onPress={() => setPickerOpen(true)}
            />
          </div>
        </div>

        <Numpad onDigit={pushDigit} onBackspace={handleBackspace} onClear={() => setAmount('')} calculator />
      </div>

      <CategoryPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={category}
        categories={categories}
        groups={groups}
        onSelect={(c) => {
          setCategory(c)
          setCategoryTouched(true)
        }}
        title="Choose a category"
        noneLabel="No category"
      />

      <BottomSheet visible={showMore} onClose={() => setShowMore(false)}>
        <div style={{ color: T.text, ...font.displaySemiBold, fontSize: type.bodyLg, marginBottom: 12 }}>More details</div>
        <div style={{ ...col, gap: space.lg }}>
          <div style={{ ...col, gap: space.sm }}>
            <span style={fieldLabel}>Payment Method</span>
            <div style={{ ...row, gap: space.sm }}>
              {(['bank', 'credit_card'] as const).map((m) => (
                <Chip
                  key={m}
                  selected={paymentMethod === m}
                  label={m === 'bank' ? 'Bank/UPI' : 'Credit Card'}
                  onPress={() => setPaymentMethod(m)}
                />
              ))}
            </div>
          </div>
          <div style={{ ...col, gap: space.sm }}>
            <span style={fieldLabel}>Notes (optional)</span>
            <input
              className="m-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              style={{
                padding: 14,
                background: T.inputBg,
                borderRadius: radius.md,
                color: T.text,
                ...font.bodyMedium,
                fontSize: type.body,
              }}
            />
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

const fieldLabel: CSSProperties = { color: T.text3, ...font.bodySemiBold, fontSize: 12 }

// ─── CategoryPickerSheet ─────────────────────────────────────────────────────

const RECENTS_MIN_CATEGORIES = 8
const MAX_RECENT_SHOWN = 6

function CategoryPickerSheet({
  visible,
  onClose,
  value,
  onSelect,
  categories,
  groups,
  noneLabel,
  title,
}: {
  visible: boolean
  onClose: () => void
  value: string
  onSelect: (category: string) => void
  categories: DemoCategory[]
  groups: string[]
  noneLabel: string
  title: string
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups
      .map((g) => ({
        name: g,
        items: categories.filter((c) => c.group === g && (!q || c.name.toLowerCase().includes(q))),
      }))
      .filter((g) => g.items.length > 0)
  }, [categories, groups, search])

  // Seeded from expense history, the way a fresh install's picker is.
  const recents = [...categories]
    .filter((c) => c.spent > 0)
    .sort((a, b) => a.lastSpentDaysAgo - b.lastSpentDaysAgo)
    .slice(0, MAX_RECENT_SHOWN)
  const showRecents = !search.trim() && categories.length >= RECENTS_MIN_CATEGORIES && recents.length > 0

  function pick(category: string) {
    onSelect(category)
    setSearch('')
    onClose()
  }

  const option = (selected: boolean): CSSProperties => ({
    ...pressable,
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '12px 8px',
    borderRadius: 12,
    background: selected ? T.chipActiveBg : 'transparent',
  })
  const groupLabel: CSSProperties = {
    color: T.text3,
    ...font.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 2,
    paddingInline: 8,
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        onClose()
        setSearch('')
      }}
    >
      <div
        style={{
          color: T.text2,
          ...font.bodySemiBold,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 8,
          textAlign: 'center',
        }}
      >
        {title}
      </div>
      <input
        className="m-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search categories…"
        style={{
          width: '100%',
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: '10px 14px',
          fontSize: 13,
          marginBottom: 8,
          background: T.inputBg,
          color: T.text,
          ...font.bodyMedium,
        }}
      />
      <div className="m-noscroll" style={{ height: 420, overflowY: 'auto' }}>
        <button type="button" style={{ ...option(value === ''), borderBottom: `1px solid ${T.border}` }} onClick={() => pick('')}>
          <span style={{ color: T.text, ...font.bodySemiBold, fontSize: 14 }}>{noneLabel}</span>
        </button>
        {showRecents && (
          <div style={{ marginBottom: 4 }}>
            <div style={groupLabel}>Recently used</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingInline: 8 }}>
              {recents.map((c) => (
                <Chip
                  key={c.name}
                  selected={value === c.name}
                  icon={categoryEmoji(c.name, c.group)}
                  label={splitEmoji(c.name).text}
                  onPress={() => pick(c.name)}
                />
              ))}
            </div>
          </div>
        )}
        {filtered.map((group) => (
          <div key={group.name}>
            <div style={groupLabel}>
              {groupEmoji(group.name)} {splitEmoji(group.name).text}
            </div>
            <div style={{ borderLeft: `0.5px solid ${T.border}`, marginLeft: 8, paddingLeft: 4 }}>
              {group.items.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  style={{ ...option(value === c.name), borderTop: i > 0 ? `0.5px solid ${T.border}` : 'none' }}
                  onClick={() => pick(c.name)}
                >
                  <span style={{ color: T.text, ...font.bodyMedium, fontSize: 14 }}>
                    {categoryEmoji(c.name, group.name)} {splitEmoji(c.name).text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {search.trim() && filtered.length === 0 && (
          <div style={{ color: T.text3, ...font.bodyMedium, textAlign: 'center', paddingTop: 32 }}>No categories found</div>
        )}
      </div>
    </BottomSheet>
  )
}

// ─── ProgressBar colour thresholds ───────────────────────────────────────────

const THRESHOLDS = [75, 90, 100]

export function fillColor(pct: number, tokens: ThemeTokens): string {
  return pct === 100 ? tokens.text3 : pct > 90 ? tokens.coral : pct > 75 ? tokens.warn : tokens.mint
}

function fillSoftColor(pct: number, tokens: ThemeTokens): string {
  return pct === 100 ? tokens.borderStrong : pct > 90 ? tokens.coralSoft : pct > 75 ? tokens.warnSoft : tokens.mintSoft
}

function colorStops(from: number, to: number, colorAt: (pct: number) => string) {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const input = [lo, ...THRESHOLDS.filter((t) => t > lo && t < hi), hi]
  return { input, output: input.map(colorAt) }
}

/** A colour that crosses each threshold as `progress` does, instead of starting at its end state. */
function useStopColor(progress: MotionValue<number>, from: number, to: number, colorAt: (pct: number) => string) {
  const { input, output } = colorStops(from, to, colorAt)
  const moving = to > from
  return useTransform(progress, moving ? input : [0, 1], moving ? output : [colorAt(to), colorAt(to)])
}

// ─── DeltaBar ────────────────────────────────────────────────────────────────

const clamp = (n: number) => Math.max(0, Math.min(100, n))
const MIN_DELTA_PCT = 2.4
const BASE_DELAY = 500
const BASE_DURATION = 1000
export const DELTA_DELAY = BASE_DELAY + BASE_DURATION + 500
const DELTA_DURATION = 1000
const DELTA_EASE = [0.65, 0, 0.75, 1] as const
const SNAP_EASE = [0.2, 0.9, 0.25, 1] as const
const s = (ms: number) => ms / 1000

/** Base fill grows to the pre-expense spot, a marker pins it, then the delta eases in on top. */
/** `tokens` defaults to the landing page's light scheme; the app passes the live theme. */
/** `pace` scales every delay and duration (0.5 = twice as fast); Mobile's timings are 1. */
export function DeltaBar({
  from,
  to,
  amount,
  tokens = T,
  pace = 1,
}: {
  from: number
  to: number
  amount: number
  tokens?: ThemeTokens
  pace?: number
}) {
  const { formatMoney } = useCurrency()

  const fromPct = clamp(from)
  const toPct = clamp(to)
  const deltaPct = Math.max(toPct - fromPct, MIN_DELTA_PCT)
  const progress = useMotionValue(fromPct)
  const fill = useStopColor(progress, fromPct, toPct, (p) => fillColor(p, tokens))
  const tag = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controls = animate(progress, toPct, { delay: s(DELTA_DELAY * pace), duration: s(DELTA_DURATION * pace), ease: DELTA_EASE })
    return () => controls.stop()
  }, [progress, toPct, pace])

  // Clamp the pill inside the track once its own width is known.
  useLayoutEffect(() => {
    const el = tag.current
    if (el) el.style.left = `min(${fromPct}%, calc(100% - ${el.offsetWidth}px))`
  }, [fromPct, amount])

  const segment: CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 100,
    overflow: 'hidden',
    transformOrigin: 'left',
  }

  return (
    <div>
      <div style={{ height: 8, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 100, overflow: 'hidden', background: tokens.borderStrong }}>
          <motion.div
            style={{ ...segment, left: 0, width: `${fromPct}%`, opacity: 0.55 }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: s(BASE_DELAY * pace), duration: s(BASE_DURATION * pace), ease: DELTA_EASE }}
          >
            <motion.div style={{ position: 'absolute', inset: 0, background: fill }} />
          </motion.div>
          <motion.div
            style={{ ...segment, left: `${fromPct}%`, width: `${deltaPct}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: s(DELTA_DELAY * pace), duration: s(DELTA_DURATION * pace), ease: DELTA_EASE }}
          >
            <motion.div style={{ position: 'absolute', inset: 0, background: fill }} />
          </motion.div>
        </div>
        <motion.div
          style={{
            position: 'absolute',
            top: -6,
            left: `${fromPct}%`,
            width: 2,
            height: 20,
            borderRadius: 2,
            opacity: 0.85,
            background: tokens.text,
          }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: s(DELTA_DELAY * pace), duration: 0.3 * pace, ease: SNAP_EASE }}
        />
      </div>
      <div style={{ height: 22, marginTop: space.xs, position: 'relative' }}>
        <motion.div
          ref={tag}
          style={{ position: 'absolute', maxWidth: '100%' }}
          initial={{ opacity: 0, x: 4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: s((DELTA_DELAY + 300) * pace), duration: 0.34 * pace, ease: SNAP_EASE }}
        >
          <motion.div style={{ background: fill, borderRadius: radius.full, padding: '4px 9px', whiteSpace: 'nowrap' }}>
            <span style={{ color: tokens.bg, ...font.bodySemiBold, fontSize: type.caption }}>
              {`+${formatMoney(Math.round(amount))}`}
            </span>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

// ─── ExpenseAddedScreen ──────────────────────────────────────────────────────

export const STAGGER = { headline: 220, detail: 300, card: 380, footer: 560, cardFooter: DELTA_DELAY + DELTA_DURATION + 150 }

/** Reanimated FadeInDown: drops 25px into place while fading in. */
export function FadeInDown({ delay, duration, style, className, children }: { delay: number; duration: number; style?: CSSProperties; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: -25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: s(delay), duration: s(duration), ease: ease.inOutQuad }}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedUsedPercentage({
  from,
  to,
  categoryName,
  tokens = T,
  pace = 1,
}: {
  from: number
  to: number
  categoryName: string
  tokens?: ThemeTokens
  pace?: number
}) {
  const progress = useMotionValue(from)
  const foreground = useStopColor(progress, from, to, (p) => fillColor(p, tokens))
  const background = useStopColor(progress, from, to, (p) => fillSoftColor(p, tokens))
  const label = useTransform(progress, (v) => `${Math.round(v)}% used`)

  useEffect(() => {
    const controls = animate(progress, to, { delay: s(DELTA_DELAY * pace), duration: s(DELTA_DURATION * pace), ease: DELTA_EASE })
    return () => controls.stop()
  }, [progress, to, pace])

  return (
    <div style={{ ...row, justifyContent: 'space-between' }}>
      <div style={{ ...row, gap: space.xs, minWidth: 0 }}>
        <motion.div style={{ width: 8, height: 8, borderRadius: 4, background: foreground, flexShrink: 0 }} />
        <span style={{ color: tokens.text, ...font.bodyExtraBold, fontSize: type.caption }}>{categoryName}</span>
      </div>
      <motion.div style={{ background, borderRadius: radius.full, paddingInline: space.sm, paddingBlock: 3 }}>
        <motion.span style={{ color: foreground, ...font.bodyExtraBold, fontSize: type.caption }}>{label}</motion.span>
      </motion.div>
    </div>
  )
}

export function ExpenseAddedScreen({
  expense,
  before,
  onUndo,
  onDone,
  muted = false,
}: {
  expense: LoggedExpense
  /** The category as it stood before this expense was charged to it. */
  before: DemoCategory | undefined
  onUndo: () => void
  onDone: () => void
  /** The landing's self-playing demo loops this screen; it shouldn't chime every pass. */
  muted?: boolean
}) {
  const { formatMoney } = useCurrency()

  const { amount, item, category } = expense
  const envelope = before ? toEnvelope(before) : undefined
  const spent = (envelope?.spent ?? 0) + amount
  const left = (envelope?.available ?? 0) - amount
  const funded = envelope?.assigned ?? 0
  const showEnvelope = envelope != null && funded > 0
  const spentPct = funded > 0 ? Math.min(100, (spent / funded) * 100) : 0
  const prevPct = funded > 0 ? Math.min(100, ((spent - amount) / funded) * 100) : 0
  const preLeft = left + amount
  const perDay = DAYS_LEFT > 0 ? Math.round(left / DAYS_LEFT) : left

  const [shownLeft, setShownLeft] = useState(preLeft)
  useEffect(() => {
    const t = setTimeout(() => setShownLeft(left), DELTA_DELAY)
    return () => clearTimeout(t)
    // Runs once on its own beat, same as Mobile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Logging an expense is the app's one verb that chimes.
  useEffect(() => {
    if (!muted) chime()
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categoryName = splitEmoji(category).text
  const subtitle = item || categoryName

  return (
    <div style={{ ...col, height: '100%', background: T.bg, paddingInline: space.lg }}>
      <div style={{ ...col, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...col, alignItems: 'center' }}>
          <DotLottieReact src="/landing/success-tick.lottie" autoplay loop={false} style={{ width: 200, height: 200 }} />
          <FadeInDown delay={STAGGER.headline} duration={420} style={{ marginTop: space.xl }}>
            <div style={{ ...row, alignItems: 'baseline', justifyContent: 'center', gap: space.sm, marginTop: -50 }}>
              <span style={{ color: T.text, ...font.displayBold, fontSize: type.display }}>Added</span>
              <AmountText value={amount} size={type.display} weight="displayBold" color={T.text} animate />
            </div>
          </FadeInDown>
          {subtitle !== '' && (
            <FadeInDown delay={STAGGER.detail} duration={420} style={{ marginTop: space.sm }}>
              <span style={{ color: T.text2, ...font.bodyExtraBold, fontSize: type.bodyLg }}>{subtitle}</span>
            </FadeInDown>
          )}
        </div>

        {showEnvelope && (
          <FadeInDown
            delay={STAGGER.card}
            duration={460}
            style={{ alignSelf: 'stretch', borderRadius: radius.lg, padding: space.lg + space.xs, marginTop: space.xxl }}
          >
            <AnimatedUsedPercentage from={prevPct} to={spentPct} categoryName={categoryName} />
            <div style={{ ...row, alignItems: 'baseline', gap: space.xs, marginTop: space.md }}>
              <AmountText value={shownLeft} size={32} weight="displayBold" color={T.text} animate />
              <span style={{ color: T.text2, ...font.bodyBold, fontSize: type.caption }}>
                {`left of ${formatMoney(Math.round(funded))}`}
              </span>
            </div>
            <div style={{ marginTop: space.lg }}>
              <DeltaBar from={prevPct} to={spentPct} amount={amount} />
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: s(STAGGER.cardFooter), duration: 0.42, ease: ease.inOutQuad }}
              style={{
                ...row,
                alignItems: 'baseline',
                justifyContent: 'space-between',
                borderTop: `0.5px solid ${T.border}`,
                marginTop: space.xl + space.sm,
                paddingTop: space.md,
              }}
            >
              <span style={{ color: T.text3, ...font.bodyExtraBold, fontSize: type.caption }}>{DAYS_LEFT} days left</span>
              <span style={{ color: T.text, ...font.bodyExtraBold, fontSize: type.caption }}>
                {`${formatMoney(perDay)}/day to stay on track`}
              </span>
            </motion.div>
          </FadeInDown>
        )}
      </div>

      <FadeInDown delay={STAGGER.footer} duration={440} style={{ ...col, paddingBottom: PHONE.bottom + space.xl, gap: space.md }}>
        <div style={{ ...row, gap: space.md }}>
          <Button label="Undo" variant="secondary" onPress={onUndo} style={{ flex: '0 0 132px', height: 58 }} />
          <Button label="Done" variant="secondary" onPress={onDone} style={{ flex: 1, height: 58, background: T.accent }} />
        </div>
        <span style={{ color: T.text3, ...font.bodyExtraBold, fontSize: type.caption, textAlign: 'center' }}>
          {formatDateTimeLong(expense.loggedAt)}
        </span>
      </FadeInDown>
    </div>
  )
}
