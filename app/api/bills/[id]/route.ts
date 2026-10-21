import { ObjectId } from 'mongodb'
import { getCollection, json, error } from '@/lib/http'
import { getAuth } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { getBillScanImageUrl } from '@/lib/billScan'

export const dynamic = 'force-dynamic'

/** `GET /api/bills/[id]` — one scan's full detail, items included, plus a signed image URL if the upload finished. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return error('invalid id', 400)

  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const coll = await getCollection('bill_scans', auth)
  const doc = await coll.findOne({ _id: new ObjectId(id) })
  if (!doc) return error('not found', 404)

  const imageUrl =
    doc.image_status === 'ready' && typeof doc.image_ext === 'string'
      ? await getBillScanImageUrl(auth.spaceId, id, doc.image_ext)
      : null

  return json({
    id,
    merchant: String(doc.merchant ?? ''),
    category: String(doc.category ?? ''),
    date: String(doc.date ?? ''),
    total: Number(doc.total) || 0,
    my_share: Number(doc.my_share) || 0,
    people_count: Number(doc.people_count) || 1,
    items: doc.items ?? [],
    expense_id: String(doc.expense_id ?? ''),
    image_status: String(doc.image_status ?? 'pending'),
    image_url: imageUrl,
    created_at: String(doc.created_at ?? ''),
  })
}
