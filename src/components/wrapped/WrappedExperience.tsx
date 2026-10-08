'use client'

import { useCurrency } from '@/src/context/CurrencyContext'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Pause, Play, Share2, X } from 'lucide-react'
import { useWrapped, useWrappedJudgement } from '@/src/hooks/useWrapped'
import { useBudgets } from '@/src/hooks/useBudgets'
import { useHideAmounts } from '@/src/hooks/useHideAmounts'
import { formatDateShort } from '@/src/lib/format'
import type { WrappedData, WrappedJudgement } from '@/src/api/wrapped'
import { LoadingCaption } from '@/src/components/LoadingCaption'
import { track } from '@/src/lib/analytics'

export const STORY_MS = 5000
const PALETTE = ['#f2b84b', '#ee785d', '#4f9b82', '#6f67b1', '#df8c59']

/** Jev's persona keys, with the copy the card shows for each. */
const JEV_PERSONAS: Record<string, (data: WrappedData) => { emoji: string; name: string; copy: string }> = {
  daily_tracker: () => ({ emoji: '🔥', name: 'The Daily Tracker', copy: 'You kept the habit alive, one honest entry at a time.' }),
  loyalist: (data) => ({ emoji: '🎯', name: 'The Loyalist', copy: `You knew what mattered. ${data.topCategories[0]?.category ?? 'One category'} led the way.` }),
  steady_hand: () => ({ emoji: '⚖️', name: 'The Steady Hand', copy: 'Your spending kept a calm, remarkably even rhythm.' }),
  free_spirit: () => ({ emoji: '🪁', name: 'The Free Spirit', copy: 'No two weeks looked the same, and your story stayed interesting.' }),
  big_swing: (data) => ({ emoji: '🎢', name: 'The Big Swing', copy: data.biggestPurchase ? `One call — ${data.biggestPurchase.item} — shaped the whole month.` : 'One big call shaped the whole month.' }),
  slow_burn: (data) => ({ emoji: '🕯️', name: 'The Slow Burn', copy: `${data.totalTransactions} small decisions, adding up quietly.` }),
}

export function wrappedArchetype(data: WrappedData, judgement: WrappedJudgement = {}) {
  const fromJev = judgement.persona ? JEV_PERSONAS[judgement.persona] : undefined
  if (fromJev) return fromJev(data)
  const topShare = data.topCategories[0]?.pct ?? 0
  const busiestWeek = Math.max(0, ...data.weeklyTotals.map((week) => week.total))
  const weeklyAverage = data.weeklyTotals.length
    ? data.weeklyTotals.reduce((sum, week) => sum + week.total, 0) / data.weeklyTotals.length
    : 0
  if (data.longestStreak && data.longestStreak.days >= 7) return { emoji: '🔥', name: 'The Daily Tracker', copy: 'You kept the habit alive, one honest entry at a time.' }
  if (topShare >= 45) return { emoji: '🎯', name: 'The Loyalist', copy: `You knew what mattered. ${data.topCategories[0]?.category} led the way.` }
  if (weeklyAverage > 0 && busiestWeek < weeklyAverage * 1.2) return { emoji: '⚖️', name: 'The Steady Hand', copy: 'Your spending kept a calm, remarkably even rhythm.' }
  return { emoji: '🪁', name: 'The Free Spirit', copy: 'No two weeks looked the same, and your story stayed interesting.' }
}

function monthName(month: string) {
  const date = new Date(`${month}-01T12:00:00`)
  return Number.isNaN(date.getTime()) ? month : date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function Story({ eyebrow, title, children, emoji }: { eyebrow: string; title: string; children?: ReactNode; emoji?: string }) {
  return (
    <div className="wrapped-story-copy">
      <span className="wrapped-eyebrow">{eyebrow}</span>
      {emoji && <span className="wrapped-hero-emoji" aria-hidden="true">{emoji}</span>}
      <h1>{title}</h1>
      {children}
    </div>
  )
}

function WrappedStory({ data, judgement, moneySaved, hideAmounts }: { data: WrappedData; judgement: WrappedJudgement; moneySaved: number; hideAmounts: boolean }) {
  const { formatCurrency } = useCurrency()

  const reduceMotion = useReducedMotion()
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [copied, setCopied] = useState(false)
  // Frozen when the story starts: Jev's answer arriving mid-story would insert
  // a slide under the reader and shift the progress dots.
  const [frozen, setFrozen] = useState<WrappedJudgement>({})
  const archetype = wrappedArchetype(data, frozen)
  const maxWeek = Math.max(1, ...data.weeklyTotals.map((week) => week.total))
  const topCategory = data.topCategories[0]

  const slides = useMemo(() => [
    {
      color: '#4f477b', ink: '#fffaf0', node: <Story eyebrow="Your month, in money" title={`${monthName(data.month)} Wrapped`} emoji="✦"><p>{data.totalTransactions} choices. One very personal story.</p></Story>,
    },
    {
      color: '#eecb72', ink: '#332815', node: <Story eyebrow="The big number" title={formatCurrency(data.totalSpent, hideAmounts)} emoji="☀️"><p>spent across {data.range.daysTracked} active days</p></Story>,
    },
    {
      color: '#e98368', ink: '#381b16', node: <Story eyebrow="Your main character" title={topCategory?.category ?? 'Everyday life'} emoji="🏆"><p>{topCategory ? `${Math.round(topCategory.pct)}% of all spending, ${formatCurrency(topCategory.total, hideAmounts)} in total.` : 'A month of small, varied choices.'}</p></Story>,
    },
    {
      color: '#6db09a', ink: '#102d25', node: <Story eyebrow="The big one" title={data.biggestPurchase?.item ?? 'No single splurge'} emoji="🛍️"><p>{data.biggestPurchase ? `${formatCurrency(data.biggestPurchase.amountInr, hideAmounts)} on ${formatDateShort(data.biggestPurchase.date)} · ${data.biggestPurchase.category}` : 'You kept every purchase light.'}</p></Story>,
    },
    {
      color: '#c9b3df', ink: '#281c35', node: <Story eyebrow="Your spendiest day" title={data.topWeekday?.day ?? 'No favourite yet'} emoji="📅"><p>{data.topWeekday ? `${data.topWeekday.count} transactions added up to ${formatCurrency(data.topWeekday.total, hideAmounts)}.` : 'Your calendar stayed quiet.'}</p></Story>,
    },
    {
      color: '#efd89a', ink: '#302817', node: <Story eyebrow="Four weeks, head to head" title="The week race"><div className="wrapped-week-bars">{data.weeklyTotals.map((week) => <div key={week.label}><i style={{ height: `${Math.max(8, (week.total / maxWeek) * 100)}%` }} /><strong>{week.label}</strong><small>{formatCurrency(week.total, hideAmounts)}</small></div>)}</div></Story>,
    },
    {
      color: '#568d86', ink: '#f8fff9', node: <Story eyebrow="Where it all went" title="Your category mix"><div className="wrapped-category-list">{data.topCategories.map((category, itemIndex) => <div key={category.category}><span><i style={{ background: PALETTE[itemIndex] }} />{category.category}</span><strong>{Math.round(category.pct)}%</strong><small style={{ width: `${category.pct}%`, background: PALETTE[itemIndex] }} /></div>)}</div></Story>,
    },
    ...(frozen.treatCategory ? [{
      color: '#d98ca6', ink: '#33161f', node: <Story eyebrow="Your little treat" title={frozen.treatCategory} emoji="🍰"><p>The category that looked least like a bill and most like a reward.</p></Story>,
    }] : []),
    {
      color: '#e89161', ink: '#341b10', node: <Story eyebrow="Consistency check" title={`${data.longestStreak?.days ?? 0} day streak`} emoji="🔥"><p>{data.longestStreak ? `${formatDateShort(data.longestStreak.startDate)} to ${formatDateShort(data.longestStreak.endDate)}. Your longest run of logged spending.` : 'Every habit starts with day one.'}</p></Story>,
    },
    {
      color: '#b8d4ab', ink: '#1d3019', node: <Story eyebrow="Money still yours" title={formatCurrency(moneySaved, hideAmounts)} emoji="🌱"><p>left across this month&apos;s envelopes. Quiet progress counts.</p></Story>,
    },
    {
      color: '#7268a8', ink: '#fffaf5', node: <Story eyebrow="Your money personality" title={archetype.name} emoji={archetype.emoji}><p>{archetype.copy}</p></Story>,
    },
    {
      color: '#40395f', ink: '#fffaf0', node: <Story eyebrow={`${monthName(data.month)} · complete`} title="That was your month." emoji="🕊️"><p>{formatCurrency(data.totalSpent, hideAmounts)} spent. {formatCurrency(moneySaved, hideAmounts)} left. A clearer picture for what comes next.</p></Story>,
    },
  ], [archetype, data, frozen, hideAmounts, maxWeek, moneySaved, topCategory, formatCurrency])

  const goNext = useCallback(() => setIndex((current) => Math.min(slides.length - 1, current + 1)), [slides.length])
  const goBack = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])

  useEffect(() => {
    if (!started || paused || reduceMotion || index === slides.length - 1) return
    const timer = window.setTimeout(goNext, STORY_MS)
    return () => window.clearTimeout(timer)
  }, [goNext, index, paused, reduceMotion, slides.length, started])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!started) return
      if (event.key === 'ArrowRight') goNext()
      if (event.key === 'ArrowLeft') goBack()
      if (event.key === ' ') { event.preventDefault(); setPaused((value) => !value) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goBack, goNext, started])

  // Which card people stop on, each counted once per visit. Numbered from 1
  // to match mobile, where index 0 is the start screen.
  const seenCards = useRef(new Set<number>())
  useEffect(() => {
    if (!started || seenCards.current.has(index)) return
    seenCards.current.add(index)
    track('wrapped_card_viewed', { index: index + 1 })
  }, [started, index])

  async function shareStory() {
    const text = `${monthName(data.month)} Wrapped: ${formatCurrency(data.totalSpent)} spent across ${data.totalTransactions} transactions. My money personality: ${archetype.name}.`
    // Counted only once it went out: a dismissed share sheet isn't a share.
    if (navigator.share) {
      const shared = await navigator.share({ title: 'My Expense Wrapped', text }).then(() => true, () => false)
      if (shared) track('wrapped_shared')
    } else {
      await navigator.clipboard.writeText(text)
      track('wrapped_shared')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  if (!started) {
    return (
      <main className="wrapped-cover">
        <Link className="wrapped-close" href="/account" aria-label="Close Wrapped"><X /></Link>
        <div className="wrapped-cover-mark" aria-hidden="true">✦</div>
        <span>Your spending has a story</span>
        <h1>{monthName(data.month)}<br />Wrapped</h1>
        <p>{data.totalTransactions} transactions, distilled into the moments that shaped your month.</p>
        <button type="button" onClick={() => { track('wrapped_opened'); setFrozen(judgement); setStarted(true) }}>Unwrap my month <ArrowRight size={18} /></button>
      </main>
    )
  }

  const slide = slides[index]
  return (
    <main className="wrapped-player" style={{ '--wrapped-bg': slide.color, '--wrapped-ink': slide.ink } as CSSProperties}>
      <div className="wrapped-progress" aria-label={`Story ${index + 1} of ${slides.length}`}>{slides.map((_, itemIndex) => <i key={itemIndex}><b className={itemIndex < index ? 'is-done' : itemIndex === index ? 'is-current' : ''} style={itemIndex === index && !paused && !reduceMotion ? { animationDuration: `${STORY_MS}ms` } : undefined} /></i>)}</div>
      <div className="wrapped-controls">
        <Link href="/account" aria-label="Close Wrapped"><X /></Link>
        <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Resume stories' : 'Pause stories'}>{paused ? <Play /> : <Pause />}</button>
      </div>
      <button className="wrapped-tap wrapped-tap--left" type="button" onClick={goBack} aria-label="Previous story" disabled={index === 0} />
      <button className="wrapped-tap wrapped-tap--right" type="button" onClick={goNext} aria-label="Next story" disabled={index === slides.length - 1} />
      <AnimatePresence mode="wait">
        <motion.section key={index} className="wrapped-slide" initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, y: -18 }} transition={{ duration: 0.35 }}>
          <span className="wrapped-slide-count">{String(index + 1).padStart(2, '0')} / {slides.length}</span>
          {slide.node}
          {index === slides.length - 1 && <button className="wrapped-share" type="button" onClick={() => void shareStory()}><Share2 size={18} />{copied ? 'Copied' : 'Share my Wrapped'}</button>}
        </motion.section>
      </AnimatePresence>
      <div className="wrapped-key-hint"><ArrowLeft size={14} /> arrow keys to explore <ArrowRight size={14} /></div>
    </main>
  )
}

export function WrappedExperience() {
  const wrapped = useWrapped()
  // Deliberately not awaited: the recap renders without it, and the cover
  // screen waits for a tap, which is usually longer than the Jev call.
  const judgement = useWrappedJudgement()
  const budgets = useBudgets()
  const [hideAmounts] = useHideAmounts()

  if (wrapped.isLoading) return <main className="wrapped-state"><LoadingCaption placement="page" /></main>
  if (wrapped.isError || !wrapped.data) return <main className="wrapped-state"><h1>We couldn&apos;t wrap this month.</h1><button type="button" onClick={() => void wrapped.refetch()}>Try again</button><Link href="/account">Back to account</Link></main>
  if (wrapped.data.totalTransactions === 0) return <main className="wrapped-state"><h1>Your story is still being written.</h1><p>Log a few expenses and come back for your monthly recap.</p><Link href="/expense">Go to your budget</Link></main>

  const monthBudgets = (budgets.data ?? []).filter((budget) => budget.month === wrapped.data.month)
  const assigned = monthBudgets.reduce((sum, budget) => sum + Number(budget.assigned || 0) + Number(budget.rolled_over || 0), 0)
  const moneySaved = Math.max(0, assigned - wrapped.data.totalSpent)
  return <WrappedStory data={wrapped.data} judgement={judgement.data ?? {}} moneySaved={moneySaved} hideAmounts={hideAmounts} />
}
