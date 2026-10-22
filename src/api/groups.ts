import { apiFetch, apiErrorMessage } from './client'

export async function getGroups(): Promise<string[]> {
  const resp = await apiFetch('/api/groups')
  if (!resp.ok) throw new Error(`Failed to load groups: ${resp.status}`)
  return resp.json()
}

export type GroupRow = { name: string; icon?: string; color?: string }

/** Each group with its picked icon and colour, if any. */
export async function getGroupRows(): Promise<GroupRow[]> {
  const resp = await apiFetch('/api/groups?icons=1')
  if (!resp.ok) throw new Error(`Failed to load groups: ${resp.status}`)
  return resp.json()
}

export async function addGroup(name: string, style: { icon?: string; color?: string } = {}): Promise<void> {
  const resp = await apiFetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...style }),
  })
  if (!resp.ok) throw new Error(await apiErrorMessage(resp, 'Failed to add group'))
}

export async function updateGroup(name: string, updates: { newName?: string; icon?: string; color?: string }): Promise<void> {
  const resp = await apiFetch('/api/groups', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...updates }),
  })
  if (!resp.ok) throw new Error(await apiErrorMessage(resp, 'Failed to update group'))
}

export async function deleteGroup(name: string): Promise<void> {
  const resp = await apiFetch('/api/groups', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) throw new Error(`Failed to delete group: ${resp.status}`)
}

export async function moveGroup(name: string, toIndex: number): Promise<void> {
  const resp = await apiFetch('/api/groups/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, toIndex }),
  })
  if (!resp.ok) throw new Error(`Failed to move group: ${resp.status}`)
}
