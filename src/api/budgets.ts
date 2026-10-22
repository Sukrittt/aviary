import { apiFetch } from './client'
import type { BudgetRow, CsvResponse } from '@/src/types'
import type { Carry } from '@/src/lib/envelope'
import { BudgetWriteError } from '@/src/lib/budgetConflict'

export async function getBudgets(): Promise<BudgetRow[]> {
  const resp = await apiFetch('/api/budgets')
  if (!resp.ok) throw new Error(`Failed to load budgets: ${resp.status}`)
  const data: CsvResponse<BudgetRow> = await resp.json()
  return data.rows
}

/** What earlier months left behind for `month`. See lib/budgetCarry.ts. */
export async function getCarry(month: string): Promise<Carry> {
  const resp = await apiFetch(`/api/budgets/carry?month=${month}`)
  if (!resp.ok) throw new Error(`Failed to load carry: ${resp.status}`)
  return resp.json()
}

export async function addBudget(
  row: Omit<BudgetRow, 'rolled_over' | 'version'> & { rolled_over?: string },
): Promise<void> {
  const resp = await apiFetch('/api/budgets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...row, rolled_over: row.rolled_over ?? '0' }),
  })
  if (!resp.ok) throw new Error(`Failed to add budget: ${resp.status}`)
}

export async function updateBudget(
  month: string,
  category: string,
  updates: Partial<BudgetRow & { newCategory?: string }>,
  version: number,
): Promise<void> {
  const resp = await apiFetch('/api/budgets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, category, version, ...updates }),
  })
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}))
    throw new BudgetWriteError(resp.status, detail.error ?? `Failed to update budget: ${resp.status}`, detail.current)
  }
}

/** Moves money between envelopes (or from Ready to Assign) in one server-side transaction. */
export async function transferBudget(
  month: string,
  to: string,
  sources: { category: string; amount: number }[],
): Promise<void> {
  const resp = await apiFetch('/api/budgets/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, to, sources }),
  })
  if (!resp.ok) throw new Error(`Failed to transfer budget: ${resp.status}`)
}

export async function deleteBudget(month: string, category: string): Promise<void> {
  const resp = await apiFetch('/api/budgets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, category }),
  })
  if (!resp.ok) throw new Error(`Failed to delete budget: ${resp.status}`)
}
