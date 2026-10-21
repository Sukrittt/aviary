import { json, readBody } from '@/lib/http'
import { budgetSetUp } from '@/lib/spaces'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { ImportError } from '@/lib/import/normalize'
import { importErrorResponse, MAX_UPLOAD_BYTES, previewFile, recomputePreview } from '@/lib/import/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * `POST /api/import/preview`. Multipart with a `file`: parses it and returns
 * the review. JSON `{ importId, direction?, currency? }`: the same review
 * recomputed from the stored rows after a flip or a currency change. Writes
 * nothing but the `imports` doc. Onboarding only, so an account that's set
 * up can't import over its own data.
 */
export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth, { setup: true })
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard
  try {
    if (await budgetSetUp(auth)) throw new ImportError('already_onboarded')

    if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      // Checked before reading the body where the client says its size.
      if (Number(req.headers.get('content-length') ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) throw new ImportError('too_big')
      const form = await req.formData().catch(() => null)
      const file = form?.get('file')
      if (!file || typeof file === 'string') throw new ImportError('invalid')
      if (file.size > MAX_UPLOAD_BYTES) throw new ImportError('too_big')
      return json(await previewFile(auth, Buffer.from(await file.arrayBuffer()), file.name || 'export.csv'))
    }

    const body = await readBody(req)
    if (typeof body.importId !== 'string') throw new ImportError('invalid')
    return json(await recomputePreview(auth, body.importId, { direction: body.direction, currency: body.currency }))
  } catch (err) {
    return importErrorResponse(err)
  }
}
