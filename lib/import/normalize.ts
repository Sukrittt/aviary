import { findHeaderRow, type Table } from './read'
import { defaultDirection, detectDateOrder, detectDecimalComma, parseAmount, parseDate, type Direction } from './parse'
import { detectPreset, genericTell, headerScore, mapColumns, typeKind, type AppId, type Preset, type Role, type RowFields, type SkipReason } from './presets'

export const MAX_ROWS = 20_000
const MAX_ITEM = 200
const MAX_NOTES = 300

export type ImportErrorCode = 'too_big' | 'unreadable' | 'no_columns' | 'not_found' | 'already_importing' | 'already_onboarded' | 'busy' | 'invalid'

/** A failure the client turns into written copy. The code is the whole message. */
export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code)
  }
}

/**
 * A row ready to book. `kind` is as read under `negative_spend`; `bySign`
 * marks the rows whose direction came only from the amount's sign, which are
 * the ones a flip on review turns around. Skipped rows aren't stored, only
 * counted, except `other_currency`, which depends on the currency the user
 * confirms and so is decided by `resolveRows`.
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
  droppedOverCap: number
  defaultDirection: Direction
  directionSource: 'column' | 'sign'
  hasCurrency: boolean
  /** The file's own currency: the most common code on its rows, or '' without a currency column. */
  fileCurrency: string
  /** YNAB's Plan.csv: this month's assigned amount per category. */
  plan: Record<string, number>
}

const lower = (cells: string[]) => cells.map((c) => c.trim().toLowerCase())
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

function readPlan(plan: Table | null, today: string): Record<string, number> {
  if (!plan) return {}
  const headers = lower(plan.rows[0] ?? [])
  const col = (name: string) => headers.indexOf(name)
  const [month, category, assigned] = [col('month'), col('category'), col('assigned')]
  if (month < 0 || category < 0 || assigned < 0) return {}
  const out: Record<string, number> = {}
  const decimalComma = detectDecimalComma(plan.rows.slice(1).map((r) => r[assigned] ?? ''))
  for (const row of plan.rows.slice(1)) {
    const date = parseDate(`1 ${row[month] ?? ''}`, 'dmy') ?? parseDate(row[month] ?? '', 'dmy')
    const amount = parseAmount(row[assigned] ?? '', decimalComma)
    const name = (row[category] ?? '').trim()
    if (date?.slice(0, 7) === today.slice(0, 7) && name && amount !== null) out[name] = amount
  }
  return out
}

/**
 * Every row of the file as a `StoredRow` or a counted skip, oldest first,
 * capped at `MAX_ROWS` (newest kept). `roles` are Jev's placements for
 * columns `needsColumnHelp` couldn't name.
 */
export function normalize(layout: Layout, today: string, roles: Record<number, Role> = {}): Normalized {
  const mapping: Mapping = { ...layout.mapping }
  for (const [index, role] of Object.entries(roles)) if (mapping[role] === undefined) mapping[role] = Number(index)
  if (mapping.date === undefined || !hasAmount(mapping)) throw new ImportError('no_columns')

  const headers = layout.headers
  const data = layout.table.rows.slice(layout.headerIndex + 1)
  const at = (row: string[], role: Role) => (mapping[role] === undefined ? '' : (row[mapping[role]!] ?? '').trim())
  const amountCells = data.flatMap((r) => (['amount', 'outflow', 'inflow'] as const).map((role) => at(r, role))).filter(Boolean)
  const decimalComma = detectDecimalComma(amountCells)
  const dateOrder = detectDateOrder(data.map((r) => at(r, 'date')))
  const twoColumns = mapping.amount === undefined

  const rows: StoredRow[] = []
  const signs: number[] = []
  const skipped: Partial<Record<SkipReason, number>> = {}
  const skip = (reason: SkipReason) => { skipped[reason] = (skipped[reason] ?? 0) + 1 }

  for (const row of data) {
    const date = parseDate(at(row, 'date'), dateOrder)
    let signed: number | null
    if (twoColumns) {
      const out = at(row, 'outflow') ? parseAmount(at(row, 'outflow'), decimalComma) : 0
      const inn = at(row, 'inflow') ? parseAmount(at(row, 'inflow'), decimalComma) : 0
      signed = out === null || inn === null ? null : Math.round((Math.abs(inn) - Math.abs(out)) * 100) / 100
    } else {
      signed = parseAmount(at(row, 'amount'), decimalComma)
    }
    if (!date || date < '2000-01-01' || signed === null) { skip('unparseable'); continue }
    if (date > today) { skip('future'); continue }

    const category = at(row, 'category')
    const subcategory = at(row, 'subcategory')
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

    const kind = tell?.kind ?? typed ?? (twoColumns ? (signed > 0 ? 'income' : 'expense') : null)
    const currency = at(row, 'currency').toUpperCase()
    const stored: StoredRow = {
      kind: kind ?? (signed < 0 ? 'expense' : 'income'),
      date,
      amount: Math.abs(signed),
      item,
      category,
      subcategory,
      account: at(row, 'account'),
      notes: (text ? note : '').slice(0, MAX_NOTES),
      currency: /^[A-Z]{3}$/.test(currency) ? currency : '',
    }
    if (!kind) {
      stored.bySign = true
      signs.push(signed)
    }
    rows.push(stored)
  }

  if (!rows.length && !Object.keys(skipped).some((r) => r !== 'unparseable')) throw new ImportError('unreadable')
  // Stable: rows sharing a date keep the file's order.
  rows.sort((a, b) => a.date.localeCompare(b.date))
  const kept = rows.slice(-MAX_ROWS)
  const codes = new Map<string, number>()
  for (const r of kept) if (r.currency) codes.set(r.currency, (codes.get(r.currency) ?? 0) + 1)
  return {
    app: layout.preset?.id ?? 'generic',
    rows: kept,
    skipped,
    droppedOverCap: rows.length - kept.length,
    defaultDirection: defaultDirection(signs, false),
    directionSource: signs.length ? 'sign' : 'column',
    hasCurrency: mapping.currency !== undefined,
    fileCurrency: [...codes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    plan: readPlan(layout.plan, today),
  }
}

/** The rows as the user confirmed them: sign-read rows turned for `positive_spend`, other currencies skipped. */
export function resolveRows(rows: StoredRow[], o: { direction: Direction; currency: string; hasCurrency: boolean }): StoredRow[] {
  return rows.map((r) => {
    if (o.hasCurrency && r.currency && r.currency !== o.currency) return { ...r, kind: 'skipped', skipReason: 'other_currency' }
    if (o.direction === 'positive_spend' && r.bySign && r.kind !== 'skipped') return { ...r, kind: r.kind === 'expense' ? 'income' : 'expense' }
    return r
  })
}
