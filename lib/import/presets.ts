/**
 * What each budgeting app's export looks like. Every table is an alias list,
 * never an exact schema: none of these is published, they come from parser
 * code and help docs (2026-10-17), and apps rename columns between versions.
 * Header names are compared lowercased and trimmed.
 */

export type Role =
  | 'date' | 'amount' | 'outflow' | 'inflow' | 'type' | 'category' | 'subcategory'
  | 'account' | 'note' | 'text' | 'currency' | 'transfer'

export type AppId = 'moneymanager' | 'monefy' | 'wallet' | 'spendee' | 'ynab' | 'goodbudget' | 'generic'

export type SkipReason = 'transfer' | 'opening_balance' | 'fill' | 'other_currency' | 'unparseable' | 'zero' | 'future' | 'after_start'

/** What a preset's bookkeeping tells decided about a row, if anything. */
export type Tell = { skip: SkipReason } | { kind: 'expense' | 'income' } | null

export interface RowFields {
  item: string
  category: string
  /** A raw cell by lowercased header name, for tells on columns no role covers. */
  cell: (header: string) => string
}

export interface Preset {
  id: Exclude<AppId, 'generic'>
  aliases: Partial<Record<Role, string[]>>
  signature: (headers: string[]) => boolean
  tell?: (row: RowFields, signed: number) => Tell
}

export const GENERIC_ALIASES: Record<Role, string[]> = {
  date: ['date', 'transaction date', 'txn date', 'value date', 'posted date', 'posting date', 'booking date', 'period', 'datetime', 'time'],
  amount: ['amount', 'value', 'sum', 'amt', 'transaction amount'],
  outflow: ['debit', 'withdrawal', 'withdrawals', 'outflow', 'paid out', 'money out', 'spent', 'debit amount', 'withdrawal amt.', 'withdrawal amount'],
  inflow: ['credit', 'deposit', 'deposits', 'inflow', 'paid in', 'money in', 'received', 'credit amount', 'deposit amt.', 'deposit amount'],
  text: ['description', 'narration', 'particulars', 'payee', 'merchant', 'name', 'details', 'item', 'title', 'transaction details', 'transaction remarks', 'place'],
  category: ['category', 'category name', 'envelope'],
  subcategory: ['subcategory', 'sub category', 'sub-category'],
  account: ['account', 'accounts', 'wallet', 'bank', 'account name'],
  note: ['note', 'notes', 'memo', 'remarks', 'comment', 'comments'],
  type: ['type', 'transaction type', 'income/expense', 'cr/dr', 'dr/cr', 'cr / dr', 'dr / cr', 'debit/credit', 'credit/debit', 'debit / credit', 'credit / debit', 'd/c', 'c/d', 'direction'],
  currency: ['currency', 'currency code', 'ccy'],
  transfer: ['transfer'],
}

const has = (headers: string[], name: string) => headers.includes(name)

export const PRESETS: Preset[] = [
  {
    id: 'moneymanager',
    aliases: { date: ['date', 'period'], account: ['account', 'accounts'], text: ['note'], note: ['description'], type: ['income/expense'] },
    signature: (h) => has(h, 'income/expense') && has(h, 'category'),
  },
  {
    id: 'monefy',
    aliases: { text: ['description'] },
    signature: (h) => h.filter((x) => x === 'currency').length >= 2 && has(h, 'converted amount'),
    tell: ({ category }) => {
      if (/^(to|from) '.*'$/i.test(category)) return { skip: 'transfer' }
      if (/^initial balance '.*'$/i.test(category)) return { skip: 'opening_balance' }
      return null
    },
  },
  {
    id: 'wallet',
    aliases: { text: ['payee'], note: ['note'], type: ['type'], transfer: ['transfer'] },
    signature: (h) => (has(h, 'ref_currency') || has(h, 'refcurrency')) || ((has(h, 'payment_type') || has(h, 'paymenttype')) && has(h, 'type')),
  },
  {
    id: 'spendee',
    aliases: { account: ['wallet'], category: ['category name'], text: ['note'], type: ['type'] },
    signature: (h) => has(h, 'category name') && has(h, 'wallet') && has(h, 'type'),
  },
  {
    id: 'ynab',
    aliases: { text: ['payee'], category: ['category'], note: ['memo'], outflow: ['outflow'], inflow: ['inflow'] },
    signature: (h) => has(h, 'outflow') && has(h, 'inflow') && has(h, 'payee'),
    tell: ({ cell }) => {
      if (/^transfer : /i.test(cell('payee'))) return { skip: 'transfer' }
      if (/^starting balance$/i.test(cell('payee'))) return { skip: 'opening_balance' }
      return null
    },
  },
  {
    id: 'goodbudget',
    aliases: { category: ['envelope'], text: ['name'], note: ['notes'] },
    signature: (h) => has(h, 'envelope') && has(h, 'details'),
    tell: ({ category, cell }, signed) => {
      if (/^\[unallocated\]$/i.test(category) && signed > 0) return { kind: 'income' }
      if (!category) {
        const said = `${cell('name')} ${cell('details')}`
        if (/transfer/i.test(said)) return { skip: 'transfer' }
        if (/fill/i.test(said)) return { skip: 'fill' }
      }
      return null
    },
  },
]

/** Tells every file shares, after the preset's own. */
export function genericTell({ item, category }: RowFields): Tell {
  if (/^transfers?$/i.test(category)) return { skip: 'transfer' }
  if (/^(initial|opening|starting) balance\b/i.test(category) || /^modified bal/i.test(category) || /^(initial|opening|starting) balance$/i.test(item)) {
    return { skip: 'opening_balance' }
  }
  return null
}

/** A direction column's word, read the same for every app. */
export function typeKind(value: string): 'expense' | 'income' | 'transfer' | null {
  const v = value.trim().toLowerCase()
  if (!v) return null
  if (v.includes('transfer')) return 'transfer'
  if (/^(income|inc\.?|credit|cr\.?|c|deposit|in|inflow|received)$/.test(v)) return 'income'
  if (/^(expense|expenses|exp\.?|debit|dr\.?|d|withdrawal|out|outflow|spent|payment)$/.test(v)) return 'expense'
  return null
}

export function detectPreset(headers: string[]): Preset | null {
  return PRESETS.find((p) => p.signature(headers)) ?? null
}

const KNOWN = new Set([...Object.values(GENERIC_ALIASES).flat(), ...PRESETS.flatMap((p) => Object.values(p.aliases).flat()), 'converted amount', 'details'])

/** A header as the aliases spell it: "Withdrawal Amount (INR )" is "withdrawal amount". */
export const headerName = (cell: string) => cell.trim().toLowerCase().replace(/\s*\(\s*(?:[a-z]{3}|[₹$€£])\s*\)$/, '')

/** How header-like a line is: the number of its cells that any table knows. */
export function headerScore(cells: string[]): number {
  return cells.filter((c) => KNOWN.has(headerName(c))).length
}

/** Column index per role: the preset's aliases first, then the generic ones, one role per column. */
export function mapColumns(headers: string[], preset: Preset | null): Partial<Record<Role, number>> {
  const mapping: Partial<Record<Role, number>> = {}
  const used = new Set<number>()
  const claim = (role: Role, names: string[]) => {
    if (mapping[role] !== undefined) return
    const i = headers.findIndex((h, idx) => !used.has(idx) && names.includes(h))
    if (i >= 0) { mapping[role] = i; used.add(i) }
  }
  if (preset) for (const [role, names] of Object.entries(preset.aliases)) claim(role as Role, names)
  for (const [role, names] of Object.entries(GENERIC_ALIASES)) claim(role as Role, names)
  return mapping
}
