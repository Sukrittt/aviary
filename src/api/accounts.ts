import { apiFetch, apiErrorMessage } from './client'
import type { AccountRow, AccountType, CsvResponse } from '@/src/types'

export class AccountWriteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function send(method: string, body: unknown, fallback: string): Promise<Response> {
  const resp = await apiFetch('/api/accounts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!resp.ok) throw new AccountWriteError(resp.status, await apiErrorMessage(resp, fallback))
  return resp
}

export async function getAccounts(): Promise<AccountRow[]> {
  const resp = await apiFetch('/api/accounts')
  if (!resp.ok) throw new Error(`Failed to load accounts: ${resp.status}`)
  const data: CsvResponse<AccountRow> = await resp.json()
  return data.rows
}

export async function addAccount(input: { name: string; type: AccountType }): Promise<{ id: string }> {
  return (await send('POST', input, 'Failed to add account')).json()
}

export async function updateAccount(id: string, updates: { name?: string; type?: AccountType; archived?: boolean }): Promise<void> {
  await send('PUT', { id, ...updates }, 'Failed to update account')
}
