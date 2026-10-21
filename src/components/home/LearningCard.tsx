'use client'

import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { CaretDownIcon, CaretUpIcon, CheckIcon } from '@/src/components/icons'
import { BirdMark } from '@/src/components/BirdMark'
import { useWeekRecap } from '@/src/components/wrapped/WeekRecap'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { usePersistentState } from '@/src/hooks/usePersistentState'
import { learnedDates } from '@/src/lib/noticed'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * Days 1 to 7: tells new users the app is learning them and that a recap is
 * coming. The dots count the week down, not attendance: every day that has
 * passed is ticked whether or not anything was spent, so a quiet day never
 * reads as a miss. Today ticks once they log. Hides once the recap is due.
 * The dots can be folded away, and stay folded, until day 7, when they show
 * again with no toggle so the last tick isn't missed. Twin of Mobile's
 * src/components/home/LearningCard.tsx.
 */
export function LearningCard() {
  const reduceMotion = useReducedMotion()
  const learning = useWeekRecap().data?.learning
  const rows = useRecentExpenses().data
  const [collapsed, setCollapsed] = usePersistentState('learning-collapsed', false, (raw) => raw === '1', (v) => (v ? '1' : '0'))
  if (!learning) return null

  const start = new Date(`${learning.unlocksOn}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 7)
  const startDate = start.toISOString().slice(0, 10)
  const left = 8 - learning.day
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    return { date: d.toISOString().slice(0, 10), letter: WEEKDAYS[d.getUTCDay()], today: i === learning.day - 1 }
  })
  const lastDay = learning.day >= 7
  const showDays = lastDay || !collapsed
  const logged = new Set(learnedDates(learning.loggedDates, rows, startDate, days[learning.day - 1].date))

  return (
    // Grows in like the Get started card, pushing the cards below down. The
    // negative margin cancels the column's gap at zero height.
    <motion.div
      className="home-learning-slot"
      initial={reduceMotion ? false : { height: 0, opacity: 0, marginBottom: -20 }}
      animate={{ height: 'auto', opacity: 1, marginBottom: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <article className="erd-card home-learning" aria-label="We're learning your habits">
        <div className="home-learning-head">
          <span className="home-learning-bird"><BirdMark size={40} /></span>
          <div>
            <h2>We&apos;re learning your habits</h2>
            <p>Day {learning.day} of 7 · your first-week recap unlocks {left === 1 ? 'tomorrow' : `in ${left} days`}</p>
          </div>
          {!lastDay && (
            <button
              type="button"
              className="env2-icon-btn home-learning-toggle"
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Show the week' : 'Hide the week'}
              title={collapsed ? 'Show the week' : 'Hide the week'}
            >
              {collapsed ? <CaretDownIcon size={16} /> : <CaretUpIcon size={16} />}
            </button>
          )}
        </div>
        {showDays && <ol className="home-learning-days">
          {days.map((d, i) => {
            const done = i < learning.day - 1 || (d.today && logged.has(d.date))
            return (
              <li key={d.date} className={done ? 'is-on' : d.today ? 'is-today' : ''} style={{ '--i': i } as CSSProperties} aria-label={`${d.date}${done ? ', done' : d.today ? ', today' : ''}`}>
                <span>{done && <CheckIcon size={18} weight="bold" />}</span>
                <small>{d.letter}</small>
              </li>
            )
          })}
        </ol>}
      </article>
    </motion.div>
  )
}
