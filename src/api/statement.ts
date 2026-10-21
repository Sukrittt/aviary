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

/** What went wrong, already worded for the user, with a short title to sit over it. */
export class StatementFailure extends Error {
  /** The server's code when it sent one (pdf_locked and pdf_password_wrong ask for the password), or rate_limited or offline: worth trying again as is. */
  constructor(message: string, readonly title = "That didn't go through", readonly code?: string) {
    super(message)
  }
}

const COPY: Record<string, string> = {
  pdf_locked: 'That PDF has a password. Type it in to open it.',
  pdf_password_wrong: "That didn't open it, try again.",
  pdf_no_text: "That PDF is a scan, so there's no text to read. Try screenshots of your payments instead.",
  unreadable: "Couldn't read that one. Try a CSV or Excel statement, or a screenshot of your payments.",
  empty: "Couldn't find any payments from the last month in that.",
  too_big: "That's too big to upload. Try fewer screenshots or a shorter date range.",
  other_currency: "These payments are in a different currency from your budget, so nothing was added. Try a statement or screenshot from the account you budget in.",
}
const TITLE: Record<string, string> = {
  pdf_locked: 'That PDF is locked',
  pdf_password_wrong: 'Wrong password',
  pdf_no_text: "That's a scan",
  unreadable: 'Hard to read, that one',
  empty: 'No payments in there',
  too_big: "That's a big one",
  other_currency: 'Different currency',
}
const RATE_LIMITED = "That's a lot of uploads in a row. Give it a minute and try again."
const ALLOWANCE = "You've used this month's AI reads. Add these by hand for now."
const GENERIC = 'Check your connection and try again.'

/** Up to five screenshots as `{ data, mimeType }`, or one csv, xlsx or pdf file, with a locked pdf's password. 60s, like the server. */
export async function readStatement(input: { images: { data: string; mimeType: string }[] } | { file: File; password?: string }): Promise<StatementProposal> {
  let body: BodyInit
  let headers: HeadersInit | undefined
  if ('file' in input) {
    const form = new FormData()
    form.append('file', input.file, input.file.name)
    if (input.password) form.append('password', input.password)
    body = form
  } else {
    body = JSON.stringify(input)
    headers = { 'Content-Type': 'application/json' }
  }
  let resp: Response
  try {
    resp = await apiFetch('/api/expenses/statement', { method: 'POST', headers, body, signal: AbortSignal.timeout(60_000) })
  } catch {
    throw new StatementFailure(GENERIC, "Couldn't reach Aviary", 'offline')
  }
  if (resp.ok) return resp.json()
  if (await allowanceHit(resp, 'statement')) throw new StatementFailure(ALLOWANCE, "That's this month's AI reads")
  if (resp.status === 429) throw new StatementFailure(RATE_LIMITED, 'One moment', 'rate_limited')
  // The platform turns away a body past 4.5MB before the route sees it, with no JSON code.
  if (resp.status === 413) throw new StatementFailure(COPY.too_big, TITLE.too_big)
  const code = ((await resp.json().catch(() => null)) as { error?: unknown } | null)?.error
  const known = typeof code === 'string' && COPY[code] ? code : null
  throw new StatementFailure(known ? COPY[known] : GENERIC, known ? TITLE[known] : undefined, known ?? undefined)
}
