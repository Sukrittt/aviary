import type { ImportReview } from '@/src/api/imports'

/** Every string the import screens build from data. Static copy lives with the screens. */

const n = (x: number) => x.toLocaleString('en-US')
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`

/** "A", "A and B", "A, B and C". */
export function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

const ERRORS: Record<string, string> = {
  too_big: 'That file’s too big. Export a shorter date range and try again.',
  unreadable: 'We couldn’t read that file. Check it’s the transactions export, not a report.',
  no_columns: 'We couldn’t find a date and an amount column. Check the file is the transactions export, not a report.',
  empty: 'There’s nothing to bring in from that file. Its rows are all transfers, zeros or dated in the future.',
  empty_file: 'That file’s empty. Export it again from your app and try once more.',
  pdf: 'That’s a PDF. We need the spreadsheet, so export as csv or Excel instead.',
  image: 'That’s a picture. We need the csv or Excel file your app exports.',
  old_excel: 'That’s an old Excel file (.xls). Open it, save it as .xlsx or .csv, then drop that here.',
  already_importing: 'You’re already bringing in a file. Give it a few minutes and check Home.',
  already_onboarded: 'You’re already set up. Head to Home to keep going.',
  busy: 'We’re still setting you up. Give it a moment and try again.',
  not_found: 'That preview’s expired. Upload your file again.',
  not_owner: 'Only the budget’s owner can bring history into it.',
  wrong_currency: 'That file’s in a different currency from this budget. Bring it into a budget in that currency instead.',
}

/** The written message for a failure code. Anything unknown gets the generic line, never the code itself. */
export function importErrorCopy(code: string): string {
  return ERRORS[code] ?? 'Check your connection and try again.'
}

function monthYear(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** "16 Oct 2026", for the sample rows. */
export function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** "1,240 spends · 14 refunds · 36 paydays · Mar 2019 to Oct 2026", refunds only when there are some. */
export function countsLine(counts: ImportReview['counts']): string {
  const parts = [plural(counts.expense, 'spend', 'spends'), ...(counts.refund ? [plural(counts.refund, 'refund', 'refunds')] : []), plural(counts.income, 'payday', 'paydays')]
  if (counts.from && counts.to) {
    const from = monthYear(counts.from)
    const to = monthYear(counts.to)
    parts.push(from === to ? from : `${from} to ${to}`)
  }
  return parts.join(' · ')
}

/**
 * What we left out, in up to two sentences: the bookkeeping that isn't
 * spending, then the rows we couldn't use. Empty when nothing was skipped.
 */
export function skippedCopy(review: Pick<ImportReview, 'skipped' | 'otherCurrencies'> & { later?: ImportReview['later'] }): string[] {
  const s = review.skipped
  const bookkeeping = [
    s.transfer && plural(s.transfer, 'transfer between your accounts', 'transfers between your accounts'),
    s.opening_balance && plural(s.opening_balance, 'opening balance', 'opening balances'),
    s.fill && plural(s.fill, 'envelope fill', 'envelope fills'),
  ].filter(Boolean) as string[]
  // Other-currency rows may well be spending, just not in this budget's money.
  const unusable = [
    s.other_currency && `${plural(s.other_currency, 'row', 'rows')} in ${listOf(review.otherCurrencies.length ? review.otherCurrencies.slice(0, 3) : ['another currency'])}`,
    s.unparseable && plural(s.unparseable, 'row we couldn’t read', 'rows we couldn’t read'),
    s.future && plural(s.future, 'row dated in the future', 'rows dated in the future'),
    s.zero && plural(s.zero, 'zero amount', 'zero amounts'),
  ].filter(Boolean) as string[]
  const out: string[] = []
  const leftOut = (s.transfer ?? 0) + (s.opening_balance ?? 0) + (s.fill ?? 0)
  if (bookkeeping.length) out.push(`We left out ${listOf(bookkeeping)}. ${leftOut === 1 ? 'It isn’t' : 'They aren’t'} spending.`)
  if (unusable.length) out.push(`We ${bookkeeping.length ? 'also ' : ''}skipped ${listOf(unusable)}.`)
  if (s.after_start && review.later?.cutoff) out.push(`${plural(s.after_start, 'row', 'rows')} from ${cutoffDay(review.later.cutoff)} on stay out, so nothing’s counted twice.`)
  return out
}

export function directionCopy(review: Pick<ImportReview, 'direction' | 'directionSource'>): string {
  if (review.directionSource === 'column') return 'Your file marks which rows are spends and which are paydays, so we’re going by that.'
  return review.direction === 'negative_spend' ? 'We’re reading negative amounts as spends.' : 'We’re reading positive amounts as spends.'
}

export function ordinal(day: number): string {
  const tens = day % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th'
  return `${day}${suffix}`
}

/**
 * Time left at the pace so far. Null until there's a pace worth trusting
 * (15 s in, a row landed) and once it's all in.
 */
export function importEta(done: number, total: number, startedAt: string | null, now = Date.now()): string | null {
  const elapsed = startedAt ? now - Date.parse(startedAt) : NaN
  if (!(elapsed >= 15_000) || done <= 0 || done >= total) return null
  const seconds = ((total - done) * elapsed) / done / 1000
  if (seconds < 60) return 'Almost there'
  const minutes = Math.ceil(seconds / 60)
  return minutes < 60 ? `About ${minutes} min left` : `About ${Math.round(minutes / 60)} hr left`
}

/** The quiet line under the progress: how long, and that nothing waits on it. */
export function bannerSub(eta: string | null): string {
  return [eta, 'Keep using Aviary. We’ll tell you when it’s in.'].filter(Boolean).join(' · ')
}

export function bannerProgress(done: number, total: number): string {
  return `Bringing in your history · ${n(done)} of ${n(total)}`
}

/**
 * What's wrong with a file we can tell from its name and size alone, before
 * uploading it: an empty file, a PDF statement, a photo, an old .xls. Null
 * when it's worth sending.
 */
export function precheckFile(file: { name: string; size: number; type: string }, maxBytes: number): string | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (file.size === 0) return 'empty_file'
  if (file.size > maxBytes) return 'too_big'
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf'
  if (/^(png|jpe?g|heic|heif|webp|gif)$/.test(ext) || file.type.startsWith('image/')) return 'image'
  if (ext === 'xls') return 'old_excel'
  return null
}

/** Files and kilobytes the way a person reads them: "412 KB", "1.2 MB". */
export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** "All 135 spends and paydays are in", honest about rows that didn't make it. */
export function historyDone(total: number, failed: number): string {
  return failed > 0
    ? `${n(total - failed)} of ${plural(total, 'spend and payday', 'spends and paydays')} are in`
    : total === 1 ? 'It’s all in' : `All ${plural(total, 'spend and payday', 'spends and paydays')} are in`
}

/** What the set-me-up button says while the import commits, one step at a time. */
export function commitSteps(envelopes: number, accounts: number, salary: boolean): string[] {
  return [
    // Only the writes this import has: no "Making your 0 envelopes…".
    ...(envelopes ? [`Making your ${plural(envelopes, 'envelope', 'envelopes')}…`] : []),
    ...(accounts ? [`Adding your ${plural(accounts, 'account', 'accounts')}…`] : []),
    ...(salary ? ['Setting up your payday…'] : []),
    'Filling this month’s budget…',
  ]
}

/** "3 Oct", or "3 Oct 2025" when it isn't this year. */
function cutoffDay(date: string, now = new Date()): string {
  const sameYear = date.slice(0, 4) === String(now.getUTCFullYear())
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' })
}

/** Rows a review would bring in: spends, refunds and paydays. */
export function entryCount(counts: ImportReview['counts']): number {
  return counts.expense + (counts.refund ?? 0) + counts.income
}

/** A later import's headline: how much comes in, and why it stops where it does. */
export function laterLine(review: Pick<ImportReview, 'counts' | 'later'>, now = new Date()): string {
  const entries = entryCount(review.counts)
  const cutoff = review.later?.cutoff
  if (!entries) return cutoff ? `Nothing in this file is from before ${cutoffDay(cutoff, now)}, when you started in Aviary.` : 'There’s nothing in this file to bring in.'
  const what = plural(entries, 'entry', 'entries')
  return cutoff ? `We’ll add ${what} from before ${cutoffDay(cutoff, now)}, when you started in Aviary.` : `We’ll add ${what}.`
}

/** One past import in Settings: "Money Manager · 3 Oct 2026 · 2,340 entries". */
export function pastImportLine(app: string | null, committedAt: string | null, total: number): string {
  return [app ?? 'Spreadsheet', committedAt && shortDate(committedAt.slice(0, 10)), plural(total, 'entry', 'entries')].filter(Boolean).join(' · ')
}
