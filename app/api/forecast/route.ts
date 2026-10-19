import { json, getCollection } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { nowForUser } from '@/lib/userCurrency'
import { buildExpenseContext } from '@/lib/ai/expenseContext'
import { forecast } from '@/lib/forecast'

export const dynamic = 'force-dynamic'

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))

/** `GET /api/forecast`: month-end forecast per envelope plus next month's spoken-for line. Web and Mobile both render this. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate

  const { date: today } = await nowForUser(auth.userId)
  const [y, m] = today.split('-').map(Number)
  const historyStart = new Date(Date.UTC(y, m - 4, 1)).toISOString().slice(0, 10)

  const [expensesColl, recurringColl, incomesColl, subsColl] = await Promise.all([
    getCollection('expenses', auth),
    getCollection('recurring_expenses', auth),
    getCollection('recurring_incomes', auth),
    getCollection('subscriptions', auth),
  ])
  const [{ envelopes }, expenseDocs, firstDoc, recurringDocs, incomeDocs, subDocs] = await Promise.all([
    buildExpenseContext(auth, { monthOnly: true }),
    // Indexed by { user_id: 1, date: -1 } (scripts/ensure-indexes.mjs).
    expensesColl.find({ date: { $gte: historyStart } }, { projection: { date: 1, amount_inr: 1, amount: 1, category: 1, notes: 1, source: 1, client_id: 1 } }).toArray(),
    expensesColl.findOne({ category: { $nin: ['__income__', '__credit_card__'] } }, { sort: { date: 1 }, projection: { date: 1 } }),
    recurringColl.find({ status: 'active' }).toArray(),
    incomesColl.find({ status: 'active' }).toArray(),
    subsColl.find({}).toArray(),
  ])

  const schedule = (d: Record<string, unknown>) => ({
    frequency: str(d.frequency),
    start_date: str(d.start_date),
    end_date: str(d.end_date),
    next_run_date: str(d.next_run_date),
    status: str(d.status),
    anchor_day: Number(d.anchor_day) || undefined,
  })

  return json(
    forecast({
      today,
      firstExpenseDate: firstDoc ? str(firstDoc.date) : undefined,
      envelopes: envelopes.map((e) => ({ category: e.category, available: e.available, isCreditCardPayment: e.isCreditCardPayment })),
      expenses: expenseDocs.map((d) => ({
        date: str(d.date),
        amount_inr: Number(d.amount_inr ?? d.amount) || 0,
        category: str(d.category),
        notes: str(d.notes),
        source: str(d.source),
        client_id: str(d.client_id),
      })),
      recurringExpenses: recurringDocs.map((d) => ({ ...schedule(d), id: str(d._id), category: str(d.category), amount_inr: Number(d.amount_inr) || 0 })),
      recurringIncomes: incomeDocs.map((d) => ({ ...schedule(d), amount: Number(d.amount) || 0 })),
      subscriptions: subDocs.map((d) => ({
        service: str(d.service),
        category: str(d.category),
        amount_inr: Number(d.amount_inr) || 0,
        billing_cycle: str(d.billing_cycle),
        next_due_date: str(d.next_due_date),
        renewal_or_end_month: str(d.renewal_or_end_month) || undefined,
        timestamp: str(d.timestamp),
        status: str(d.status),
      })),
    }),
  )
}
