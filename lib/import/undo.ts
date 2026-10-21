import type { Auth } from '@/lib/access'
import { getCollection } from '@/lib/http'
import { withTx } from '@/lib/mongodb'
import { invalidate } from '@/lib/cache'
import { invalidateCategoryMap } from '@/lib/categoryMap'
import { adjustCreditCardEnvelope } from '@/lib/createExpense'
import { bumpExtra } from '@/lib/income'
import { ImportError } from './normalize'
import type { AppId } from './presets'
import { assertOwner, importsCollection, loadImport } from './service'

export interface ImportHistoryItem {
  importId: string
  app: AppId
  status: 'importing' | 'done' | 'failed'
  total: number
  done: number
  failed: number
  committedAt: string | null
}

/** The budget's committed imports, newest first, for Settings' history. Undone ones are gone from it. */
export async function listImports(auth: Auth): Promise<ImportHistoryItem[]> {
  const docs = await (await importsCollection(auth))
    .find({ status: { $in: ['importing', 'done', 'failed'] } }, { projection: { app: 1, status: 1, total: 1, done: 1, failed: 1, committed_at: 1, created_at: 1 }, sort: { created_at: -1 } })
    .limit(50)
    .toArray()
  return docs.map((d) => ({
    importId: String(d._id),
    app: d.app as AppId,
    status: d.status as ImportHistoryItem['status'],
    total: Number(d.total) || 0,
    done: Number(d.done) || 0,
    failed: Number(d.failed) || 0,
    committedAt: d.committed_at ? new Date(d.committed_at as string).toISOString() : null,
  }))
}

const sumBy = (rows: { month: string; amount: number }[]) => {
  const out = new Map<string, number>()
  for (const r of rows) out.set(r.month, (out.get(r.month) ?? 0) + r.amount)
  return out
}

/**
 * Soft-deletes every row an import booked, in one go, and backs out what
 * booking them moved: card spends off the Credit Card envelope, extra
 * paydays off their month's income. The rows go to the Archive like any
 * other delete. Envelopes and accounts it made stay: the user may have used
 * them since. Not while it's still booking: a pass would keep adding rows.
 */
export async function undoImport(auth: Auth, importId: string): Promise<void> {
  assertOwner(auth)
  const doc = await loadImport(auth, importId)
  if (doc.status === 'undone') return
  if (doc.status === 'importing') throw new ImportError('already_importing')
  if (doc.status !== 'done' && doc.status !== 'failed') throw new ImportError('not_found')
  const imports = await importsCollection(auth)
  const expenses = await getCollection('expenses', auth)
  const incomes = await getCollection('incomes', auth)
  await withTx(async (session) => {
    const flipped = await imports.updateOne({ _id: doc._id, status: { $in: ['done', 'failed'] } }, { $set: { status: 'undone', undone_at: new Date() } }, { session })
    if (flipped.matchedCount !== 1) throw new ImportError('busy')
    const spends = await expenses.find({ import_id: importId }, { projection: { date: 1, amount_inr: 1, payment_method: 1 }, session }).toArray()
    const pays = await incomes.find({ import_id: importId, counted: 'extra' }, { projection: { date: 1, amount: 1 }, session }).toArray()
    await expenses.deleteMany({ import_id: importId }, { session })
    await incomes.deleteMany({ import_id: importId }, { session })
    const card = sumBy(spends.filter((e) => e.payment_method === 'credit_card').map((e) => ({ month: String(e.date).slice(0, 7), amount: Number(e.amount_inr) || 0 })))
    for (const [month, amount] of card) await adjustCreditCardEnvelope(auth, month, -amount, session)
    const extra = sumBy(pays.map((i) => ({ month: String(i.date).slice(0, 7), amount: Number(i.amount) || 0 })))
    for (const [month, amount] of extra) await bumpExtra(auth, month, -amount, session)
  })
  for (const tag of ['expenses', 'wrapped', 'incomes', 'budgets']) invalidate(tag, auth.spaceId)
  invalidateCategoryMap(auth.spaceId)
}
