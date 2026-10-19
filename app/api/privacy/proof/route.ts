import { json, getCollection } from '@/lib/http'
import { getAuth, spaceGuard } from '@/lib/access'
import { ENCRYPTED_FIELDS } from '@/lib/encryptedFields'

export const dynamic = 'force-dynamic'

const SAMPLE_MAX_LEN = 40

/** Truncates a stored value (plaintext or `enc:v1:…` ciphertext) for display, never the raw bytes. */
function truncate(value: unknown): string {
  const s = value == null ? '' : String(value)
  return s.length > SAMPLE_MAX_LEN ? `${s.slice(0, SAMPLE_MAX_LEN)}…` : s
}

/**
 * Proof-of-encryption for the account/security screen: the caller's own most
 * recent expense, exactly as stored — encrypted fields still `enc:v1:…`,
 * plaintext fields (date, category, payment_method) still readable. `fields`
 * is read straight from `lib/encryptedFields.ts` so the UI list can never
 * drift from what's actually encrypted.
 */
export async function GET(req: Request) {
  const auth = await getAuth(req)
  const denied = spaceGuard(auth)
  if (denied) return denied
  const coll = await getCollection('expenses', auth)
  const doc = await coll.findOneRaw({}, { sort: { _id: -1 } })

  return json({
    fields: ENCRYPTED_FIELDS.expenses,
    sample: doc
      ? Object.fromEntries(
          Object.entries(doc)
            .filter(([key]) => !['_id', 'user_id', 'deleted_at', 'client_id'].includes(key))
            .map(([key, value]) => [key, truncate(value)]),
        )
      : null,
  })
}
