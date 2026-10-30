import { findHeaderRow, type Table } from './read'
import { defaultDirection, detectDateOrder, detectDecimalComma, drCrMarker, parseAmount, parseDate, type Direction } from './parse'
import { CURRENCIES, isCurrencyCode } from '@/src/lib/currencies'
import { detectPreset, genericTell, headerName, headerScore, mapColumns, typeKind, type AppId, type Preset, type Role, type RowFields, type SkipReason } from './presets'

const MAX_ITEM = 200
const MAX_NOTES = 300
const MAX_LABEL = 100

export type ImportErrorCode = 'too_big' | 'unreadable' | 'empty' | 'empty_file' | 'no_columns' | 'not_found' | 'already_importing' | 'already_onboarded' | 'busy' | 'invalid' | 'not_owner' | 'wrong_currency'

/** A failure the client turns into written copy. The code is the whole message. */
export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code)
  }
}

/**
 * A row ready to book. `kind` is as read under `negative_spend`; `bySign`
 * marks the rows whose direction came only from the amount's sign, which are
 * the ones a flip on review turns around. `byAmount` marks every row whose
 * direction came from the amount (its sign or its column) rather than a type
 * column, the ones `resolveRows` may read as a refund. Skipped rows aren't
 * stored, only counted, except `other_currency`, which depends on the
 * currency the user confirms and so is decided by `resolveRows`.
 */
export type StoredRow = {
  kind: 'expense' | 'income' | 'skipped'
  date: string
  amount: number
  item: string
  category: string
  subcategory: string
  account: string
  notes: string
  currency: string
  bySign?: true
  byAmount?: true
  skipReason?: SkipReason
}

export type Mapping = Partial<Record<Role, number>>

export interface Layout {
  table: Table
  headerIndex: number
  headers: string[]
  preset: Preset | null
  mapping: Mapping
  plan: Table | null
}

export interface Normalized {
  app: AppId
  rows: StoredRow[]
  skipped: Partial<Record<SkipReason, number>>
  defaultDirection: Direction
  directionSource: 'column' | 'sign'
  hasCurrency: boolean
  /** The file's own currency: the most common code on its rows, else the one its amounts' symbols name, else ''. */
  fileCurrency: string
  /** YNAB's Plan.csv: this month's assigned amount per category. */
  plan: Record<string, number>
}

// Symbols that name one currency ("$", "€", "R$"), plus the "Rs" Indian banks print. Bare letters like ZAR's "R" are too vague.
const SYMBOLS = new Map<string, string>([
  ...CURRENCIES.filter((c) => c.symbol !== c.code && !/^[A-Za-z]+$/.test(c.symbol)).map((c) => [c.symbol, c.code] as [string, string]),
  ['Rs', 'INR'], ['Rs.', 'INR'],
])

/** The one currency every marked amount shows ("$1,500.00", "12.50 GBP"), or '' when none do or they disagree. */
function symbolCurrency(cells: string[]): string {
  const found = new Set<string>()
  for (const cell of cells.slice(0, 500)) {
    const mark = cell.replace(drCrMarker(cell)?.[0] ?? '', '').match(/[^\d\s.,\-+()−]+/)?.[0]
    if (!mark) continue
    const upper = mark.toUpperCase()
    found.add(SYMBOLS.get(mark) ?? (isCurrencyCode(upper) ? upper : '?'))
  }
  return found.size === 1 && !found.has('?') ? [...found][0] : ''
}

const lower = (cells: string[]) => cells.map(headerName)
const isPlan = (headers: string[]) => headers.includes('month') && headers.includes('assigned')

/** Finds the transactions table and its header line, and maps what it can by name. */
export function inspect(tables: Table[]): Layout {
  let best: Omit<Layout, 'plan'> | null = null
  let bestScore = -1
  let plan: Table | null = null
  for (const table of tables) {
    const headerIndex = findHeaderRow(table.rows, headerScore)
    const headers = lower(table.rows[headerIndex] ?? [])
    if (isPlan(headers)) {
      plan = { name: table.name, rows: table.rows.slice(headerIndex) }
      continue
    }
    const score = headerScore(headers)
    if (score > bestScore) {
      const preset = detectPreset(headers)
      best = { table, headerIndex, headers, preset, mapping: mapColumns(headers, preset) }
      bestScore = score
    }
  }
  if (!best) throw new ImportError('unreadable')
  return { ...best, plan }
}

const hasAmount = (m: Mapping) => m.amount !== undefined || m.outflow !== undefined || m.inflow !== undefined

/** Whether name matching left date, amount or every text column unplaced. */
export function needsColumnHelp(layout: Layout): boolean {
  const m = layout.mapping
  return m.date === undefined || !hasAmount(m) || (m.text === undefined && m.category === undefined && m.note === undefined)
}

/** The headers no role claimed, with three sample values each, for Jev. Values clipped to 40 characters. */
export function unresolvedColumns(layout: Layout): { index: number; name: string; samples: string[] }[] {
  const claimed = new Set(Object.values(layout.mapping))
  const data = layout.table.rows.slice(layout.headerIndex + 1)
  const raw = layout.table.rows[layout.headerIndex] ?? []
  return raw
    .map((name, index) => ({
      index,
      name: name.trim().slice(0, 40),
      samples: data.map((r) => (r[index] ?? '').trim()).filter(Boolean).slice(0, 3).map((s) => s.slice(0, 40)),
    }))
    .filter((c) => !claimed.has(c.index) && c.name)
}

function readPlan(plan: Table | null, today: string, threeDecimals: boolean): Record<string, number> {
  if (!plan) return {}
  const headers = lower(plan.rows[0] ?? [])
  const col = (name: string) => headers.indexOf(name)
  const [month, category, assigned] = [col('month'), col('category'), col('assigned')]
  if (month < 0 || category < 0 || assigned < 0) return {}
  const out: Record<string, number> = {}
  const decimalComma = detectDecimalComma(plan.rows.slice(1).map((r) => r[assigned] ?? ''), threeDecimals)
  for (const row of plan.rows.slice(1)) {
    const date = parseDate(`1 ${row[month] ?? ''}`, 'dmy') ?? parseDate(row[month] ?? '', 'dmy')
    const amount = parseAmount(row[assigned] ?? '', decimalComma)
    const name = (row[category] ?? '').trim()
    if (date?.slice(0, 7) === today.slice(0, 7) && name && amount !== null) out[name] = amount
  }
  return out
}

/**
 * Every row of the file as a `StoredRow` or a counted skip, oldest first.
 * `roles` are Jev's placements for columns `needsColumnHelp` couldn't name.
 * `userCurrency` stands in when the file doesn't say which currency it's in.
 */
export function normalize(layout: Layout, today: string, roles: Record<number, Role> = {}, userCurrency = ''): Normalized {
  const mapping: Mapping = { ...layout.mapping }
  for (const [index, role] of Object.entries(roles)) if (mapping[role] === undefined) mapping[role] = Number(index)
  if (mapping.date === undefined || !hasAmount(mapping)) throw new ImportError('no_columns')

  const headers = layout.headers
  const data = layout.table.rows.slice(layout.headerIndex + 1)
  if (!data.some((r) => r.some((c) => c.trim()))) throw new ImportError('empty_file')
  const at = (row: string[], role: Role) => (mapping[role] === undefined ? '' : (row[mapping[role]!] ?? '').trim())
  const amountCells = data.flatMap((r) => (['amount', 'outflow', 'inflow'] as const).map((role) => at(r, role))).filter(Boolean)
  const header = layout.table.rows[layout.headerIndex] ?? []
  // "Withdrawal Amount (INR )": the currency headerName left out of the column's name.
  const headerCurrency = symbolCurrency((['amount', 'outflow', 'inflow'] as const).map((role) => (mapping[role] === undefined ? '' : header[mapping[role]!]?.match(/\(([^)]*)\)\s*$/)?.[1].trim() ?? '')).filter(Boolean))
  const likely = data.map((r) => at(r, 'currency').toUpperCase()).find(isCurrencyCode) || symbolCurrency(amountCells) || headerCurrency || userCurrency
  const threeDecimals = isCurrencyCode(likely) && new Intl.NumberFormat('en', { style: 'currency', currency: likely }).resolvedOptions().maximumFractionDigits === 3
  const decimalComma = detectDecimalComma(amountCells, threeDecimals)
  const dateOrder = detectDateOrder(data.map((r) => at(r, 'date')))
  const twoColumns = mapping.amount === undefined
  // Banks fill the unused side of a debit/credit pair with a dash or NA.
  const moneyCell = (row: string[], role: Role) => (/^(?:[-–—]+|n\/?a|nil)$/i.test(at(row, role)) ? '' : at(row, role))

  const rows: StoredRow[] = []
  const signs: number[] = []
  const skipped: Partial<Record<SkipReason, number>> = {}
  const skip = (reason: SkipReason) => { skipped[reason] = (skipped[reason] ?? 0) + 1 }

  for (const row of data) {
    const date = parseDate(at(row, 'date'), dateOrder)
    let signed: number | null
    if (twoColumns) {
      const out = moneyCell(row, 'outflow') ? parseAmount(moneyCell(row, 'outflow'), decimalComma) : 0
      const inn = moneyCell(row, 'inflow') ? parseAmount(moneyCell(row, 'inflow'), decimalComma) : 0
      signed = out === null || inn === null ? null : Math.round((Math.abs(inn) - Math.abs(out)) * 100) / 100
    } else {
      signed = parseAmount(at(row, 'amount'), decimalComma)
    }
    if (!date || date < '2000-01-01' || signed === null) { skip('unparseable'); continue }
    if (date > today) { skip('future'); continue }

    const category = at(row, 'category').slice(0, MAX_LABEL)
    const subcategory = at(row, 'subcategory').slice(0, MAX_LABEL)
    const text = at(row, 'text')
    const note = at(row, 'note')
    const item = (text || note || subcategory || category).slice(0, MAX_ITEM)
    const fields: RowFields = { item, category, cell: (name) => (row[headers.indexOf(name)] ?? '').trim() }
    const tell = layout.preset?.tell?.(fields, signed) ?? genericTell(fields)
    if (tell && 'skip' in tell) { skip(tell.skip); continue }
    if (/^(true|yes|1)$/i.test(at(row, 'transfer'))) { skip('transfer'); continue }
    const typed = typeKind(at(row, 'type'))
    if (typed === 'transfer') { skip('transfer'); continue }
    if (signed === 0) { skip('zero'); continue }

    const decided = tell?.kind ?? typed
    // A written Dr or Cr says which way the money went, as a second amount column does, so no flip on review turns it around.
    const kind = decided ?? (twoColumns || drCrMarker(at(row, 'amount')) ? (signed > 0 ? 'income' : 'expense') : null)
    const currency = at(row, 'currency').toUpperCase()
    const stored: StoredRow = {
      kind: kind ?? (signed < 0 ? 'expense' : 'income'),
      date,
      amount: Math.abs(signed),
      item,
      category,
      subcategory,
      account: at(row, 'account').slice(0, MAX_LABEL),
      notes: (text ? note : '').slice(0, MAX_NOTES),
      currency: /^[A-Z]{3}$/.test(currency) ? currency : '',
    }
    if (!decided) stored.byAmount = true
    if (!kind) {
      stored.bySign = true
      // A payday is money in whatever its sign, so it votes that its sign means
      // income: a file of nothing but salary rows isn't read as spending.
      signs.push(INCOME_CATEGORY.test(category) ? -signed : signed)
    }
    rows.push(stored)
  }

  if (!rows.length && !Object.keys(skipped).some((r) => r !== 'unparseable')) throw new ImportError('unreadable')
  // Read fine, but every row was a transfer, a zero or in the future: a review of nothing helps no one.
  if (!rows.length) throw new ImportError('empty')
  // Stable: rows sharing a date keep the file's order.
  rows.sort((a, b) => a.date.localeCompare(b.date))
  const codes = new Map<string, number>()
  for (const r of rows) if (r.currency) codes.set(r.currency, (codes.get(r.currency) ?? 0) + 1)
  return {
    app: layout.preset?.id ?? 'generic',
    rows,
    skipped,
    defaultDirection: defaultDirection(signs, false),
    directionSource: signs.length ? 'sign' : 'column',
    hasCurrency: mapping.currency !== undefined,
    fileCurrency: [...codes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (symbolCurrency(amountCells) || headerCurrency),
    plan: readPlan(layout.plan, today, threeDecimals),
  }
}

const INCOME_CATEGORY = /salary|income|inflow|ready to assign|payroll|paycheck/i

/**
 * The rows as the user confirmed them: sign-read rows turned for
 * `positive_spend`, other currencies skipped, and money in on a spending
 * category (one the file spends from) a refund: a negative spend there, the
 * way the app books one, not income.
 */
export function resolveRows(rows: StoredRow[], o: { direction: Direction; currency: string; hasCurrency: boolean }): StoredRow[] {
  const turned = rows.map((r): StoredRow => {
    if (o.hasCurrency && r.currency && r.currency !== o.currency) return { ...r, kind: 'skipped', skipReason: 'other_currency' }
    if (o.direction === 'positive_spend' && r.bySign && r.kind !== 'skipped') return { ...r, kind: r.kind === 'expense' ? 'income' : 'expense' }
    return r
  })
  const spending = new Set(turned.filter((r) => r.kind === 'expense').map((r) => r.category.toLowerCase()))
  return turned.map((r) =>
    r.kind === 'income' && r.byAmount && r.category && spending.has(r.category.toLowerCase()) && !INCOME_CATEGORY.test(r.category)
      ? { ...r, kind: 'expense', amount: -r.amount }
      : r,
  )
}
