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
  role: BudgetRole
  ownerId: string
  currencyCode: string
  personal: boolean
  members: { userId: string; name: string | null; avatarUrl: string | null; role: BudgetRole; joinedAt: string | null }[]
}

export interface BudgetList {
  budgets: BudgetSummary[]
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
  emoji: string
  currencyCode: string
  copyCategories: boolean
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
