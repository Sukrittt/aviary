import { assetLinks } from '@/lib/appLinks'

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(assetLinks(), { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
