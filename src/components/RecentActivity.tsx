import Link from 'next/link'
import { useCurrency } from '@/src/context/CurrencyContext'
import type { ExpenseRow } from '../types'
import { avatarColorFor, categoryEmoji, splitEmoji } from '../lib/emoji'
import { formatShortDate } from '../lib/format'
import { CREDIT_CARD_CATEGORY, INCOME_CATEGORY } from '../lib/envelope'
import { BirdEmptyState } from './BirdEmptyState'

export function RecentActivity({ expenses, hideAmounts }: { expenses: ExpenseRow[]; hideAmounts: boolean }) {
  const { formatCurrency } = useCurrency()
  const recent = expenses
    .filter((expense) => expense.category !== INCOME_CATEGORY && expense.category !== CREDIT_CARD_CATEGORY)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
    .slice(0, 4)

  return (
    <article className="erd-card ins-card home-recent">
      <div className="ins-card-heading">
        <h2>Recent activity</h2>
        <Link href="/expense/transactions" className="erd-manage-btn">View all</Link>
      </div>
      {recent.length === 0 ? (
        <BirdEmptyState
          compact
          subject="expenses"
          title="Your story starts here"
          description="Log your first expense and the little details will gather here."
        />
      ) : (
        <div className="ins-top-list">
          {recent.map((expense, index) => {
            const category = splitEmoji(expense.category).text
            return (
              <Link key={expense.id ?? `${expense.timestamp}-${index}`}
                href={`/expense/transactions?date=${encodeURIComponent(expense.date)}`}
                className="ins-top-row">
                <span className="ins-top-icon" style={{ background: avatarColorFor(category) }} aria-hidden="true">
                  {categoryEmoji(expense.category)}
                </span>
                <span className="ins-top-body">
                  <span className="ins-top-item">{expense.item || category}</span>
                  <span className="ins-top-meta">{formatShortDate(expense.date)} · {category}</span>
                </span>
                <span className="ins-top-amount">{formatCurrency(Number(expense.amount_inr) || 0, hideAmounts)}</span>
              </Link>
            )
          })}
        </div>
      )}
    </article>
  )
}
