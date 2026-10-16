import { Type } from '@google/genai'
import { json, error, readBody } from '@/lib/http'
import { getAuth, readOnlyGuard } from '@/lib/access'
import { requireAccess } from '@/lib/billing/guard'
import { generateJSONFromImage } from '@/lib/ai/gemini'
import { isRateLimited } from '@/lib/rateLimit'
import { aiDisabledResponse } from '@/lib/systemSettings'
import { aiAllowanceResponse } from '@/lib/ai/allowance'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BURST_WINDOW_MS = 60 * 1000
const BURST_LIMIT = 5
const HOUR_WINDOW_MS = 60 * 60 * 1000
const HOUR_LIMIT = 30
const MAX_CATEGORIES = 100
const MAX_CATEGORY_LEN = 60
// Raw base64 for a 4.5MB image is ~6M chars — this is the wire-body cap, not
// the decoded-bytes cap.
const MAX_IMAGE_LEN = 6_000_000
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface ScanItem {
  name: string
  price: number
  qty: number
}

interface ScanResult {
  merchant: string
  total: number
  category?: string
  items: ScanItem[]
}

export async function POST(req: Request) {
  const auth = await getAuth(req)
  const gate = await requireAccess(auth)
  if (gate) return gate
  const guard = readOnlyGuard(auth, 'POST')
  if (guard) return guard

  const aiOff = await aiDisabledResponse()
  if (aiOff) return aiOff

  const overAllowance = await aiAllowanceResponse(auth)
  if (overAllowance) return overAllowance

  if (
    await isRateLimited(`bill-scan:${auth.userId}`, [
      { windowMs: BURST_WINDOW_MS, limit: BURST_LIMIT },
      { windowMs: HOUR_WINDOW_MS, limit: HOUR_LIMIT },
    ])
  ) {
    return error('rate limited', 429)
  }

  const body = await readBody(req)
  const image = typeof body.image === 'string' ? body.image : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
  const rawCategories = Array.isArray(body.categories) ? body.categories : null

  if (!image || image.length > MAX_IMAGE_LEN) return error('image required (max 4.5MB)')
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) return error('mimeType must be image/jpeg, image/png, or image/webp')
  if (
    !rawCategories ||
    rawCategories.length === 0 ||
    rawCategories.length > MAX_CATEGORIES ||
    !rawCategories.every((c) => typeof c === 'string' && c && c.length <= MAX_CATEGORY_LEN)
  )
    return error('categories must be a non-empty string array')

  const categoryList = rawCategories as string[]

  let result: ScanResult
  try {
    result = await generateJSONFromImage<ScanResult>(
      'This is a photo or screenshot of an Indian retail bill or delivery-app ' +
        '(Blinkit/Instamart/Zomato/Swiggy-style) cart. Extract numeric amounts exactly as printed; do not convert currencies. ' +
        'Extract the merchant name, the grand total, the single ' +
        'best-fit category from the allowed list, and every line item. Report ' +
        'each item\'s post-discount price (what was actually charged for that ' +
        'line, not its pre-discount MRP). Include delivery fee, handling fee, ' +
        'small-cart fee, tip and tax lines as their own items, each with the ' +
        'name as printed on the bill.',
      { data: image, mimeType },
      {
        type: Type.OBJECT,
        properties: {
          merchant: { type: Type.STRING },
          total: { type: Type.NUMBER },
          category: { type: Type.STRING, format: 'enum', enum: categoryList },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                qty: { type: Type.NUMBER },
              },
              required: ['name', 'price', 'qty'],
            },
          },
        },
        required: ['merchant', 'total', 'items'],
      },
      { userId: auth.userId, feature: 'scan' },
      // Under the app's 45s wait, which also covers the upload, so a slow read ends in the 502 below.
      { timeoutMs: 30_000 },
    )
  } catch {
    return error('bill scan failed', 502)
  }

  return json(result)
}
