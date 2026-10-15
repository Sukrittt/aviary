'use client'

import { useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCurrency } from '@/src/context/CurrencyContext'

import { FadeIn, SectionLabel, ResultCard } from '@/src/components/tour/parts'
import { useTourContent } from '@/src/components/tour/useTourContent'
import { PLAY_STORE_URL } from '@/src/components/billing/copy'
import { NOTIFY_ENVELOPE, NOTIFY_PCTS, type NotifyCadence } from '@/src/components/tour/content'
import { SirenIcon, TrafficSignalIcon, type PhosphorIcon } from '@/src/components/icons'

const CADENCES: { value: NotifyCadence; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
]
const MAX_BANNERS = 3
const KINDS_TO_COMPLETE = 3
const OVER = 101

interface Banner {
  id: number
  icon: PhosphorIcon
  title: string
  body: string
}

/** Highest alert line crossed, or OVER once spending passes the plan. Same rule the server uses. */
function levelFor(spent: number) {
  if (spent > NOTIFY_ENVELOPE.plan) return OVER
  const pct = (spent / NOTIFY_ENVELOPE.plan) * 100
  return Math.max(0, ...NOTIFY_PCTS.filter((p) => pct >= p))
}

/** Chapter 6: a pretend lock screen that fills up as you poke at each kind of notification. */
export function NotifyDemo({ onComplete }: { onComplete: () => void }) {
  const { NOTIFY_KINDS } = useTourContent()
  const { formatCurrency } = useCurrency()
  const reduce = useReducedMotion()

  const [spent, setSpent] = useState<number>(NOTIFY_ENVELOPE.spent)
  const [cadence, setCadence] = useState<NotifyCadence>('daily')
  const [picked, setPicked] = useState<string | null>(null)
  const [banners, setBanners] = useState<Banner[]>([])
  const seen = useRef(new Set<string>())
  const nextId = useRef(0)

  const { name, icon: EnvelopeIcon, plan, step } = NOTIFY_ENVELOPE
  const pct = Math.round((spent / plan) * 100)
  const over = spent > plan
  const pickedKind = NOTIFY_KINDS.find((k) => k.id === picked)
  const pickedSilenced = !!pickedKind?.digestGated && cadence === 'off'

  function ping(kind: string, banner: Omit<Banner, 'id'>) {
    setBanners((prev) => [{ ...banner, id: nextId.current++ }, ...prev].slice(0, MAX_BANNERS))
    seen.current.add(kind)
    if (seen.current.size >= KINDS_TO_COMPLETE) onComplete()
  }

  function spend() {
    if (over) {
      setSpent(NOTIFY_ENVELOPE.spent)
      return
    }
    const next = spent + step
    const level = levelFor(next)
    setSpent(next)
    if (level <= levelFor(spent)) return
    if (level === OVER) {
      ping('overspent', {
        icon: SirenIcon,
        title: `${name} is over budget`,
        body: `You've overspent ${formatCurrency(next - plan)} in ${name} this month.`,
      })
    } else {
      ping('threshold', {
        icon: TrafficSignalIcon,
        title: `${name} is at ${Math.round((next / plan) * 100)}%`,
        body: `${formatCurrency(next)} of ${formatCurrency(plan)} spent in ${name}.`,
      })
    }
  }

  function pick(id: string) {
    const kind = NOTIFY_KINDS.find((k) => k.id === id)!
    setPicked(id)
    if (kind.digestGated && cadence === 'off') return
    ping(id, kind)
  }

  return (
    <div className="tour-demo">
      {/* Push is delivered by the Android app only; this demo is a preview of it, so say so up front. */}
      <ResultCard tone="accent">
        <div className="tour-log-head">
          <div className="tour-row-body">
            <span className="tour-row-name">Notifications only work on the Android app</span>
            <span className="tour-row-note">This is a preview. Install the app to get the real pings.</span>
          </div>
        </div>
        <a className="tour-android-cta" href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
          Get it on Google Play
        </a>
      </ResultCard>

      <div className="tour-notify-lock">
        <span className="tour-notify-clock">9:41</span>
        {banners.length === 0 ? (
          <p className="tour-notify-quiet">Quiet phone. Nothing has crossed a line yet.</p>
        ) : (
          <AnimatePresence initial={false}>
            {banners.map((b) => (
              // FadeInUp.springify().damping(18) in, LinearTransition spring for the ones that shift down.
              <motion.div
                key={b.id}
                layout={reduce ? false : 'position'}
                initial={reduce ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', damping: 18, stiffness: 100, layout: { type: 'spring', damping: 64, stiffness: 700 } }}
                className="tour-notify-banner"
              >
                <div className="tour-row-tile"><b.icon size={18} aria-hidden /></div>
                <div className="tour-row-body">
                  <span className="tour-notify-banner-title">{b.title}</span>
                  <span className="tour-notify-banner-body">{b.body}</span>
                </div>
                <span className="tour-notify-now">now</span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <SectionLabel>CATEGORY ALERTS</SectionLabel>
      <div className={`tour-card ${over ? 'is-over' : ''}`}>
        <div className="tour-log-head">
          <div className="tour-row-tile"><EnvelopeIcon size={18} aria-hidden /></div>
          <div className="tour-row-body">
            <span className="tour-row-name">{name}</span>
            <span className={`tour-row-note ${over ? 'is-coral' : ''}`}>
              {formatCurrency(spent)} of {formatCurrency(plan)} · {pct}%
            </span>
          </div>
          <button type="button" className={`tour-pill ${over ? '' : 'is-accent'}`} onClick={spend}>
            {over ? 'Start over' : `Spend ${formatCurrency(step)}`}
          </button>
        </div>
        <div className="tour-notify-track-wrap">
          <div className="tour-notify-track">
            <div className={`tour-notify-fill ${over ? 'is-coral' : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          {NOTIFY_PCTS.map((p) => (
            <span key={p} className={`tour-notify-tick ${pct >= p ? 'is-hit' : ''}`} style={{ left: `${p}%` }} />
          ))}
        </div>
        <p className="tour-result-note">
          Pings the moment you log past 50%, 90% or 100%, and again if you go over. Pick your own lines per category, up to five.
          Only the highest line crossed pings, so one big spend never sends three.
        </p>
      </div>

      <SectionLabel>DIGEST</SectionLabel>
      <div className="tour-segmented" role="group" aria-label="Digest cadence">
        {CADENCES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={cadence === c.value}
            className={`tour-segment ${cadence === c.value ? 'is-active' : ''}`}
            onClick={() => setCadence(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="tour-result-note tour-notify-cadence-note">
        {cadence === 'off'
          ? 'Off also quiets bill reminders and the AI coach. Category alerts, Wrapped and auto-added pings keep working.'
          : cadence === 'weekly'
            ? 'One spending update a week, plus bill reminders and the AI coach.'
            : 'A one-line spending update every day, plus bill reminders and the AI coach.'}
      </p>

      <SectionLabel>EVERYTHING ELSE THAT PINGS</SectionLabel>
      <div className="tour-chip-row">
        {NOTIFY_KINDS.map((k) => {
          const silenced = k.digestGated && cadence === 'off'
          return (
            <button
              key={k.id}
              type="button"
              className={`tour-chip ${picked === k.id ? 'is-active' : ''} ${silenced ? 'is-silenced' : ''}`}
              onClick={() => pick(k.id)}
            >
              <k.icon size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 6 }} />{k.label}
            </button>
          )
        })}
      </div>

      {pickedKind && (
        <FadeIn ms={160} key={`${pickedKind.id}:${pickedSilenced}`}>
          <ResultCard tone={pickedSilenced ? 'accent' : 'mint'}>
            {pickedSilenced && <p className="tour-notify-silenced">Silenced · your digest is Off</p>}
            <p className="tour-notify-detail">
              <b>When · </b>
              {pickedKind.when}
            </p>
            <p className="tour-result-note">
              <b>Your call · </b>
              {pickedKind.control}
            </p>
          </ResultCard>
        </FadeIn>
      )}
    </div>
  )
}
