import { gunzipSync, gzipSync } from 'node:zlib'
import { ObjectId } from 'mongodb'
import type { Auth } from '@/lib/access'
import { getCollection, json } from '@/lib/http'
import { getUserCurrency, nowForUser } from '@/lib/userCurrency'
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

export type ImportStatus = 'previewed' | 'importing' | 'done' | 'failed' | 'cancelled'

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
  const rows = resolveRows(storedRows(doc), { direction: doc.direction, currency: doc.currency, hasCurrency: doc.hasCurrency })
  const live = rows.filter((r) => r.kind !== 'skipped')
  const otherCurrency = rows.length - live.length
  const others = new Map<string, number>()
  for (const r of rows) if (r.kind === 'skipped') others.set(r.currency, (others.get(r.currency) ?? 0) + 1)
  const categories = proposeCategories(live)
  const budgets = proposeBudgets(live, categories.sourceOf, today, doc.currency, planOf(doc))
  const names = categories.list.map((c) => c.source)
  // AI off, over the allowance or failing: every category lands in Essentials and the user regroups.
  const groupsBy = (await importAiAllowed(auth))
    ? await pickCategoryGroups(names, STARTER_GROUPS, auth.userId).catch(() => ({} as Record<string, string>))
    : {}
  const { accounts, dropped } = proposeAccounts(live)
  const salary = detectSalary(live, today)
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
    skipped: { ...doc.skipped, ...(otherCurrency ? { other_currency: otherCurrency } : {}) },
    otherCurrencies: [...others].sort((a, b) => b[1] - a[1]).map(([code]) => code),
    samples: samplesOf(rows),
    groups: STARTER_GROUPS,
    categories: categories.list.map((c) => ({ source: c.source, name: c.source, group: groupsBy[c.source] ?? 'Essentials', monthly: budgets[c.source] ?? 0 })),
    accounts,
    droppedAccounts: dropped,
    salary: salary && { label: salary.label, amount: salary.amount, day: salary.day },
    budgetTotal: Object.entries(budgets).filter(([name]) => names.includes(name)).reduce((n, [, v]) => n + v, 0),
  }
}

/** Parses an upload, replaces any earlier preview, and returns what the review screen shows. Writes nothing else. */
export async function previewFile(auth: Auth, buf: Buffer, filename: string): Promise<Review> {
  if (buf.length > MAX_UPLOAD_BYTES) throw new ImportError('too_big')
  const today = (await nowForUser(auth.userId)).date
  const tables = await readTable(buf, filename).catch((e) => {
    throw new ImportError(e instanceof ZipTooLarge ? 'too_big' : 'unreadable')
  })
  const layout = inspect(tables)
  const roles = needsColumnHelp(layout) && (await importAiAllowed(auth))
    ? await pickColumnRoles(unresolvedColumns(layout), auth.userId).catch(() => ({}))
    : {}
  const userCurrency = await getUserCurrency(auth.userId)
  const n = normalize(layout, today, roles, userCurrency)
  const rows = packRows(n.rows)
  if (rows.length > MAX_ROWS_BYTES) throw new ImportError('too_big')
  // A bare "$" could be any dollar: a user already on one keeps theirs.
  const anyDollar = n.fileCurrency === 'USD' && !n.hasCurrency && currencyInfo(userCurrency).symbol.endsWith('$')
  const currency = isCurrencyCode(n.fileCurrency) && !anyDollar ? n.fileCurrency : userCurrency
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
    if (!isCurrencyCode(change.currency)) throw new ImportError('invalid')
    set.currency = change.currency
  }
  // A commit that got there first has moved it on: this review would no longer be what gets written.
  const updated = await (await importsCollection(auth)).updateOne({ _id: doc._id, status: 'previewed' }, { $set: set })
  if (updated.matchedCount !== 1) throw new ImportError('not_found')
  return buildReview(auth, { ...doc, ...set }, (await nowForUser(auth.userId)).date)
}

const ERROR_STATUS: Record<ImportError['code'], number> = {
  too_big: 413, unreadable: 400, empty: 400, empty_file: 400, no_columns: 400, invalid: 400, not_found: 404, already_importing: 409, already_onboarded: 403, busy: 409,
}

/** `{ error: code }` for a known import failure, which the client turns into copy. Anything else rethrows. */
export function importErrorResponse(err: unknown) {
  if (err instanceof ImportError) return json({ error: err.code }, { status: ERROR_STATUS[err.code] })
  throw err
}
