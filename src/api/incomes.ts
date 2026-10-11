import { apiFetch, apiErrorMessage } from './client'
import type { CsvResponse, IncomeRow, RecurringIncomeRow } from '@/src/types'

/** A one-off that lands in this month's Ready to Assign (Web/lib/income.ts). */
export interface IncomeInput {
  amount: number
  label: string
  date?: string
  notes?: string
  account_id?: string
  client_id?: string
}

export interface RecurringIncomeInput {
  label: string
  amount: string
  frequency: string
  /** The first payday. */
  start_date: string
  end_date?: string
  account_id?: string
}

export class IncomeWriteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function send(path: string, method: string, body: unknown, fallback: string): Promise<Response> {
  const resp = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!resp.ok) throw new IncomeWriteError(resp.status, await apiErrorMessage(resp, fallback))
  return resp
}

export async function getIncomes(from?: string): Promise<IncomeRow[]> {
  const resp = await apiFetch(`/api/incomes${from ? `?from=${encodeURIComponent(from)}` : ''}`)
  if (!resp.ok) throw new Error(`Failed to load income: ${resp.status}`)
  const data: CsvResponse<IncomeRow> = await resp.json()
  return data.rows
}

export async function addIncome(input: IncomeInput): Promise<{ id: string }> {
  return (await send('/api/incomes', 'POST', input, 'Failed to add income')).json()
}

export async function updateIncome(id: string, version: number, updates: Partial<IncomeInput>): Promise<void> {
  await send('/api/incomes', 'PUT', { id, version, ...updates }, 'Failed to update income')
}

export async function deleteIncome(id: string, version: number): Promise<void> {
  await send('/api/incomes', 'DELETE', { id, version }, 'Failed to delete income')
}

export async function getRecurringIncomes(): Promise<RecurringIncomeRow[]> {
  const resp = await apiFetch('/api/recurring-incomes')
  if (!resp.ok) throw new Error(`Failed to load recurring income: ${resp.status}`)
  const data: CsvResponse<RecurringIncomeRow> = await resp.json()
  return data.rows
}

export async function addRecurringIncome(input: RecurringIncomeInput): Promise<void> {
  await send('/api/recurring-incomes', 'POST', input, 'Failed to add recurring income')
}

export async function updateRecurringIncome(id: string, updates: Partial<RecurringIncomeInput> & { status?: string }): Promise<void> {
  await send('/api/recurring-incomes', 'PUT', { id, ...updates }, 'Failed to update recurring income')
}

export async function deleteRecurringIncome(id: string): Promise<void> {
  await send('/api/recurring-incomes', 'DELETE', { id }, 'Failed to delete recurring income')
}
