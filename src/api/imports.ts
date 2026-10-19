import { apiFetch } from './client'
import type { Review } from '@/lib/import/service'
import type { CommitEdits, CommitResult } from '@/lib/import/commit'

export type ImportReview = Review
export type { CommitEdits, CommitResult }

export type ImportStatus =
  | { status: 'none' }
  | {
      importId: string
      status: 'importing' | 'done' | 'failed'
      done: number
      total: number
      failed: number
      startedAt: string | null
      finishedAt: string | null
      leased: boolean
    }

/**
 * Why an import call failed, as a code the screen turns into its own copy.
 * `network` covers anything without one (a timeout, a 500, no connection):
 * the server's text never reaches the user.
 */
export class ImportFailure extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

// Upload plus parse, or a commit's setup writes, can outlast the default 15 s.
const SLOW_MS = 60_000

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let resp: Response
  try {
    resp = await apiFetch(path, { signal: AbortSignal.timeout(SLOW_MS), ...init })
  } catch {
    throw new ImportFailure('network')
  }
  if (resp.ok) return resp.json() as Promise<T>
  const body = await resp.json().catch(() => null) as { error?: unknown } | null
  throw new ImportFailure(typeof body?.error === 'string' && resp.status < 500 ? body.error : 'network')
}

const jsonInit = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function previewImport(file: File): Promise<ImportReview> {
  const form = new FormData()
  form.append('file', file)
  return call('/api/import/preview', { method: 'POST', body: form })
}

export function recomputeImport(importId: string, change: { direction?: string; currency?: string }): Promise<ImportReview> {
  return call('/api/import/preview', jsonInit({ importId, ...change }))
}

export function commitImport(importId: string, edits: CommitEdits): Promise<CommitResult> {
  return call('/api/import/commit', jsonInit({ importId, ...edits }))
}

export async function getImportStatus(): Promise<ImportStatus> {
  const resp = await apiFetch('/api/import/status')
  if (!resp.ok) throw new Error(`Failed to load import status: ${resp.status}`)
  return resp.json()
}

export function continueImport(importId: string, retry = false): Promise<unknown> {
  return call('/api/import/continue', jsonInit({ importId, ...(retry ? { retry: true } : {}) }))
}
