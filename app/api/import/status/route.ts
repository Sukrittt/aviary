import { json } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { importsCollection, type ImportDoc } from '@/lib/import/service'

export const dynamic = 'force-dynamic'

/** `GET /api/import/status`: the account's committed import, for the backfill banner, or `{ status: 'none' }`. */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  // Setup too: onboarding's done screen polls and continues the import before the trial starts.
  const gate = await requireAccess(auth, { setup: true })
  if (gate) return gate
  const doc = (await (await importsCollection(auth)).findOne(
    { status: { $in: ['importing', 'done', 'failed'] } },
    // Never the rows: the banner polls this every few seconds.
    { projection: { rows: 0 }, sort: { created_at: -1 } },
  )) as unknown as Omit<ImportDoc, 'rows'> | null
  if (!doc) return json({ status: 'none' })
  return json({
    importId: String(doc._id),
    status: doc.status,
    done: doc.done,
    total: doc.total,
    failed: doc.failed,
    skipped: doc.skipped,
    startedAt: doc.committed_at ?? null,
    finishedAt: doc.finished_at ?? null,
    leased: Number(doc.lockedUntil ?? 0) > Date.now(),
  })
}
