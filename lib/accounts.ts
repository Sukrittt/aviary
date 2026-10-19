import { ObjectId, type ClientSession } from 'mongodb'
import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import { invalidate } from '@/lib/cache'
import { nowForUser } from '@/lib/userCurrency'
import { MAX_ACCOUNTS as MAX_BALANCE_ACCOUNTS } from '@/lib/balanceCheck'

/**
 * Accounts are labels: a name and a type, nothing else. No running balance,
 * no transfers. An expense or income can point at one by `account_id`, and an
 * expense's `payment_method` is derived from its account's type, so the
 * Credit Card envelope, the balance check and habits keep reading the field
 * they already read. The weekly balance check is what knows real balances.
 */

export const ACCOUNT_TYPES = ['bank', 'cash', 'credit_card'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** The balance check asks about every bank account, and it takes 5. */
export const MAX_BANK_ACCOUNTS = MAX_BALANCE_ACCOUNTS
export const MAX_ACCOUNTS = 10
export const MAX_ACCOUNT_NAME = 30

export const ACCOUNT_HEADERS = ['name', 'type', 'archived', 'created_at']

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value)
}

export function paymentMethodFor(type: AccountType): 'bank' | 'cash' | 'credit_card' {
  return type
}

/** A validated `{ name, type }`, or null. With `partial`, either may be missing. */
export function parseAccountInput(raw: Record<string, unknown>, partial = false): { name?: string; type?: AccountType } | null {
  const out: { name?: string; type?: AccountType } = {}
  if (raw.name !== undefined || !partial) {
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name || name.length > MAX_ACCOUNT_NAME) return null
    out.name = name
  }
  if (raw.type !== undefined || !partial) {
    if (!isAccountType(raw.type)) return null
    out.type = raw.type
  }
  return out
}

/** Why one more live account of `type` can't be added, or null. */
export function accountLimitError(live: Record<string, unknown>[], type: AccountType): string | null {
  if (live.length >= MAX_ACCOUNTS) return `You can have up to ${MAX_ACCOUNTS} accounts.`
  if (type === 'bank' && live.filter((a) => a.type === 'bank').length >= MAX_BANK_ACCOUNTS) {
    return `You can have up to ${MAX_BANK_ACCOUNTS} bank accounts.`
  }
  return null
}

export function accountRow(doc: Record<string, unknown>) {
  return {
    id: String(doc._id),
    name: String(doc.name ?? ''),
    type: String(doc.type ?? 'bank'),
    archived: doc.archived === true || doc.archived === 'true',
    created_at: String(doc.created_at ?? ''),
  }
}

export class AccountError extends Error {}

/** Why an account can't be created: a name already taken, or a cap reached. The message is user copy. */
export class AccountWriteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export const sameAccountName = (a: unknown, b: string) => String(a ?? '').trim().toLowerCase() === b.toLowerCase()

/** The one way an account is created. Lifted out of `POST /api/accounts` so the import commit shares it. Returns its id. */
export async function createAccount(auth: Auth, input: { name: string; type: AccountType }): Promise<string> {
  const coll = await getCollection('accounts', auth)
  const live = await coll.find({ archived: { $ne: true } }).toArray()
  // `name` is encrypted, so uniqueness is checked here rather than by an index.
  if (live.some((a) => sameAccountName(a.name, input.name))) throw new AccountWriteError(409, 'An account with this name already exists.')
  const limit = accountLimitError(live, input.type)
  if (limit) throw new AccountWriteError(409, limit)
  const { timestamp } = await nowForUser(auth.userId)
  const inserted = await coll.insertOne({ name: input.name, type: input.type, archived: false, created_at: timestamp })
  invalidate('accounts', auth.userId)
  return String(inserted.insertedId)
}

/**
 * The live account an expense or income points at. Throws `AccountError` for
 * an id that isn't one of the user's live accounts. Archived accounts can't
 * take new rows, but rows already on them keep their label.
 */
export async function liveAccount(auth: Auth, id: string, session?: ClientSession): Promise<{ id: string; type: AccountType }> {
  if (!ObjectId.isValid(id)) throw new AccountError('invalid account')
  const coll = await getCollection('accounts', auth)
  const doc = await coll.findOne({ _id: new ObjectId(id) }, { session })
  if (!doc || doc.archived === true) throw new AccountError('account not found')
  return { id, type: isAccountType(doc.type) ? doc.type : 'bank' }
}

/**
 * Names of the live bank accounts, oldest first: what the balance check asks
 * about. Null when the user has never made an account, so the check keeps
 * asking about the names they typed; once they have, archived ones drop out
 * even if that leaves none.
 */
export async function bankAccountNames(auth: Auth): Promise<string[] | null> {
  const coll = await getCollection('accounts', auth)
  const docs = await coll.find({}).sort({ created_at: 1 }).toArray()
  if (docs.length === 0) return null
  return docs.filter((d) => d.type === 'bank' && d.archived !== true).map((d) => String(d.name ?? '')).filter(Boolean)
}
