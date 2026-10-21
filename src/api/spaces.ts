// Budgets ("spaces" on the server): list, create, rename, switch, and move an
// expense between them. Not to be confused with ./budgets, which is a
// category's monthly assigned money.
import { apiFetch, HttpError, setBudgetCookie } from './client'
import type { CategoryRow } from '@/src/types'

export type BudgetRole = 'owner' | 'member'

/** Twin of lib/spaces.ts's BudgetSummary, which imports server-only code. */
export interface BudgetSummary {
  id: string
  name: string
  emoji: string
  /** A category catalog key. Missing from servers before icons: resolve it with budgetIconKey. */
  icon?: string
  role: BudgetRole
  ownerId: string
  currencyCode: string
  personal: boolean
  members: BudgetMember[]
  /** A shared budget whose owner's plan lapsed: readable and exportable, no writes. */
  readOnly?: boolean
}

export interface BudgetMember {
  userId: string
  name: string | null
  avatarUrl: string | null
  role: BudgetRole
  joinedAt: string | null
  /** Owner's view only: their plan isn't active, so the budget would lock if handed to them. */
  lapsed?: boolean
}

/** A budget its owner deleted in the last 30 days. Only the owner can restore it. */
export interface DeletedBudget { id: string; name: string; emoji: string; icon?: string; deletedAt: string; deletedBy: string | null; canRestore: boolean }

export interface BudgetList {
  budgets: BudgetSummary[]
  deleted?: DeletedBudget[]
  count: number
  limit: number
  /** null when the cookie names a budget this person can't open. */
  activeId: string | null
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * Switch budgets. A full reload rather than clearing caches: every query,
 * every page's local state and the currency all belong to the old budget.
 */
export function switchBudget(budget: Pick<BudgetSummary, 'id' | 'personal'>): void {
  setBudgetCookie(budget.personal ? null : budget.id)
  window.location.reload()
}

export async function getBudgets(): Promise<BudgetList> {
  const resp = await apiFetch('/api/spaces')
  if (!resp.ok) throw new HttpError(resp.status, `Failed to load budgets: ${resp.status}`)
  return resp.json()
}

export interface NewBudget {
  name: string
  icon: string
  currencyCode: string
  copyCategories: boolean
  /** Start empty, to be set up by the history import (ImportFlow) once it's the active budget. */
  import?: boolean
}

/** Throws HttpError; 409 means the limit's reached. */
export async function createBudget(body: NewBudget): Promise<BudgetSummary> {
  const resp = await apiFetch('/api/spaces', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
  if (!resp.ok) throw new HttpError(resp.status, `Failed to create budget: ${resp.status}`)
  return resp.json()
}

/** Another budget's categories, pinned by header so the cookie still decides everything else. */
export async function getBudgetCategories(budgetId: string): Promise<CategoryRow[]> {
  const resp = await apiFetch('/api/categories', { headers: { 'x-aviary-budget': budgetId } })
  if (!resp.ok) throw new HttpError(resp.status, `Failed to load categories: ${resp.status}`)
  return resp.json()
}

/** Throws HttpError: 400 the category's gone there, 404 deleted, 409 changed elsewhere, 403 not a member. */
export async function moveExpense(body: { id: string; version: number; to: string; category: string }): Promise<{ ok: true; id: string; version: number }> {
  const resp = await apiFetch('/api/expenses/move', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
  if (!resp.ok) throw new HttpError(resp.status, `Failed to move expense: ${resp.status}`)
  return resp.json()
}

/** Throws an HttpError whose message is the server's `{error}` code (FULL, EXPIRED…), for callers to map to copy. */
async function fail(resp: Response): Promise<never> {
  const body = await resp.json().catch(() => null)
  throw new HttpError(resp.status, typeof body?.error === 'string' ? body.error : String(resp.status))
}

const send = (method: string, body?: unknown): RequestInit =>
  body === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(body) }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await apiFetch(path, init)
  if (!resp.ok) return fail(resp)
  return resp.json()
}

export interface Invite { code: string; url: string; expiresAt: string }
export interface MembersInfo { members: BudgetMember[]; role: BudgetRole; notifyOthers: boolean; invites: Invite[] }

export const getMembers = (id: string) => call<MembersInfo>(`/api/spaces/${id}/members`)
/** 409 FULL at 6 people. */
export const createInvite = (id: string) => call<Invite>(`/api/spaces/${id}/invites`, send('POST'))
export const cancelInvite = (id: string, code: string) => call<unknown>(`/api/spaces/${id}/invites/${code}`, send('DELETE'))
/** `'me'` leaves; the owner passes someone else's id to remove them. */
export const removeMember = (id: string, userId: string) => call<unknown>(`/api/spaces/${id}/members/${userId}`, send('DELETE'))
export const setNotifyOthers = (id: string, notifyOthers: boolean) => call<unknown>(`/api/spaces/${id}/members/me`, send('PATCH', { notifyOthers }))
export const renameBudget = (id: string, name: string) => call<BudgetSummary>(`/api/spaces/${id}`, send('PATCH', { name }))
/** 400 INVALID when the typed name doesn't match. */
export const deleteBudget = (id: string, confirmName: string) => call<unknown>(`/api/spaces/${id}`, send('DELETE', { confirmName }))
export const restoreBudget = (id: string) => call<unknown>(`/api/spaces/${id}/restore`, send('POST'))
/** Gone for good, data and all. Only for one that's already deleted. */
export const purgeBudget = (id: string) => call<unknown>(`/api/spaces/${id}/purge`, send('POST'))
/** Owner only: `to` becomes the owner (and payer); you stay as a member. 400 INVALID for the personal budget or a non-member. */
export const transferBudget = (id: string, to: string) => call<unknown>(`/api/spaces/${id}/transfer`, send('POST', { to }))

/** A shared budget you own, with the others in it: account deletion asks who gets each one. */
export interface OwnedSharedBudget { id: string; name: string; emoji: string; icon?: string; personal: boolean; members: { userId: string; name: string | null; joinedAt?: string | null }[] }
export const getSharedBudgets = () => call<{ budgets: OwnedSharedBudget[] }>('/api/user/shared-budgets')

export type InvitePreview =
  | { status: 'ok' | 'expired' | 'cancelled' | 'accepted'; budget: { id: string; name: string; emoji: string; icon?: string }; inviter: string | null; members: number }
  | { status: 'not_found' }

/** Public. A 404 is just `not_found`. */
export async function previewInvite(code: string): Promise<InvitePreview> {
  const resp = await apiFetch(`/api/join/${encodeURIComponent(code)}`)
  if (resp.status === 404) return { status: 'not_found' }
  if (!resp.ok) return fail(resp)
  return resp.json()
}

/** Errors: 409 LIMIT_REACHED or FULL, 410 EXPIRED, 404 NOT_FOUND, 401 signed out. */
export const joinBudget = (code: string) => call<{ spaceId: string; already: boolean }>(`/api/join/${encodeURIComponent(code)}`, send('POST'))
