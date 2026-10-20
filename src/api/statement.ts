import { apiFetch } from './client'
import { allowanceHit } from './ai'

export interface StatementItem {
  /** The row's client_id: a hash of its date, amount and payee. */
  id: string
  item: string
  amount: number
  date: string
  /** '' when neither history nor Jev was sure. */
  category: string
  /** Why it starts unchecked, if it does. */
  suggestSkip: 'logged' | 'before_last' | null
}

export interface StatementProposal {
  id: string
  items: StatementItem[]
  credits: number
  dropped: number
}

/** What went wrong, already worded for the user. */
export class StatementFailure extends Error {}

const COPY: Record<string, string> = {
  pdf_locked: "That PDF has a password. Download the statement as Excel or CSV from net banking and upload that instead.",
  unreadable: "Couldn't read that one. Try a CSV or Excel statement, or a screenshot of your payments.",
  empty: "Couldn't find any payments from the last month in that.",
  too_big: "That's too big to upload. Try fewer screenshots or a shorter date range.",
  other_currency: "This statement's in a different currency from your budget. Try one from your main account.",
}
const RATE_LIMITED = "That's a lot of uploads in a row. Give it a minute and try again."
const ALLOWANCE = "You've used this month's AI reads. Add these by hand for now."
const GENERIC = 'Check your connection and try again.'

/** Up to five screenshots as `{ data, mimeType }`, or one csv, xlsx or pdf file. 60s, like the server. */
export async function readStatement(input: { images: { data: string; mimeType: string }[] } | { file: File }): Promise<StatementProposal> {
  let body: BodyInit
  let headers: HeadersInit | undefined
  if ('file' in input) {
    const form = new FormData()
    form.append('file', input.file, input.file.name)
    body = form
  } else {
    body = JSON.stringify(input)
    headers = { 'Content-Type': 'application/json' }
  }
  let resp: Response
  try {
    resp = await apiFetch('/api/expenses/statement', { method: 'POST', headers, body, signal: AbortSignal.timeout(60_000) })
  } catch {
    throw new StatementFailure(GENERIC)
  }
  if (resp.ok) return resp.json()
  if (await allowanceHit(resp, 'statement')) throw new StatementFailure(ALLOWANCE)
  if (resp.status === 429) throw new StatementFailure(RATE_LIMITED)
  // The platform turns away a body past 4.5MB before the route sees it, with no JSON code.
  if (resp.status === 413) throw new StatementFailure(COPY.too_big)
  const code = ((await resp.json().catch(() => null)) as { error?: unknown } | null)?.error
  throw new StatementFailure((typeof code === 'string' && COPY[code]) || GENERIC)
}
