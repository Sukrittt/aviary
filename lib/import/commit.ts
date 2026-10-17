import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import { getDb } from '@/lib/mongodb'
import { nowForUser } from '@/lib/userCurrency'
import { isCurrencyCode } from '@/src/lib/currencies'
import { validText } from '@/lib/inputValidation'
import { normalizeItem } from '@/lib/recurringDetection'
import { completeOnboarding } from '@/lib/billing/service'
import type { UserDoc } from '@/lib/users'
import { createGroup } from '@/lib/groups'
import { createCategory } from '@/lib/categories'
import { createBudgetRow } from '@/lib/budgets'
import { AccountWriteError, createAccount, isAccountType, MAX_ACCOUNT_NAME, sameAccountName, type AccountType } from '@/lib/accounts'
import { createRecurringIncome, ensureIncomeMigrated, INCOME_CATEGORY, syncMonthlyIncome, validIncomeAmount } from '@/lib/income'
import { ImportError, resolveRows } from './normalize'
import type { Direction } from './parse'
import { CATEGORY_NAME_MAX, UNCATEGORISED, detectSalary, incomeCounted, proposeBudgets, proposeCategories } from './propose'
import { importsCollection, loadImport, planOf, STARTER_GROUPS, storedRows, type BookingRow, type ImportDoc, type ImportSummary } from './service'

export interface CommitEdits {
  currency: string
  direction: Direction
  groups: string[]
  categories: { source: string; name: string; group: string }[]
  accounts: { source: string; name: string; type: AccountType }[]
  salary: { amount: number; day: number } | null
}

export type CommitResult = { importId: string; total: number } & ImportSummary

const MAX_GROUPS = 20
const MAX_EDITS = 200

const clip = (s: string, max: number) => s.trim().slice(0, max)

/** Validates the client's edits. Anything malformed is `invalid`; nothing here is trusted to be what review showed. */
export function parseEdits(raw: Record<string, unknown>): CommitEdits {
  const bad = () => new ImportError('invalid')
  if (!isCurrencyCode(raw.currency)) throw bad()
  if (raw.direction !== 'negative_spend' && raw.direction !== 'positive_spend') throw bad()
  const groups = raw.groups ?? STARTER_GROUPS
  const categories = raw.categories ?? []
  const accounts = raw.accounts ?? []
  if (!Array.isArray(groups) || groups.length > MAX_GROUPS || !groups.every((g) => validText(g, CATEGORY_NAME_MAX))) throw bad()
  if (!Array.isArray(categories) || categories.length > MAX_EDITS) throw bad()
  if (!Array.isArray(accounts) || accounts.length > MAX_EDITS) throw bad()
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= 500 ? clip(v, max) : null
  const cats = categories.map((c) => {
    const source = text(c?.source, CATEGORY_NAME_MAX)
    const group = text(c?.group, CATEGORY_NAME_MAX)
    if (!source || !group) throw bad()
    return { source, name: text(c?.name, CATEGORY_NAME_MAX) || source, group }
  })
  const accts = accounts.map((a) => {
    const source = typeof a?.source === 'string' ? a.source.trim() : ''
    const name = text(a?.name, MAX_ACCOUNT_NAME)
    if (!source || !name || !isAccountType(a?.type)) throw bad()
    return { source, name, type: a.type as AccountType }
  })
  let salary: CommitEdits['salary'] = null
  if (raw.salary !== null && raw.salary !== undefined) {
    const s = raw.salary as { amount?: unknown; day?: unknown }
    const day = Number(s.day)
    if (!validIncomeAmount(s.amount) || !Number.isInteger(day) || day < 1 || day > 31) throw bad()
    salary = { amount: Number(s.amount), day }
  }
  return { currency: raw.currency, direction: raw.direction, groups: groups.map((g: string) => clip(g, CATEGORY_NAME_MAX)), categories: cats, accounts: accts, salary }
}

const CLAIM_MS = 90_000

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)
}

function payday(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`
}

const resultOf = (doc: ImportDoc): CommitResult => ({
  importId: String(doc._id),
  total: doc.total,
  ...(doc.summary ? (JSON.parse(doc.summary) as ImportSummary) : { groupCount: 0, categoryCount: 0, income: 0 }),
})

/**
 * Sets the account up from a previewed import, in the spec's order, and
 * flips it to `importing` for the backfill. Every step creates-if-missing,
 * so a retry after a lost response finishes the job without doubling
 * anything, and a commit of an import that's already past preview returns
 * it as is. Only one import per account ever gets this far.
 */
export async function commitImport(auth: Auth, importId: string, edits: CommitEdits): Promise<CommitResult> {
  const result = await setUp(auth, importId, edits)
  // 7. Start the trial, on every path: a retry after a failure here must still
  // onboard. Idempotent, and its setup check needs the income row and a
  // category, which steps 2 and 4 wrote.
  const onboarded = await completeOnboarding(await getDb(), auth.userId)
  if (!onboarded.ok) throw new Error(`import ${importId}: onboarding refused after setup`)
  return result
}

async function setUp(auth: Auth, importId: string, edits: CommitEdits): Promise<CommitResult> {
  const doc = await loadImport(auth, importId)
  if (doc.status !== 'previewed') {
    if (doc.status === 'cancelled') throw new ImportError('not_found')
    return resultOf(doc)
  }
  const coll = await importsCollection(auth)
  if (await coll.findOne({ _id: { $ne: doc._id }, status: { $in: ['importing', 'done', 'failed'] } })) throw new ImportError('already_importing')
  // A preview can outlive the manual setup finishing in another tab; history
  // never lands in an account that's already set up.
  const user = await (await getDb()).collection<UserDoc>('users').findOne({ _id: auth.userId }, { projection: { onboardedAt: 1 } })
  if (user?.onboardedAt) throw new ImportError('already_onboarded')

  // One commit writes at a time. Accounts have no unique index (their name is
  // encrypted), so two racing commits would otherwise make every account twice.
  const now = Date.now()
  const claimed = await coll.updateOne(
    { _id: doc._id, status: 'previewed', $or: [{ claimedUntil: { $lte: now } }, { claimedUntil: { $exists: false } }] },
    { $set: { claimedUntil: now + CLAIM_MS } },
  )
  if (claimed.matchedCount !== 1) {
    const current = await loadImport(auth, importId)
    if (current.status !== 'previewed') return resultOf(current)
    throw new ImportError('busy')
  }
  try {
    return await writeSetup(auth, doc, edits)
  } catch (err) {
    // Let a retry claim it straight away rather than wait out the claim.
    await coll.updateOne({ _id: doc._id, status: 'previewed' }, { $set: { claimedUntil: 0 } })
    throw err
  }
}

async function writeSetup(auth: Auth, doc: ImportDoc, edits: CommitEdits): Promise<CommitResult> {
  const importId = String(doc._id)
  const coll = await importsCollection(auth)
  const { date: today } = await nowForUser(auth.userId)
  const month = today.slice(0, 7)
  const rows = resolveRows(storedRows(doc), { direction: edits.direction, currency: edits.currency, hasCurrency: doc.hasCurrency })
  const live = rows.filter((r) => r.kind !== 'skipped')
  const plan = proposeCategories(live)

  // Source category → what the user named it and where they put it. A source
  // the client didn't send keeps its own name, in the first group.
  const groups = [...new Set(edits.groups.filter(Boolean))]
  if (!groups.length) groups.push(STARTER_GROUPS[0])
  const edited = new Map(edits.categories.map((c) => [c.source, c]))
  const finalNames = new Map<string, string>()
  const categories = new Map<string, { name: string; group: string }>()
  for (const { source } of plan.list) {
    const edit = edited.get(source)
    const name = edit?.name || source
    const group = edit?.group || groups[0]
    if (!groups.includes(group)) groups.push(group)
    // Two names that differ only in case become one envelope.
    const key = normalizeItem(name) || name
    if (!categories.has(key)) categories.set(key, { name, group })
    finalNames.set(source, categories.get(key)!.name)
  }
  // A file with no spends (all paydays, or all read as transfers) still needs
  // one envelope: completion requires a category, and so does a usable budget.
  if (!categories.size) categories.set(normalizeItem(UNCATEGORISED), { name: UNCATEGORISED, group: groups[0] })
  const categoryOf = (r: (typeof live)[number]) => finalNames.get(plan.sourceOf(r)) ?? plan.sourceOf(r)

  // 1. Currency: the file's wins, since it describes the money. The user confirmed it on review.
  await (await getDb()).collection<UserDoc>('users').updateOne({ _id: auth.userId }, { $set: { currencyCode: edits.currency } })

  // 2. Groups, then categories.
  const usedGroups = groups.filter((g) => [...categories.values()].some((c) => c.group === g))
  for (const g of usedGroups) await createGroup(auth, g)
  for (const c of categories.values()) await createCategory(auth, c)

  // 3. Accounts. One that already exists by name (a retry) is reused; one past
  // the caps is left out and its rows import without an account.
  const accountIds = new Map<string, string>()
  const existing: { _id: unknown; name?: unknown }[] = await (await getCollection('accounts', auth)).find({ archived: { $ne: true } }).toArray()
  for (const a of edits.accounts) {
    // Two sources renamed to one name share an account.
    const found = existing.find((e) => sameAccountName(e.name, a.name))
    try {
      const id = found ? String(found._id) : await createAccount(auth, { name: a.name, type: a.type })
      if (!found) existing.push({ _id: id, name: a.name })
      accountIds.set(a.source.toLowerCase(), id)
    } catch (err) {
      if (!(err instanceof AccountWriteError)) throw err
    }
  }

  // 4. Income. Migrate first, or a later migration mints a second salary schedule.
  await ensureIncomeMigrated(auth)
  const salary = edits.salary ? detectSalary(live, today) : null
  if (edits.salary) {
    // Without a detected pattern there's no telling which of this month's
    // paydays is the salary, so they all stay `extra` and the schedule starts
    // next month. Starting it now would count this month's pay twice.
    const paidThisMonth = live.some((r) => r.kind === 'income' && r.date.startsWith(month))
    const startMonth = !salary && paidThisMonth ? nextMonth(month) : month
    await createRecurringIncome(auth, {
      label: salary?.label || 'Salary',
      amount: edits.salary.amount,
      frequency: 'monthly',
      start_date: payday(startMonth, edits.salary.day),
      client_id: `import-salary:${importId}`,
    })
  }
  // Writes this month's income row either way: completion needs one to exist.
  await syncMonthlyIncome(auth, month)

  // 5. This month's budget, per envelope, from the proposal.
  const planByName = Object.fromEntries(Object.entries(planOf(doc)).map(([source, amount]) => [finalNames.get(source) ?? source, amount]))
  const budgets = proposeBudgets(live, categoryOf, today, edits.currency, planByName)
  for (const c of categories.values()) {
    if (c.name === INCOME_CATEGORY) continue
    await createBudgetRow(auth, { month, category: c.name, assigned: String(budgets[c.name] ?? 0) })
  }

  // 6. The rows the backfill books, oldest first, each one decided now.
  const salaryKey = edits.salary && salary ? salary.key : null
  const booking: BookingRow[] = live.map((r) => ({
    kind: r.kind as 'expense' | 'income',
    date: r.date,
    amount: r.amount,
    item: r.item || categoryOf(r),
    notes: r.notes,
    category: r.kind === 'expense' ? categoryOf(r) : '',
    ...(accountIds.has(r.account.toLowerCase()) ? { account_id: accountIds.get(r.account.toLowerCase()) } : {}),
    ...(r.kind === 'income' ? { counted: incomeCounted(r, salaryKey, month) } : {}),
  }))
  const summary = { groupCount: usedGroups.length, categoryCount: categories.size, income: edits.salary?.amount ?? 0 }
  const flipped = await coll.updateOne({ _id: doc._id, status: 'previewed' }, {
    $set: {
      status: 'importing', rows: JSON.stringify(booking), total: booking.length, done: 0, failed: 0, cursor: 0,
      streak: 0, streak_start: 0, lockedUntil: 0, currency: edits.currency, direction: edits.direction, summary: JSON.stringify(summary), committed_at: new Date(),
    },
  })
  if (flipped.matchedCount !== 1) {
    const current = await loadImport(auth, importId)
    if (current.status === 'previewed') throw new ImportError('not_found')
    return resultOf(current)
  }
  return { importId, total: booking.length, ...summary }
}
