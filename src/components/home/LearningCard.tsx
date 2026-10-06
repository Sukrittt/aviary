'use client'

import { Check } from 'lucide-react'
import { BirdMark } from '@/src/components/BirdMark'
import { useWeekRecap } from '@/src/components/wrapped/WeekRecap'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { learnedDates } from '@/src/lib/noticed'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * Days 1 to 7: tells new users the app is learning them and that a recap is
 * coming. The dots count the week down, not attendance: every day that has
 * passed is ticked whether or not anything was spent, so a quiet day never
 * reads as a miss. Today ticks once they log. Hides once the recap is due. Twin of Mobile's src/components/home/LearningCard.tsx.
 */
export function LearningCard() {
  const learning = useWeekRecap().data?.learning
  const rows = useRecentExpenses().data
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
  const logged = new Set(learnedDates(learning.loggedDates, rows, startDate, days[learning.day - 1].date))

  return (
    <article className="erd-card home-learning" aria-label="We're learning your habits">
      <div className="home-learning-head">
        <span className="home-learning-bird"><BirdMark size={40} /></span>
        <div>
          <h2>We&apos;re learning your habits</h2>
          <p>Day {learning.day} of 7 · your first-week recap unlocks {left === 1 ? 'tomorrow' : `in ${left} days`}</p>
        </div>
      </div>
      <ol className="home-learning-days">
        {days.map((d, i) => {
          const done = i < learning.day - 1 || (d.today && logged.has(d.date))
          return (
            <li key={d.date} className={done ? 'is-on' : d.today ? 'is-today' : ''} aria-label={`${d.date}${done ? ', done' : d.today ? ', today' : ''}`}>
              <span>{done && <Check size={18} strokeWidth={3} style={{ animationDelay: `${120 + i * 90}ms` }} />}</span>
              <small>{d.letter}</small>
            </li>
          )
        })}
      </ol>
    </article>
  )
}
