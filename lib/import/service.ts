import { gunzipSync, gzipSync } from 'node:zlib'
import { ObjectId } from 'mongodb'
import type { Auth } from '@/lib/access'
import { getCollection, json } from '@/lib/http'
import { getBudgetCurrency, nowForUser } from '@/lib/userCurrency'
import { budgetSetUp } from '@/lib/spaces'
import { normalizeItem } from '@/lib/recurringDetection'
import { INCOME_CATEGORY } from '@/lib/income'
import { currencyInfo, isCurrencyCode } from '@/src/lib/currencies'
import type { AccountType } from '@/lib/accounts'
import { readTable, ZipTooLarge } from './read'
import type { Direction } from './parse'
import type { AppId, SkipReason } from './presets'
import { ImportError, inspect, needsColumnHelp, normalize, resolveRows, unresolvedColumns, type StoredRow } from './normalize'
import { detectSalary, proposeAccounts, proposeBudgets, proposeCategories } from './propose'
import { importAiAllowed, pickCategoryGroups, pickColumnRoles } from './ai'

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
/**
 * The packed rows, at most: encrypted they grow by about a third, and the doc
 * must stay under Mongo's 16 MB. Gzipped, fifty thousand rows are about 1 MB,
 * so the upload and inflate caps bite long before this does.
 * ponytail: one document; a chunked rows collection if real files outgrow it.
 */
const MAX_ROWS_BYTES = 10 * 1024 * 1024
export const STARTER_GROUPS = ['Essentials', 'Lifestyle', 'Savings']

export type ImportStatus = 'previewed' | 'importing' | 'done' | 'failed' | 'cancelled' | 'undone'

/** One row the backfill books, decided at commit: final category, account and how income counts. */
export type BookingRow = {
  kind: 'expense' | 'income'
  date: string
  amount: number
  item: string
  notes: string
  category: string
  account_id?: string
  counted?: 'monthly' | 'extra'
}

export type ImportSummary = { groupCount: number; categoryCount: number; income: number }

export interface ImportDoc {
  _id: ObjectId
  status: ImportStatus
  app: AppId
  filename: string
  currency: string
  direction: Direction
  directionSource: 'column' | 'sign'
  hasCurrency: boolean
  /** Previewed into a budget that was already set up: history only, before its first entry (`laterOf`). */
  later?: boolean
  /** `packRows`: `StoredRow[]` while previewed, `BookingRow[]` from commit on. Encrypted (lib/encryptedFields.ts). */
  rows: string
  skipped: Partial<Record<SkipReason, number>>
  /** JSON `Record<string, number>`: a YNAB plan's assigned amounts. Encrypted, being money. */
  plan: string
  total: number
  done: number
  failed: number
  /** Index of the next row to book. */
  cursor: number
  /** Consecutive chunks where every row failed, and where that run started. */
  streak: number
  streak_start: number
  lockedUntil: number
  token?: string
  /** A commit in progress holds this, so two commits can't both write. */
  claimedUntil?: number
  last_error?: string
  /** JSON `ImportSummary`, written at commit. Encrypted: it holds the salary. */
  summary?: string
  created_at: Date
  committed_at?: Date
  finished_at?: Date
  notified_at?: Date
}

export interface Review {
  importId: string
  app: AppId
  filename: string
  direction: Direction
  directionSource: 'column' | 'sign'
  currency: string
  hasCurrency: boolean
  /** `refund`: money back on a spending category, booked as a negative spend. Not in `expense`. */
  counts: { expense: number; refund: number; income: number; from: string; to: string }
  skipped: Partial<Record<SkipReason, number>>
  /** The codes behind `skipped.other_currency`, most rows first. */
  otherCurrencies: string[]
  samples: { date: string; item: string; amount: number; kind: 'expense' | 'income' }[]
  groups: string[]
  categories: { source: string; name: string; group: string; monthly: number }[]
  accounts: { source: string; name: string; type: AccountType }[]
  droppedAccounts: string[]
  salary: { label: string; amount: number; day: number } | null
  budgetTotal: number
  /** Set for a later import: where the history stops, and the envelopes it can land in. */
  later: { cutoff: string | null; categories: string[]; icons: Later['icons'] } | null
}

/** What a later import works against: the date of the budget's first entry and what's already there. */
export interface Later {
  /** Only rows dated before this come in, so nothing is counted twice. Null for a budget with no entries yet. */
  cutoff: string | null
  categories: string[]
  groups: string[]
  /** The icon each envelope and group was given, by name, so the review shows ours rather than a name's emoji. */
  icons: { categories: Record<string, string>; groups: Record<string, string> }
}

/** The budget as a later import sees it, or null while it isn't set up (an onboarding import). */
export async function laterOf(auth: Auth): Promise<Later | null> {
  if (!(await budgetSetUp(auth))) return null
  const first = async (name: string) => {
    const doc = await (await getCollection(name, auth)).find({}, { projection: { date: 1 } }).sort({ date: 1 }).limit(1).next()
    return typeof doc?.date === 'string' && doc.date ? doc.date.slice(0, 10) : null
  }
  const list = async (name: string) => (await (await getCollection(name, auth)).find({}, { projection: { name: 1, icon: 1 } }).sort({ order: 1 }).toArray())
    .map((d) => ({ name: String(d.name), icon: typeof d.icon === 'string' ? d.icon : '' }))
  const iconsOf = (docs: { name: string; icon: string }[]) => Object.fromEntries(docs.filter((d) => d.icon).map((d) => [d.name, d.icon]))
  const dates = (await Promise.all([first('expenses'), first('incomes')])).filter((d): d is string => !!d).sort()
  const categories = (await list('categories')).filter((c) => c.name !== INCOME_CATEGORY)
  const groups = await list('groups')
  return {
    cutoff: dates[0] ?? null,
    categories: categories.map((c) => c.name),
    groups: groups.map((g) => g.name),
    icons: { categories: iconsOf(categories), groups: iconsOf(groups) },
  }
}

/** An import is a bulk change for everyone in a shared budget, so only its owner may run one. The personal budget's role is always owner. */
export function assertOwner(auth: Auth): void {
  if (auth.spaceRole !== 'owner') throw new ImportError('not_owner')
}

/** Rows dated before the cutoff, and how many on or after it were left out. */
export function beforeCutoff<T extends { date: string }>(rows: T[], cutoff: string | null): { kept: T[]; after: number } {
  if (!cutoff) return { kept: rows, after: 0 }
  const kept = rows.filter((r) => r.date < cutoff)
  return { kept, after: rows.length - kept.length }
}

/** The existing envelope a source category lands in, matched by name the way two envelopes collide. */
export function matchCategory(name: string, existing: string[]): string | undefined {
  const key = normalizeItem(name) || name
  return existing.find((e) => (normalizeItem(e) || e) === key)
}

export async function importsCollection(auth: Auth) {
  return getCollection('imports', auth)
}

export function planOf(doc: Pick<ImportDoc, 'plan'>): Record<string, number> {
  return doc.plan ? (JSON.parse(doc.plan) as Record<string, number>) : {}
}

/** Rows as stored: gzipped JSON in base64, so a long history fits one document. */
export function packRows(rows: unknown[]): string {
  return gzipSync(JSON.stringify(rows)).toString('base64')
}

/** `packRows` undone. A doc written before packing holds the plain JSON. */
export function unpackRows<T>(rows: string): T[] {
  return JSON.parse(rows.startsWith('[') ? rows : gunzipSync(Buffer.from(rows, 'base64')).toString('utf8')) as T[]
}

export function storedRows(doc: Pick<ImportDoc, 'rows'>): StoredRow[] {
  return unpackRows<StoredRow>(doc.rows)
}

/** Spends and the latest income: enough for the user to see the direction was read right. */
function samplesOf(rows: StoredRow[]): Review['samples'] {
  const live = rows.filter((r) => r.kind !== 'skipped')
  const income = live.filter((r) => r.kind === 'income').slice(-1)
  const spends = live.filter((r) => r.kind === 'expense' && r.amount > 0).slice(-(3 - income.length))
  return [...spends, ...income]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({ date: r.date, item: r.item, amount: r.amount, kind: r.kind as 'expense' | 'income' }))
}

/** The review payload, computed fresh from the stored rows so a flip or a currency change re-runs every proposal. */
export async function buildReview(auth: Auth, doc: ImportDoc, today: string): Promise<Review> {
  const later = doc.later ? await laterOf(auth) : null
  const resolved = resolveRows(storedRows(doc), { direction: doc.direction, currency: doc.currency, hasCurrency: doc.hasCurrency })
  const otherCurrency = resolved.filter((r) => r.kind === 'skipped').length
  // Other-currency rows stay counted as that, wherever they fall.
  const { kept: live, after } = beforeCutoff(resolved.filter((r) => r.kind !== 'skipped'), later?.cutoff ?? null)
  const others = new Map<string, number>()
  for (const r of resolved) if (r.kind === 'skipped') others.set(r.currency, (others.get(r.currency) ?? 0) + 1)
  const categories = proposeCategories(live)
  const budgets = proposeBudgets(live, categories.sourceOf, today, doc.currency, planOf(doc))
  const names = categories.list.map((c) => c.source)
  const groups = later?.groups.length ? later.groups : STARTER_GROUPS
  // Envelopes a later import already has need no group.
  const toGroup = later ? names.filter((n) => !matchCategory(n, later.categories)) : names
  // AI off, over the allowance or failing: every category lands in the first group and the user regroups.
  const groupsBy = toGroup.length && (await importAiAllowed(auth))
    ? await pickCategoryGroups(toGroup, groups, auth.userId).catch(() => ({} as Record<string, string>))
    : {}
  const { accounts, dropped } = proposeAccounts(live)
  // A later import keeps the budget's own payday and this month's plan.
  const salary = later ? null : detectSalary(live, today)
  const dates = live.map((r) => r.date)
  return {
    importId: String(doc._id),
    app: doc.app,
    filename: doc.filename,
    direction: doc.direction,
    directionSource: doc.directionSource,
    currency: doc.currency,
    hasCurrency: doc.hasCurrency,
    counts: {
      expense: live.filter((r) => r.kind === 'expense' && r.amount > 0).length,
      refund: live.filter((r) => r.kind === 'expense' && r.amount < 0).length,
      income: live.filter((r) => r.kind === 'income').length,
      from: dates[0] ?? '',
      to: dates.at(-1) ?? '',
    },
    skipped: { ...doc.skipped, ...(otherCurrency ? { other_currency: otherCurrency } : {}), ...(after ? { after_start: after } : {}) },
    otherCurrencies: [...others].sort((a, b) => b[1] - a[1]).map(([code]) => code),
    samples: samplesOf(live),
    groups,
    categories: categories.list.map((c) => ({
      source: c.source,
      name: (later && matchCategory(c.source, later.categories)) || c.source,
      group: groupsBy[c.source] ?? groups[0],
      monthly: later ? 0 : budgets[c.source] ?? 0,
    })),
    accounts,
    droppedAccounts: dropped,
    salary: salary && { label: salary.label, amount: salary.amount, day: salary.day },
    budgetTotal: later ? 0 : Object.entries(budgets).filter(([name]) => names.includes(name)).reduce((n, [, v]) => n + v, 0),
    later: later && { cutoff: later.cutoff, categories: later.categories, icons: later.icons },
  }
}

/** Parses an upload, replaces any earlier preview, and returns what the review screen shows. Writes nothing else. */
export async function previewFile(auth: Auth, buf: Buffer, filename: string): Promise<Review> {
  if (buf.length > MAX_UPLOAD_BYTES) throw new ImportError('too_big')
  const today = (await nowForUser(auth.userId)).date
  assertOwner(auth)
  const later = await budgetSetUp(auth)
  const tables = await readTable(buf, filename).catch((e) => {
    throw new ImportError(e instanceof ZipTooLarge ? 'too_big' : 'unreadable')
  })
  const layout = inspect(tables)
  const roles = needsColumnHelp(layout) && (await importAiAllowed(auth))
    ? await pickColumnRoles(unresolvedColumns(layout), auth.userId).catch(() => ({}))
    : {}
  const userCurrency = await getBudgetCurrency(auth)
  const n = normalize(layout, today, roles, userCurrency)
  const rows = packRows(n.rows)
  if (rows.length > MAX_ROWS_BYTES) throw new ImportError('too_big')
  // A bare "$" could be any dollar: a user already on one keeps theirs.
  const anyDollar = n.fileCurrency === 'USD' && !n.hasCurrency && currencyInfo(userCurrency).symbol.endsWith('$')
  // A later import is in the budget's money: rows in any other currency are left out, not converted.
  // Without a currency column that can't be told row by row, so a file that reads as another currency is refused.
  if (later && isCurrencyCode(n.fileCurrency) && n.fileCurrency !== userCurrency && !n.hasCurrency && !anyDollar) throw new ImportError('wrong_currency')
  const currency = !later && isCurrencyCode(n.fileCurrency) && !anyDollar ? n.fileCurrency : userCurrency
  const coll = await importsCollection(auth)
  // A preview is a throwaway copy of the file. A real delete, not the soft
  // one: `imports` isn't archivable, so a soft-deleted blob would never go.
  // Never one a commit is setting up right now, or its final flip finds nothing.
  await coll.purgeMany({ status: 'previewed', $or: [{ claimedUntil: { $exists: false } }, { claimedUntil: { $lte: Date.now() } }] })
  const doc: Omit<ImportDoc, '_id'> = {
    status: 'previewed',
    app: n.app,
    filename: filename.slice(0, 200),
    currency,
    direction: n.defaultDirection,
    directionSource: n.directionSource,
    hasCurrency: n.hasCurrency,
    ...(later ? { later: true } : {}),
    rows,
    skipped: n.skipped,
    plan: JSON.stringify(n.plan),
    total: 0,
    done: 0,
    failed: 0,
    cursor: 0,
    streak: 0,
    streak_start: 0,
    lockedUntil: 0,
    created_at: new Date(),
  }
  const { insertedId } = await coll.insertOne(doc)
  return buildReview(auth, { ...doc, _id: insertedId as ObjectId }, today)
}

export async function loadImport(auth: Auth, importId: string): Promise<ImportDoc> {
  if (!ObjectId.isValid(importId)) throw new ImportError('not_found')
  const doc = await (await importsCollection(auth)).findOne({ _id: new ObjectId(importId) })
  if (!doc) throw new ImportError('not_found')
  return doc as unknown as ImportDoc
}

/** The review again after a flip or a currency change: same stored rows, no re-upload. */
export async function recomputePreview(auth: Auth, importId: string, change: { direction?: unknown; currency?: unknown }): Promise<Review> {
  const doc = await loadImport(auth, importId)
  if (doc.status !== 'previewed') throw new ImportError('not_found')
  const set: Partial<ImportDoc> = {}
  if (change.direction !== undefined) {
    if (change.direction !== 'negative_spend' && change.direction !== 'positive_spend') throw new ImportError('invalid')
    set.direction = change.direction
  }
  if (change.currency !== undefined) {
    if (!isCurrencyCode(change.currency) || doc.later) throw new ImportError('invalid')
    set.currency = change.currency
  }
  // A commit that got there first has moved it on: this review would no longer be what gets written.
  const updated = await (await importsCollection(auth)).updateOne({ _id: doc._id, status: 'previewed' }, { $set: set })
  if (updated.matchedCount !== 1) throw new ImportError('not_found')
  return buildReview(auth, { ...doc, ...set }, (await nowForUser(auth.userId)).date)
}

const ERROR_STATUS: Record<ImportError['code'], number> = {
  too_big: 413, unreadable: 400, empty: 400, empty_file: 400, no_columns: 400, invalid: 400, not_found: 404, already_importing: 409, already_onboarded: 403, busy: 409, not_owner: 403, wrong_currency: 400,
}

/** `{ error: code }` for a known import failure, which the client turns into copy. Anything else rethrows. */
export function importErrorResponse(err: unknown) {
  if (err instanceof ImportError) return json({ error: err.code }, { status: ERROR_STATUS[err.code] })
  throw err
}
