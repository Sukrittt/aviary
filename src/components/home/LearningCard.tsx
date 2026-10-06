'use client'

import { BirdMark } from '@/src/components/BirdMark'
import { useWeekRecap } from '@/src/components/wrapped/WeekRecap'
import { useRecentExpenses } from '@/src/hooks/useExpenses'
import { learnedDates } from '@/src/lib/noticed'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * Days 1 to 7: tells new users the app is learning them and that a recap is
 * coming, with a dot per day of the week ticking as they log. Hides once the
 * recap is due. Twin of Mobile's src/components/home/LearningCard.tsx.
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
    <article className="erd-card home-learning" aria-label="Aviary is learning your habits">
      <div className="home-learning-head">
        <span className="home-learning-bird"><BirdMark size={40} /></span>
        <div>
          <h2>Aviary is learning your habits</h2>
          <p>Day {learning.day} of 7 · your first-week recap unlocks {left === 1 ? 'tomorrow' : `in ${left} days`}</p>
        </div>
      </div>
      <ol className="home-learning-days">
        {days.map((d) => (
          <li key={d.date} className={`${logged.has(d.date) ? 'is-on' : ''}${d.today ? ' is-today' : ''}`} aria-label={`${d.date}${logged.has(d.date) ? ', logged' : ''}`}>
            <span>{logged.has(d.date) ? '✓' : ''}</span>
            <small>{d.letter}</small>
          </li>
        ))}
      </ol>
    </article>
  )
}
